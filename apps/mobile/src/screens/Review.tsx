import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, type Shot } from "../api";
import { FRAME_MODES, frameModeLabel, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { Button, Chip, ChipRow, colors } from "../components/ui";
import type { Settings } from "../types";
import { badgeOf, placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

interface Props {
  settings: Settings;
  data: ReturnType<typeof useShots>;
  onOpen: (shot: Shot) => void;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

/** Unreviewed shots one at a time, oldest first: Approve or Archive (both keep the photo). */
export function Review({ settings, data, onOpen }: Props) {
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("mask");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { shots, error, update, remove } = data;

  const queue = useMemo(
    () => (shots ?? []).filter((s) => s.state === "unreviewed").sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [shots],
  );
  const current = queue.find((s) => !skipped.includes(s.id)) ?? queue[0] ?? null;

  async function setState(shot: Shot, state: Shot["state"]) {
    setBusy(true);
    try { update(await api.patchShot(shot.id, { state })); } catch (e) { Alert.alert("Update failed", String(e)); } finally { setBusy(false); }
  }
  const del = (shot: Shot) =>
    Alert.alert("Delete shot", "Removes the image and its metadata permanently. Archive keeps it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteShot(shot.id); remove(shot.id); } catch (e) { Alert.alert("Delete failed", String(e)); } } },
    ]);

  if (error) return <Text style={r.status}>Could not load: {error}</Text>;
  if (!shots) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  if (!current) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Text style={r.status}>Nothing to review.</Text></View>;

  const photoWidth = portrait ? width - 32 : Math.min(width * 0.55, height * 1.25);
  const photo = (
    <View style={{ alignItems: "center" }}>
      <ShotFrame shot={current} width={photoWidth} settings={settings} mode={mode} style={{ borderRadius: 8 }} />
      <View style={{ marginTop: 8 }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
      </View>
    </View>
  );
  const info = (
    <View style={{ flex: 1 }}>
      <Text style={r.title}>{shotTitle(current)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>{badgeOf(current)}<Text style={r.line}>{placeLabel(current) || "no location"}</Text></View>
      {!!tagsLabel(current) && <Text style={r.dim}>{tagsLabel(current)}</Text>}
      <Text style={r.dim}>{rigLabel(current)}</Text>
      <Text style={r.dim}>{fmt(current.timestamp)}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Button label="Archive" kind="ghost" onPress={() => void setState(current, "archived")} disabled={busy} /></View>
        <View style={{ flex: 1 }}><Button label="Approve" onPress={() => void setState(current, "approved")} disabled={busy} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Button label="Details / edit" kind="ghost" onPress={() => onOpen(current)} /></View>
        {queue.length > 1 && <View style={{ flex: 1 }}><Button label="Skip" kind="ghost" onPress={() => setSkipped((s) => [...s, current.id])} /></View>}
        <View style={{ flex: 1 }}><Button label="Delete" kind="danger" onPress={() => del(current)} /></View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={r.bar}><Text style={r.barTitle}>{queue.length} to review</Text></View>
      {portrait ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>{photo}{info}</ScrollView>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", padding: 16, gap: 16 }}>
          {photo}
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} style={{ flex: 1 }}>{info}</ScrollView>
        </View>
      )}
    </View>
  );
}

const r = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  status: { color: colors.dim, textAlign: "center", marginTop: 40 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  line: { color: colors.text, fontSize: 15 },
  dim: { color: colors.dim, marginTop: 4 },
});
