import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, type Shot } from "../api";
import { FRAME_MODES, frameModeLabel, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { Button, Chip, ChipRow, colors, Sheet } from "../components/ui";
import type { Settings } from "../types";

export function useShots() {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try { setShots(await api.listShots()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = useCallback((id: string) => setShots((cur) => (cur ?? []).filter((s) => s.id !== id)), []);
  return { shots, error, refreshing, load, remove };
}

const fmt = (iso: string) => new Date(iso).toLocaleString();
export function rigLabel(s: Shot): string {
  const f = (s.extra_metadata?.framing as Record<string, unknown> | undefined) ?? {};
  const name = s.preset_name ?? (f.preset_name as string | undefined) ?? "unknown rig";
  const sb = f.speedbooster_factor as number | undefined;
  return `${name} · ${s.lens_mm} mm${sb && sb !== 1 ? ` ×${sb}` : ""}`;
}
function fovLabel(s: Shot): string {
  const f = (s.extra_metadata?.framing as Record<string, unknown> | undefined) ?? {};
  const parts: string[] = [];
  if (typeof f.full_frame_equivalent_mm === "number") parts.push(`${f.full_frame_equivalent_mm} mm FF-eq`);
  if (typeof f.hfov_deg === "number" && typeof f.vfov_deg === "number") parts.push(`${f.hfov_deg}° × ${f.vfov_deg}°`);
  return parts.join(" · ");
}

interface DetailProps { shot: Shot | null; onClose: () => void; settings: Settings; /** Initial display mode; the sheet has its own switch. */ mode: FrameMode; onDeleted: (id: string) => void; onShowOnMap: (shot: Shot) => void }

export function ShotDetail({ shot, onClose, settings, mode: initialMode, onDeleted, onShowOnMap }: DetailProps) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<FrameMode>(initialMode);
  useEffect(() => { setMode(initialMode); }, [initialMode, shot?.id]);
  if (!shot) return null;
  const del = () =>
    Alert.alert("Delete shot", "Removes the image and its metadata permanently.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { Alert.alert("Delete failed", String(e)); } } },
    ]);
  return (
    <Sheet visible title={rigLabel(shot)} onClose={onClose}>
      <ShotFrame shot={shot} width={Math.min(width - 32, 720)} settings={settings} mode={mode} style={{ borderRadius: 8, alignSelf: "center" }} />
      <View style={{ marginTop: 10 }}>
        <ChipRow>
          {FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}
        </ChipRow>
      </View>
      <Text style={d.line}>{fmt(shot.timestamp)}</Text>
      <Text style={d.dim}>{fovLabel(shot)}</Text>
      <Text style={d.dim}>{shot.lat.toFixed(5)}, {shot.lon.toFixed(5)}</Text>
      <Button label="Show on map" kind="ghost" onPress={() => onShowOnMap(shot)} />
      <Button label="Delete shot" kind="danger" onPress={del} />
    </Sheet>
  );
}

interface Props {
  settings: Settings;
  data: ReturnType<typeof useShots>;
  onShowOnMap: (shot: Shot) => void;
}

export function Gallery({ settings, data, onShowOnMap }: Props) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<FrameMode>("mask");
  const [open, setOpen] = useState<Shot | null>(null);
  const cols = width > height ? 4 : 2;
  const gap = 8;
  const cell = (width - gap * (cols + 1)) / cols;
  const { shots, error, refreshing, load, remove } = data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={g.bar}>
        <Text style={g.title}>{shots ? `${shots.length} shots` : "Gallery"}</Text>
        <ChipRow>
          {FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}
        </ChipRow>
      </View>
      {error && <Text style={g.error}>Could not load: {error}</Text>}
      {!shots && !error && <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}
      {shots && (
        <FlatList
          key={cols}
          data={shots}
          numColumns={cols}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: gap }}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={g.empty}>No shots yet.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => setOpen(item)} style={[g.card, { width: cell }]}>
              <ShotFrame shot={item} width={cell} settings={settings} mode={mode} />
              <View style={{ padding: 8 }}>
                <Text style={g.cardTitle} numberOfLines={1}>{rigLabel(item)}</Text>
                <Text style={g.cardSub} numberOfLines={1}>{fmt(item.timestamp)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <ShotDetail shot={open} onClose={() => setOpen(null)} settings={settings} mode={mode} onDeleted={remove} onShowOnMap={(s) => { setOpen(null); onShowOnMap(s); }} />
    </View>
  );
}

const g = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  error: { color: colors.danger, padding: 16 },
  empty: { color: colors.dim, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: colors.panel, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 12, fontWeight: "600" },
  cardSub: { color: colors.dim, fontSize: 11, marginTop: 2 },
});
const d = StyleSheet.create({
  line: { color: colors.text, marginTop: 12, fontSize: 15 },
  dim: { color: colors.dim, marginTop: 4 },
});
