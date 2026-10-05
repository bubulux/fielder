import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { Shot } from "../api";
import { useApp } from "../appState";
import { useOnline } from "../net";
import { store, usePref } from "../storage";
import { ActionBar, AppHeader, BORDER, Button, Empty, IconButton, makeStyles, num, RADIUS, SideBySide, Skeleton, type, useLayoutSize, useRefreshControl, useToastOffset } from "../ui";
import { EditTagsSheet } from "../components/EditTagsSheet";
import { PhotoStrip } from "../components/PhotoStrip";
import { FRAME_MODES, FrameModeSeg, type FrameMode } from "../components/ShotFrame";
import { FullPhoto, MoreSheet, ShotPhoto, ShotSummary, useShotActions } from "../components/ShotParts";

/** Portrait decision bar: Prev · n of m · Next, then Archive | Approve. */
const BAR_H = 10 + 52 + 8 + 52 + 12 + 2;

/**
 * Unreviewed shots of the active project, oldest first, one at a time: photo first, the decision
 * pinned at the thumb. Approve/Archive take the shot out; the next one takes its position (no
 * skip). Edit opens the same tag editor as Tag; Delete lives in ⋯ with Archive as the safe choice.
 */
export function Review() {
  const s = useStyles();
  const app = useApp();
  const online = useOnline();
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = usePref<FrameMode>("reviewMode.v1", "mask", FRAME_MODES);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [sheet, setSheet] = useState<"edit" | "more" | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Follow the shot, not the position; when it leaves the queue stay at the same position. */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const { shots, error, refreshing, load } = app.shots;
  const { setState } = useShotActions();
  const [box, onBox] = useLayoutSize();
  useToastOffset(portrait ? BAR_H : 0);

  const queue = useMemo(() => (shots ?? []).filter((x) => x.state === "unreviewed").sort((a, b) => a.captured_at.localeCompare(b.captured_at)), [shots]);
  const found = queue.findIndex((x) => x.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex, queue.length - 1);
  const current: Shot | null = index >= 0 ? queue[index] : null;
  useEffect(() => { if (current && current.id !== currentId) setCurrentId(current.id); setLastIndex(Math.max(0, index)); }, [current?.id, index]);
  useEffect(() => { setPhotoIndex(0); }, [current?.id]);
  const go = (delta: number) => { const nx = queue[index + delta]; if (nx) setCurrentId(nx.id); };
  const decide = async (state: Shot["state"]) => {
    if (!current || busy) return;
    setBusy(true);
    try { await setState(current, state); } finally { setBusy(false); }
  };

  const header = <AppHeader offlineMeta="Decisions need the server. The loaded queue stays browsable." />;
  const refresh = useRefreshControl(refreshing, () => void load());

  if (error && !shots) {
    return (
      <View style={s.root}>{header}
        <ScrollView refreshControl={refresh}>
          <Empty icon="cloud-alert" title="Couldn't load the review queue" body={`${error}. Queued uploads are safe on the phone.`}>
            <Button icon="refresh" label="Try again" onPress={() => void load()} />
          </Empty>
        </ScrollView>
      </View>
    );
  }
  if (!shots) {
    return (
      <View style={s.root}>{header}
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton style={{ height: Math.min(width * 0.75, 262), marginHorizontal: -16, borderRadius: 0 }} />
          <Skeleton style={{ height: 48, borderRadius: RADIUS.pill }} />
          <Skeleton style={{ height: 24, width: "70%" }} />
          <Skeleton style={{ height: 18, width: "50%" }} />
          <Skeleton style={{ height: 18, width: "60%" }} />
        </View>
      </View>
    );
  }
  if (!current) {
    const approved = shots.filter((x) => x.state === "approved").length;
    const archived = shots.filter((x) => x.state === "archived").length;
    return (
      <View style={s.root}>{header}
        <ScrollView refreshControl={refresh}>
          <Empty icon="check-all" title="Nothing to review" body={shots.length ? `${approved} approved · ${archived} archived in ${app.project?.name ?? "this project"}. New shots show up here after they upload.` : "New shots show up here after they upload."}>
            {shots.length > 0 && <Button kind="secondary" icon="view-grid-outline" label="Browse shots" onPress={() => { store.savePref("shotsFilter.v1", "all"); app.setShotsView("grid"); app.setTab("shots"); }} />}
          </Empty>
        </ScrollView>
      </View>
    );
  }

  const photo = current.photos[Math.min(photoIndex, current.photos.length - 1)];
  const disabled = busy || !online;
  const nav = (big: boolean) => (
    <View style={s.navRow}>
      {big ? <Button style={{ flex: 1 }} kind="secondary" icon="chevron-left" label="Prev" onPress={() => go(-1)} disabled={index === 0} />
        : <IconButton icon="chevron-left" label="Previous shot" size={52} onPress={() => go(-1)} disabled={index === 0} />}
      <Text style={s.pos}>{index + 1} of {queue.length}</Text>
      {big ? <Button style={{ flex: 1 }} kind="secondary" icon="chevron-right" label="Next" onPress={() => go(1)} disabled={index === queue.length - 1} />
        : <IconButton icon="chevron-right" label="Next shot" size={52} onPress={() => go(1)} disabled={index === queue.length - 1} />}
    </View>
  );
  const decisions = (
    <SideBySide>
      <Button style={{ flex: 1 }} kind="archive" icon="archive-outline" label="Archive" onPress={() => void decide("archived")} disabled={disabled} />
      <Button style={{ flex: 1 }} kind="approve" icon="check" label="Approve" onPress={() => void decide("approved")} disabled={disabled} />
    </SideBySide>
  );
  const tools = (
    <SideBySide>
      <IconButton icon="pencil-outline" label="Edit details" size={52} onPress={() => setSheet("edit")} disabled={!online} />
      <IconButton icon="dots-horizontal" label="More" size={52} onPress={() => setSheet("more")} />
    </SideBySide>
  );
  const summary = (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ flex: 1 }}><ShotSummary shot={current} photo={photo} /></View>
      {tools}
    </View>
  );
  const sheets = (
    <>
      <EditTagsSheet shot={current} visible={sheet === "edit"} onClose={() => setSheet(null)} />
      <MoreSheet shot={current} photo={photo} visible={sheet === "more"} onClose={() => setSheet(null)} />
      {full && <FullPhoto shot={current} index={photoIndex} mode={mode} onMode={setMode} settings={app.settings} onClose={() => setFull(false)} />}
    </>
  );

  if (!portrait) {
    return (
      <View style={[s.root, { flexDirection: "row" }]}>
        <View style={{ flex: 1 }} onLayout={onBox}>
          {box.width > 0 && <ShotPhoto shot={current} index={photoIndex} mode={mode} settings={app.settings} maxW={box.width} maxH={box.height} onNext={() => go(1)} onPrev={() => go(-1)} onOpen={() => setFull(true)} />}
          <View style={s.floatMode}><FrameModeSeg value={mode} onChange={setMode} /></View>
        </View>
        <View style={s.side}>
          <PhotoStrip shot={current} index={photoIndex} onPick={setPhotoIndex} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }} refreshControl={refresh}>{summary}</ScrollView>
          <View style={s.sideBar}>{nav(false)}{decisions}</View>
        </View>
        {sheets}
      </View>
    );
  }
  return (
    <View style={s.root}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} refreshControl={refresh}>
        <ShotPhoto shot={current} index={photoIndex} mode={mode} settings={app.settings} maxW={width} maxH={Math.min(width * 0.75, 262)} onNext={() => go(1)} onPrev={() => go(-1)} onOpen={() => setFull(true)} />
        <View style={{ paddingHorizontal: 12 }}><PhotoStrip shot={current} index={photoIndex} onPick={setPhotoIndex} /></View>
        <View style={s.body}>
          <FrameModeSeg block value={mode} onChange={setMode} />
          {summary}
        </View>
      </ScrollView>
      <ActionBar style={{ flexDirection: "column", paddingTop: 10 }}>{nav(true)}{decisions}</ActionBar>
      {sheets}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  body: { padding: 16, gap: 16 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pos: { ...type("body", "bold"), color: c.text, ...num, minWidth: 72, textAlign: "center" },
  floatMode: { position: "absolute", left: 8, bottom: 8, padding: 4, borderRadius: RADIUS.pill, backgroundColor: c.chromeBg, borderWidth: BORDER.badge, borderColor: c.chromeBorder },
  side: { width: 292, backgroundColor: c.surface, borderLeftWidth: BORDER.control, borderLeftColor: c.border },
  sideBar: { gap: 8, padding: 12, borderTopWidth: BORDER.control, borderTopColor: c.border },
}));
