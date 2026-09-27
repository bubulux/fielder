import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, cover, type Photo, type Shot } from "../api";
import { FRAME_MODES, frameModeLabel, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { extraLabel, label, lightLabel, SHOT_STATES, STATE_COLORS, type ShotState } from "@fielder/vocab";
import { Button, Chip, ChipRow, colors, Sheet, StateBadge } from "../components/ui";
import { TagsForm } from "../components/TagsForm";
import { ensureLocation } from "../namedSync";
import type { LocationEntry, ShotTags } from "../types";
import type { Settings } from "../types";

export type StateFilter = ShotState | "all";
export const STATE_FILTERS: readonly StateFilter[] = ["all", ...SHOT_STATES];
export const applyFilter = (shots: Shot[] | null, f: StateFilter): Shot[] => (shots ?? []).filter((s) => f === "all" || s.state === f);

/** Shots of the active project; empty while none is chosen. */
export function useShots(projectId: string | null) {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!projectId) { setShots([]); return; }
    setRefreshing(true);
    try { setShots(await api.listShots(projectId)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRefreshing(false); }
  }, [projectId]);
  // A project switch changes `load`: drop the old project's list right away.
  useEffect(() => { setShots(null); void load(); }, [load]);
  const remove = useCallback((id: string) => setShots((cur) => (cur ?? []).filter((s) => s.id !== id)), []);
  const update = useCallback((shot: Shot) => setShots((cur) => (cur ?? []).map((s) => (s.id === shot.id ? shot : s))), []);
  return { shots, error, refreshing, load, remove, update };
}

const fmt = (iso: string) => new Date(iso).toLocaleString();
export function rigLabel(p: Photo): string {
  const f = p.framing ?? {};
  const name = p.preset_name ?? (f.preset_name as string | undefined) ?? "unknown rig";
  const sb = f.speedbooster_factor as number | undefined;
  return `${name} · ${p.lens_mm} mm${sb && sb !== 1 ? ` ×${sb}` : ""}`;
}
/** "Name" or, for shots without tags, the rig label. */
export const shotTitle = (s: Shot): string => s.name?.trim() || rigLabel(cover(s));
/** Location name or "" for untagged shots. */
export const placeLabel = (s: Shot): string => s.location_name ?? "";
export const tagsLabel = (s: Shot): string =>
  [label(s.int_ext), lightLabel(s.light, s.artificial), label(s.weather), extraLabel(s.extra)].filter(Boolean).join(" · ");
/** "3 photos" for sequences, "" for single shots. */
export const photoCountLabel = (s: Shot): string => (s.photos.length > 1 ? `${s.photos.length} photos` : "");
export const badgeOf = (s: Shot) => <StateBadge state={s.state} color={STATE_COLORS[s.state] ?? colors.dim} />;

function fovLabel(p: Photo): string {
  const f = p.framing ?? {};
  const parts: string[] = [];
  if (typeof f.full_frame_equivalent_mm === "number") parts.push(`${f.full_frame_equivalent_mm} mm FF-eq`);
  if (typeof f.hfov_deg === "number" && typeof f.vfov_deg === "number") parts.push(`${f.hfov_deg}° × ${f.vfov_deg}°`);
  return parts.join(" · ");
}

interface DetailProps {
  shot: Shot | null;
  onClose: () => void;
  settings: Settings;
  /** Initial display mode; the sheet has its own switch. */
  mode: FrameMode;
  onDeleted: (id: string) => void;
  onUpdated: (shot: Shot) => void;
  onShowOnMap: (shot: Shot) => void;
  locations: LocationEntry[];
  onLocations: (l: LocationEntry[]) => void;
  countAt: (locationId: string) => number;
}

export function ShotDetail({ shot, onClose, settings, mode: initialMode, onDeleted, onUpdated, onShowOnMap, locations, onLocations, countAt }: DetailProps) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<FrameMode>(initialMode);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode(initialMode); setEditing(false); }, [initialMode, shot?.id]);
  if (!shot) return null;
  const photo = cover(shot);
  const setState = async (state: Shot["state"]) => {
    setBusy(true);
    try { onUpdated(await api.patchShot(shot.id, { state })); } catch (e) { Alert.alert("Update failed", String(e)); } finally { setBusy(false); }
  };
  const saveTags = async (tags: ShotTags, newLoc: LocationEntry | null) => {
    setBusy(true);
    try {
      if (newLoc) {
        const id = await ensureLocation(newLoc);
        onLocations([...locations.filter((l) => l.id !== newLoc.id && l.id !== id), { ...newLoc, id, synced: true }]);
        tags = { ...tags, location_id: id };
      }
      onUpdated(await api.patchShot(shot.id, tags));
      setEditing(false);
    } catch (e) { Alert.alert("Save failed", String(e)); } finally { setBusy(false); }
  };
  const del = () =>
    Alert.alert("Delete shot", "Removes the image and its metadata permanently.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { Alert.alert("Delete failed", String(e)); } } },
    ]);
  return (
    <Sheet visible title={shotTitle(shot)} onClose={onClose}>
      <ShotFrame photo={photo} width={Math.min(width - 32, 720)} settings={settings} mode={mode} style={{ borderRadius: 8, alignSelf: "center" }} />
      <View style={{ marginTop: 10 }}>
        <ChipRow>
          {FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}
        </ChipRow>
      </View>
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {badgeOf(shot)}
        <Text style={{ color: colors.text, fontSize: 15 }}>{placeLabel(shot) || "no location"}</Text>
      </View>
      {!!tagsLabel(shot) && <Text style={d.dim}>{tagsLabel(shot)}</Text>}
      <Text style={d.line}>{[fmt(shot.captured_at), photoCountLabel(shot)].filter(Boolean).join(" · ")}</Text>
      <Text style={d.dim}>{rigLabel(photo)}</Text>
      <Text style={d.dim}>{fovLabel(photo)}</Text>
      <Text style={d.dim}>{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}{photo.gps_accuracy_m != null ? ` ±${Math.round(photo.gps_accuracy_m)} m` : ""}</Text>
      {editing ? (
        <TagsForm
          initial={{ name: shot.name, light: shot.light, artificial: shot.artificial, weather: shot.weather, int_ext: shot.int_ext, location_id: shot.location_id, extra: shot.extra }}
          locations={locations}
          countAt={countAt}
          submitLabel="Save"
          onSubmit={(t, l) => void saveTags(t, l)}
          onCancel={() => setEditing(false)}
          busy={busy}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {shot.state !== "approved" && <View style={{ flex: 1 }}><Button label="Approve" onPress={() => void setState("approved")} disabled={busy} /></View>}
            {shot.state !== "archived" && <View style={{ flex: 1 }}><Button label="Archive" kind="ghost" onPress={() => void setState("archived")} disabled={busy} /></View>}
            {shot.state !== "unreviewed" && <View style={{ flex: 1 }}><Button label="Back to review" kind="ghost" onPress={() => void setState("unreviewed")} disabled={busy} /></View>}
          </View>
          <Button label="Edit tags" kind="ghost" onPress={() => setEditing(true)} />
          <Button label="Show on map" kind="ghost" onPress={() => onShowOnMap(shot)} />
          <Button label="Delete shot" kind="danger" onPress={del} />
        </>
      )}
    </Sheet>
  );
}

export interface ShotListProps {
  settings: Settings;
  data: ReturnType<typeof useShots>;
  onShowOnMap: (shot: Shot) => void;
  filter: StateFilter;
  onFilter: (f: StateFilter) => void;
  locations: LocationEntry[];
  onLocations: (l: LocationEntry[]) => void;
  countAt: (locationId: string) => number;
  /** Shot to open on mount (e.g. from the review tab). */
  open: Shot | null;
  onOpen: (shot: Shot | null) => void;
}

export function Gallery({ settings, data, onShowOnMap, filter, onFilter, locations, onLocations, countAt, open, onOpen }: ShotListProps) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<FrameMode>("mask");
  const cols = width > height ? 4 : 2;
  const gap = 8;
  const cell = (width - gap * (cols + 1)) / cols;
  const { shots, error, refreshing, load, remove, update } = data;
  const visible = useMemo(() => applyFilter(shots, filter), [shots, filter]);
  // The opened shot is a snapshot; always render the latest copy from the list so state changes show immediately.
  const openLatest = open ? (shots ?? []).find((s) => s.id === open.id) ?? open : null;
  const counts = useMemo(() => Object.fromEntries(STATE_FILTERS.map((f) => [f, applyFilter(shots, f).length])), [shots]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={g.bar}>
        <ChipRow>
          {STATE_FILTERS.map((f) => <Chip key={f} label={`${f} ${counts[f] ?? 0}`} selected={filter === f} onPress={() => onFilter(f)} />)}
        </ChipRow>
        <ChipRow>
          {FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}
        </ChipRow>
      </View>
      {error && <Text style={g.error}>Could not load: {error}</Text>}
      {!shots && !error && <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}
      {shots && (
        <FlatList
          key={cols}
          data={visible}
          numColumns={cols}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: gap }}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={g.empty}>{filter === "all" ? "No shots yet." : `No ${filter} shots.`}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpen(item)} style={[g.card, { width: cell }]}>
              <View>
                <ShotFrame photo={cover(item)} width={cell} settings={settings} mode={mode} />
                {item.photos.length > 1 && <Text style={g.count}>▤ {item.photos.length}</Text>}
              </View>
              <View style={{ padding: 8 }}>
                <Text style={g.cardTitle} numberOfLines={1}>{shotTitle(item)}</Text>
                <Text style={g.cardSub} numberOfLines={1}>{placeLabel(item) || rigLabel(cover(item))}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={g.cardSub} numberOfLines={1}>{fmt(item.captured_at)}</Text>
                  {badgeOf(item)}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
      <ShotDetail shot={openLatest} onClose={() => onOpen(null)} settings={settings} mode={mode} onDeleted={remove} onUpdated={update}
        onShowOnMap={(s) => { onOpen(null); onShowOnMap(s); }} locations={locations} onLocations={onLocations} countAt={countAt} />
    </View>
  );
}

const g = StyleSheet.create({
  bar: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  error: { color: colors.danger, padding: 16 },
  empty: { color: colors.dim, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: colors.panel, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 12, fontWeight: "600" },
  cardSub: { color: colors.dim, fontSize: 11, marginTop: 2 },
  count: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 11, fontWeight: "700", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
});
const d = StyleSheet.create({
  line: { color: colors.text, marginTop: 12, fontSize: 15 },
  dim: { color: colors.dim, marginTop: 4 },
});
