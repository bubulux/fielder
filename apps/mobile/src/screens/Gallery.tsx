import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { api, cover, type Photo, type Shot } from "../api";
import { FrameModeSeg, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { extraLabel, label, lightLabel, SHOT_STATES, type ShotState } from "@fielder/vocab";
import { Button, Chip, Empty, SeqBadge, Sheet, StateMarker } from "../components/ui";
import { makeStyles, num, RADIUS, type, useTheme } from "../theme";
import { TagsForm } from "../components/TagsForm";
import { PhotoStrip } from "../components/PhotoStrip";
import { PositionPicker } from "../components/PositionPicker";
import { ensureLocation } from "../namedSync";
import { store } from "../storage";
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
  const d = useStyles();
  const [mode, setMode] = useState<FrameMode>(initialMode);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [movingPin, setMovingPin] = useState(false);
  useEffect(() => { setMode(initialMode); setEditing(false); setPhotoIndex(0); setMovingPin(false); }, [initialMode, shot?.id]);
  if (!shot) return null;
  const photo = shot.photos[Math.min(photoIndex, shot.photos.length - 1)];
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
      <ShotFrame photo={photo} width={Math.min(width - 40, 720)} settings={settings} mode={mode} style={{ borderRadius: RADIUS.sm, alignSelf: "center", marginTop: 12 }} />
      <PhotoStrip shot={shot} index={photoIndex} onPick={setPhotoIndex} />
      <View style={{ marginTop: 10 }}><FrameModeSeg value={mode} onChange={setMode} /></View>
      <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <StateMarker state={shot.state} />
        <Text style={d.place}>{placeLabel(shot) || "No location"}</Text>
      </View>
      {!!tagsLabel(shot) && <Text style={d.dim}>{tagsLabel(shot)}</Text>}
      <Text style={[d.line, num]}>{[fmt(shot.captured_at), photoCountLabel(shot)].filter(Boolean).join(" · ")}</Text>
      <Text style={[d.dim, num]}>{rigLabel(photo)}</Text>
      <Text style={[d.dim, num]}>{fovLabel(photo)}</Text>
      <Text style={[d.dim, num]}>{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}{photo.position_corrected ? " · corrected" : photo.gps_accuracy_m != null ? ` ±${Math.round(photo.gps_accuracy_m)} m` : ""}</Text>
      {editing ? (
        <TagsForm
          initial={{ name: shot.name, light: shot.light, artificial: shot.artificial, weather: shot.weather, int_ext: shot.int_ext, location_id: shot.location_id, extra: shot.extra }}
          locations={locations}
          countAt={countAt}
          fields={store.fieldsForProject(shot.project_id)}
          submitLabel="Save"
          onSubmit={(t, l) => void saveTags(t, l)}
          onCancel={() => setEditing(false)}
          busy={busy}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {shot.state !== "approved" && <View style={{ flex: 1 }}><Button label="Approve" icon="check" kind="approve" onPress={() => void setState("approved")} disabled={busy} /></View>}
            {shot.state !== "archived" && <View style={{ flex: 1 }}><Button label="Archive" icon="archive-outline" kind="archive" onPress={() => void setState("archived")} disabled={busy} /></View>}
            {shot.state !== "unreviewed" && <View style={{ flex: 1 }}><Button label="Back to review" icon="undo" kind="archive" onPress={() => void setState("unreviewed")} disabled={busy} /></View>}
          </View>
          <Button label="Edit details" icon="pencil-outline" kind="ghost" onPress={() => setEditing(true)} />
          <Button label="Show on map" icon="map-marker-outline" kind="ghost" onPress={() => onShowOnMap(shot)} />
          <Button label="Correct position" icon="crosshairs-gps" kind="ghost" onPress={() => setMovingPin(true)} />
          <Button label="Delete shot" icon="delete-outline" kind="danger" onPress={del} />
        </>
      )}
      <PositionPicker key={photo.id} visible={movingPin} lat={photo.lat} lon={photo.lon} accuracyM={photo.gps_accuracy_m} photoCount={shot.photos.length}
        onCancel={() => setMovingPin(false)}
        onSave={async (lat, lon, all) => { try { onUpdated(await api.patchPhotoPosition(photo.id, lat, lon, all)); setMovingPin(false); } catch (e) { Alert.alert("Saving the position failed", String(e)); } }} />
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
  const g = useStyles();
  const { c } = useTheme();
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
    <View style={g.root}>
      <View style={g.bar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {STATE_FILTERS.map((f) => <Chip key={f} label={`${label(f)} ${counts[f] ?? 0}`} selected={filter === f} onPress={() => onFilter(f)} />)}
        </ScrollView>
        <View style={{ paddingHorizontal: 12 }}><FrameModeSeg value={mode} onChange={setMode} /></View>
      </View>
      {error && <Empty icon="cloud-alert" title="Could not load" body={error} />}
      {!shots && !error && <Empty loading title="Loading shots…" />}
      {shots && (
        <FlatList
          key={cols}
          data={visible}
          numColumns={cols}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: gap }}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} />}
          ListEmptyComponent={<Empty icon="camera-iris" title={filter === "all" ? "No shots yet" : `No ${filter} shots`} body={filter === "all" ? "Take one in the Shoot tab." : undefined} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [g.card, { width: cell }, pressed && g.cardPressed]} accessibilityRole="button" accessibilityLabel={shotTitle(item)}>
              <View>
                <ShotFrame photo={cover(item)} width={cell - 2} settings={settings} mode={mode} />
                <View style={g.tl}><StateMarker state={item.state} iconOnly /></View>
                {item.photos.length > 1 && <View style={g.tr}><SeqBadge count={item.photos.length} /></View>}
              </View>
              <View style={{ padding: 10, gap: 2 }}>
                <Text style={g.cardTitle} numberOfLines={1}>{shotTitle(item)}</Text>
                <Text style={g.cardSub} numberOfLines={1}>{placeLabel(item) || rigLabel(cover(item))}</Text>
                <Text style={[g.cardSub, num]} numberOfLines={1}>{fmt(item.captured_at)}</Text>
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

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  bar: { gap: 8, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 2, borderBottomColor: c.border },
  card: { backgroundColor: c.surface, borderRadius: RADIUS.md, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  cardPressed: { borderColor: c.borderStrong, transform: [{ translateY: 1 }] },
  tl: { position: "absolute", top: 8, left: 8 },
  tr: { position: "absolute", top: 8, right: 8 },
  cardTitle: { ...type("small", "bold"), color: c.text },
  cardSub: { ...type("caption"), color: c.textDim },
  place: { ...type("body", "semibold"), color: c.text, flexShrink: 1 },
  line: { ...type("small"), color: c.text, marginTop: 10 },
  dim: { ...type("small"), color: c.textDim, marginTop: 4 },
}));
