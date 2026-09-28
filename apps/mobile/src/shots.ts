import { useCallback, useEffect, useState } from "react";
import { extraSummary, label, lightLabel, SHOT_STATES, type ShotState } from "@fielder/vocab";
import { api, cover, type Photo, type Shot } from "./api";
import { store } from "./storage";

export type StateFilter = ShotState | "all";
export const STATE_FILTERS: readonly StateFilter[] = ["all", ...SHOT_STATES];
export const applyFilter = (shots: readonly Shot[] | null, f: StateFilter): Shot[] => (shots ?? []).filter((s) => f === "all" || s.state === f);

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
export type ShotsData = ReturnType<typeof useShots>;

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
/** "EXT · Dusk / Night + Artificial · Partly cloudy" (fixed tags only). */
export const tagsLabel = (s: { int_ext: string | null; light: string[]; artificial: boolean; weather: string | null }): string =>
  [label(s.int_ext), lightLabel(s.light, s.artificial), label(s.weather)].filter(Boolean).join(" · ");
/** The project's extra fields as one line, with their labels. */
export const extraLine = (s: Shot): string => extraSummary(store.fieldsForProject(s.project_id), s.extra);
/** "3 photos" for sequences, "" for single shots. */
export const photoCountLabel = (s: Shot): string => (s.photos.length > 1 ? `${s.photos.length} photos` : "");

export function fovLabel(p: Photo): string {
  const f = p.framing ?? {};
  const parts: string[] = [];
  if (typeof f.full_frame_equivalent_mm === "number") parts.push(`${f.full_frame_equivalent_mm} mm FF-eq`);
  if (typeof f.hfov_deg === "number" && typeof f.vfov_deg === "number") parts.push(`${f.hfov_deg}° × ${f.vfov_deg}°`);
  return parts.join(" · ");
}

/** "Fri 2 Oct 18:42" */
export const shortTime = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const hhmm = (d: Date | string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
