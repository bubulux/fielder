import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { api, type Shot } from "../api";
import { PhotoStrip } from "../components/PhotoStrip";
import { FrameModeSeg, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { TagsForm } from "../components/TagsForm";
import { Button, Empty, Icon, StateMarker } from "../components/ui";
import { makeStyles, num, RADIUS, type, useTheme } from "../theme";
import { ensureLocation } from "../namedSync";
import { store } from "../storage";
import type { LocationEntry, Settings, ShotTags } from "../types";
import { photoCountLabel, placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

interface Props {
  settings: Settings;
  data: ReturnType<typeof useShots>;
  locations: LocationEntry[];
  onLocations: (l: LocationEntry[]) => void;
  countAt: (locationId: string) => number;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

/** Unreviewed shots one at a time, oldest first, with prev/next. Approve or Archive (both keep the photos); details are edited in place. */
export function Review({ settings, data, locations, onLocations, countAt }: Props) {
  const r = useStyles();
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("mask");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  /** Follow the shot, not the position; when it leaves the queue (approved/archived) stay at the same position. */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const { shots, error, update, remove } = data;

  const queue = useMemo(
    () => (shots ?? []).filter((s) => s.state === "unreviewed").sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [shots],
  );
  const found = queue.findIndex((s) => s.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex, queue.length - 1);
  const current = index >= 0 ? queue[index] : null;
  useEffect(() => { if (current && current.id !== currentId) setCurrentId(current.id); setLastIndex(Math.max(0, index)); }, [current?.id, index]);
  useEffect(() => { setPhotoIndex(0); setEditing(false); }, [current?.id]);
  const go = (delta: number) => { const n = queue[index + delta]; if (n) setCurrentId(n.id); };

  async function setState(shot: Shot, state: Shot["state"]) {
    setBusy(true);
    try { update(await api.patchShot(shot.id, { state })); } catch (e) { Alert.alert("Update failed", String(e)); } finally { setBusy(false); }
  }
  async function saveTags(shot: Shot, tags: ShotTags, newLoc: LocationEntry | null) {
    setBusy(true);
    try {
      if (newLoc) {
        const id = await ensureLocation(newLoc);
        onLocations([...locations.filter((l) => l.id !== newLoc.id && l.id !== id), { ...newLoc, id, synced: true }]);
        tags = { ...tags, location_id: id };
      }
      update(await api.patchShot(shot.id, tags));
      setEditing(false);
    } catch (e) { Alert.alert("Save failed", String(e)); } finally { setBusy(false); }
  }
  const del = (shot: Shot) =>
    Alert.alert("Delete shot", "Removes the images and their metadata permanently. Archive keeps them.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteShot(shot.id); remove(shot.id); } catch (e) { Alert.alert("Delete failed", String(e)); } } },
    ]);

  if (error) return <View style={r.root}><Empty icon="cloud-alert" title="Could not load" body={error} /></View>;
  if (!shots) return <View style={r.root}><Empty loading title="Loading shots…" /></View>;
  if (!current) return <View style={r.root}><Empty icon="check-all" title="Nothing to review" body="New shots show up here after they are uploaded." /></View>;

  const photo = current.photos[Math.min(photoIndex, current.photos.length - 1)];
  const photoWidth = portrait ? width - 32 : Math.min(width * 0.55, height * 1.25);
  const photoView = (
    <View style={{ alignItems: "center" }}>
      <ShotFrame photo={photo} width={photoWidth} settings={settings} mode={mode} style={{ borderRadius: RADIUS.sm }} />
      <PhotoStrip shot={current} index={photoIndex} onPick={setPhotoIndex} />
      <View style={{ marginTop: 8 }}><FrameModeSeg value={mode} onChange={setMode} /></View>
    </View>
  );
  const info = editing ? (
    <View style={{ flex: 1 }}>
      <TagsForm
        initial={{ name: current.name, light: current.light, artificial: current.artificial, weather: current.weather, int_ext: current.int_ext, location_id: current.location_id, extra: current.extra }}
        locations={locations}
        countAt={countAt}
        fields={store.fieldsForProject(current.project_id)}
        submitLabel="Save"
        onSubmit={(t, l) => void saveTags(current, t, l)}
        onCancel={() => setEditing(false)}
        busy={busy}
      />
    </View>
  ) : (
    <View style={{ flex: 1 }}>
      <Text style={r.title}>{shotTitle(current)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}><StateMarker state={current.state} /><Text style={r.line}>{placeLabel(current) || "No location"}</Text></View>
      {!!tagsLabel(current) && <Text style={r.dim}>{tagsLabel(current)}</Text>}
      <Text style={r.dim}>{rigLabel(photo)}</Text>
      <Text style={[r.dim, num]}>{[fmt(current.captured_at), photoCountLabel(current)].filter(Boolean).join(" · ")}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Button label="Archive" icon="archive-outline" kind="archive" onPress={() => void setState(current, "archived")} disabled={busy} /></View>
        <View style={{ flex: 1 }}><Button label="Approve" icon="check" kind="approve" onPress={() => void setState(current, "approved")} disabled={busy} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 2 }}><Button label="Edit details" icon="pencil-outline" kind="ghost" onPress={() => setEditing(true)} /></View>
        <View style={{ flex: 1 }}><Button label="Delete" icon="delete-outline" kind="danger" onPress={() => del(current)} /></View>
      </View>
    </View>
  );

  return (
    <View style={r.root}>
      <View style={r.bar}>
        <NavButton dir={-1} disabled={index === 0} onPress={() => go(-1)} />
        <Text style={r.barTitle}>{index + 1} / {queue.length} to review</Text>
        <NavButton dir={1} disabled={index === queue.length - 1} onPress={() => go(1)} />
      </View>
      {portrait ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>{photoView}{info}</ScrollView>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", padding: 16, gap: 16 }}>
          {photoView}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }} style={{ flex: 1 }}>{info}</ScrollView>
        </View>
      )}
    </View>
  );
}

/** Big Prev/Next in the top bar: outlined, dashed when there is nothing that way. */
function NavButton({ dir, disabled, onPress }: { dir: -1 | 1; disabled: boolean; onPress: () => void }) {
  const r = useStyles();
  const { c } = useTheme();
  const fg = disabled ? c.textDisabled : c.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={dir < 0 ? "Previous shot" : "Next shot"}
      style={({ pressed }) => [r.nav, pressed && { backgroundColor: c.surfaceSunken }, disabled && r.navOff]}>
      {dir < 0 && <Icon name="chevron-left" color={fg} />}
      <Text style={[r.navText, { color: fg }]}>{dir < 0 ? "Prev" : "Next"}</Text>
      {dir > 0 && <Icon name="chevron-right" color={fg} />}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 2, borderBottomColor: c.border },
  barTitle: { ...type("body", "bold"), color: c.text, ...num },
  nav: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 48, paddingHorizontal: 10, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: c.border },
  navOff: { borderStyle: "dashed", borderColor: c.textDisabled },
  navText: { ...type("label", "bold") },
  title: { ...type("heading", "bold"), color: c.text },
  line: { ...type("body", "semibold"), color: c.text, flexShrink: 1 },
  dim: { ...type("small"), color: c.textDim, marginTop: 4 },
}));
