import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, type Shot } from "../api";
import { PhotoStrip } from "../components/PhotoStrip";
import { FRAME_MODES, frameModeLabel, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { TagsForm } from "../components/TagsForm";
import { Button, Chip, ChipRow, colors } from "../components/ui";
import { ensureLocation } from "../namedSync";
import type { LocationEntry, Settings, ShotTags } from "../types";
import { badgeOf, photoCountLabel, placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

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

  if (error) return <Text style={r.status}>Could not load: {error}</Text>;
  if (!shots) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  if (!current) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Text style={r.status}>Nothing to review.</Text></View>;

  const photo = current.photos[Math.min(photoIndex, current.photos.length - 1)];
  const photoWidth = portrait ? width - 32 : Math.min(width * 0.55, height * 1.25);
  const photoView = (
    <View style={{ alignItems: "center" }}>
      <ShotFrame photo={photo} width={photoWidth} settings={settings} mode={mode} style={{ borderRadius: 8 }} />
      <PhotoStrip shot={current} index={photoIndex} onPick={setPhotoIndex} />
      <View style={{ marginTop: 8 }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
      </View>
    </View>
  );
  const info = editing ? (
    <View style={{ flex: 1 }}>
      <TagsForm
        initial={{ name: current.name, light: current.light, artificial: current.artificial, weather: current.weather, int_ext: current.int_ext, location_id: current.location_id, extra: current.extra }}
        locations={locations}
        countAt={countAt}
        submitLabel="Save"
        onSubmit={(t, l) => void saveTags(current, t, l)}
        onCancel={() => setEditing(false)}
        busy={busy}
      />
    </View>
  ) : (
    <View style={{ flex: 1 }}>
      <Text style={r.title}>{shotTitle(current)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>{badgeOf(current)}<Text style={r.line}>{placeLabel(current) || "no location"}</Text></View>
      {!!tagsLabel(current) && <Text style={r.dim}>{tagsLabel(current)}</Text>}
      <Text style={r.dim}>{rigLabel(photo)}</Text>
      <Text style={r.dim}>{[fmt(current.captured_at), photoCountLabel(current)].filter(Boolean).join(" · ")}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Button label="Archive" kind="archive" onPress={() => void setState(current, "archived")} disabled={busy} /></View>
        <View style={{ flex: 1 }}><Button label="Approve" kind="approve" onPress={() => void setState(current, "approved")} disabled={busy} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 2 }}><Button label="Edit details" kind="ghost" onPress={() => setEditing(true)} /></View>
        <View style={{ flex: 1 }}><Button label="Delete" kind="danger" onPress={() => del(current)} /></View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={r.bar}>
        <Text style={[r.nav, index === 0 && r.navOff]} onPress={() => go(-1)} suppressHighlighting>‹ Prev</Text>
        <Text style={r.barTitle}>{index + 1} / {queue.length} to review</Text>
        <Text style={[r.nav, index === queue.length - 1 && r.navOff]} onPress={() => go(1)} suppressHighlighting>Next ›</Text>
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

const r = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  nav: { color: colors.accent, fontSize: 16, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 6 },
  navOff: { opacity: 0.25 },
  status: { color: colors.dim, textAlign: "center", marginTop: 40 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  line: { color: colors.text, fontSize: 15 },
  dim: { color: colors.dim, marginTop: 4 },
});
