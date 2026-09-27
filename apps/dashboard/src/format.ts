import { extraLabel, label, lightLabel, STATE_COLORS, type FilterableShot } from "@fielder/vocab";
import type { Photo, Shot } from "./api";

/** The photo that stands for the shot in lists, maps and filters: the first one. */
export const cover = (s: Shot): Photo => s.photos[0];

export function rigLabel(p: Photo): string {
  const f = p.framing;
  const name = p.preset_name ?? (f?.preset_name as string | undefined) ?? "unknown rig";
  const sb = f?.speedbooster_factor as number | undefined;
  return `${name} · ${p.lens_mm} mm${sb && sb !== 1 ? ` ×${sb}` : ""}`;
}

/** "Name" or, for shots without tags, the rig label. */
export const shotTitle = (s: Shot): string => s.name?.trim() || rigLabel(cover(s));
export const placeLabel = (s: Shot): string => s.location_name ?? "";
export const tagsLabel = (s: Shot): string =>
  [label(s.int_ext), lightLabel(s.light, s.artificial), label(s.weather), extraLabel(s.extra)].filter(Boolean).join(" · ");
export const stateColor = (s: Shot): string => STATE_COLORS[s.state] ?? "#9a9aa5";
/** "3 photos" for sequences, "" for single shots. */
export const photoCountLabel = (s: Shot): string => (s.photos.length > 1 ? `${s.photos.length} photos` : "");

export function fovLabel(p: Photo): string {
  const f = p.framing;
  if (!f) return "";
  const parts: string[] = [];
  if (typeof f.full_frame_equivalent_mm === "number") parts.push(`${f.full_frame_equivalent_mm} mm FF-eq`);
  if (typeof f.hfov_deg === "number" && typeof f.vfov_deg === "number") parts.push(`${f.hfov_deg}° × ${f.vfov_deg}°`);
  return parts.join(" · ");
}

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const when = (iso: string) => fmt.format(new Date(iso));
export const coords = (p: Photo) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

export interface FrameGeometry { width_fraction: number; height_fraction: number }

/** Rig frame relative to the photo, centred. */
export function frameOf(p: Photo): FrameGeometry | null {
  const f = p.framing?.frame as Partial<FrameGeometry> | undefined;
  if (!f || typeof f.width_fraction !== "number" || typeof f.height_fraction !== "number") return null;
  return { width_fraction: f.width_fraction, height_fraction: f.height_fraction };
}

export function rigDescription(p: Photo): string {
  const f = p.framing;
  if (!f) return "";
  const parts: string[] = [];
  if (typeof f.camera_id === "string" && typeof f.format_id === "string") parts.push(`${f.camera_id} / ${f.format_id}`);
  if (typeof f.sensor_width_mm === "number" && typeof f.sensor_height_mm === "number") parts.push(`${f.sensor_width_mm} × ${f.sensor_height_mm} mm`);
  if (typeof f.speedbooster_factor === "number" && f.speedbooster_factor !== 1) parts.push(`×${f.speedbooster_factor}`);
  return parts.join(" · ");
}

/** Photo aspect ratio (w/h) as uploaded; 4:3 when the app did not record it. */
export const imageAspect = (p: Photo): number => (p.width && p.height ? p.width / p.height : 4 / 3);

export type FrameMode = "mask" | "frame" | "fit" | "off";
export const FRAME_MODES: readonly FrameMode[] = ["mask", "frame", "fit", "off"];
export const frameModeLabel = (m: FrameMode) => (m === "off" ? "Raw" : m[0].toUpperCase() + m.slice(1));
export const isFrameMode = (v: unknown): v is FrameMode => FRAME_MODES.includes(v as FrameMode);

export interface PctRect { left: number; top: number; width: number; height: number }
export interface FrameLayout {
  /** Photo box inside the container, in % of the container. */
  img: PctRect;
  /** Rig frame in % of the container; null when no frame is drawn (raw or fit). */
  frame: PctRect | null;
  /** Rig saw more than the phone: photo shrunk, frame dashed. */
  shrunk: boolean;
  /** Container aspect ratio (w/h) to apply in fit mode. */
  aspect?: number;
}

/** Same layout rules as the phone: shrink the photo when the rig saw more, crop to the frame in fit mode. */
export function frameLayout(f: FrameGeometry, mode: FrameMode, photoAspect: number): FrameLayout {
  const full = { left: 0, top: 0, width: 100, height: 100 };
  if (mode === "off") return { img: full, frame: null, shrunk: false };
  if (mode === "fit") {
    // The container is the rig frame. Where the rig saw more than the phone (fraction > 1) the
    // photo covers less than the container and the rest stays black, like the live view.
    const w = 100 / f.width_fraction, h = 100 / f.height_fraction;
    const shrunk = f.width_fraction > 1 || f.height_fraction > 1;
    return { img: { left: (100 - w) / 2, top: (100 - h) / 2, width: w, height: h }, frame: null, shrunk, aspect: photoAspect * (f.width_fraction / f.height_fraction) };
  }
  const scale = 1 / Math.max(1, f.width_fraction, f.height_fraction);
  const img = scale < 1 ? { left: (1 - scale) * 50, top: (1 - scale) * 50, width: scale * 100, height: scale * 100 } : full;
  const w = f.width_fraction * scale * 100, h = f.height_fraction * scale * 100;
  return { img, frame: { left: (100 - w) / 2, top: (100 - h) / 2, width: w, height: h }, shrunk: scale < 1 };
}

/** Map a shot to the shape the shared filter evaluator expects. Rig and lens come from the cover photo. */
export function filterable(s: Shot): FilterableShot {
  const p = cover(s);
  const ffEq = p.framing?.full_frame_equivalent_mm;
  return {
    state: s.state, project_id: s.project_id, name: s.name, location_id: s.location_id, int_ext: s.int_ext,
    light: s.light, artificial: s.artificial ? "yes" : "no", weather: s.weather,
    preset_id: p.preset_id, lens_mm: p.lens_mm, ff_eq_mm: typeof ffEq === "number" ? ffEq : null,
    photo_count: s.photos.length, timestamp: s.captured_at, extra: s.extra,
  };
}
