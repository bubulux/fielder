import type { Shot } from "./api";

export function framingOf(s: Shot): Record<string, unknown> | null {
  const f = s.extra_metadata?.framing;
  return f && typeof f === "object" ? (f as Record<string, unknown>) : null;
}

export function rigLabel(s: Shot): string {
  const f = framingOf(s);
  const name = s.preset_name ?? (f?.preset_name as string | undefined) ?? "unknown rig";
  const sb = f?.speedbooster_factor as number | undefined;
  return `${name} · ${s.lens_mm} mm${sb && sb !== 1 ? ` ×${sb}` : ""}`;
}

export function fovLabel(s: Shot): string {
  const f = framingOf(s);
  if (!f) return "";
  const parts: string[] = [];
  if (typeof f.full_frame_equivalent_mm === "number") parts.push(`${f.full_frame_equivalent_mm} mm FF-eq`);
  if (typeof f.hfov_deg === "number" && typeof f.vfov_deg === "number") parts.push(`${f.hfov_deg}° × ${f.vfov_deg}°`);
  return parts.join(" · ");
}

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const when = (iso: string) => fmt.format(new Date(iso));
export const coords = (s: Shot) => `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`;

export interface FrameGeometry { width_fraction: number; height_fraction: number }

/** Rig frame relative to the photo, centred. Present on shots taken with app builds from 2026-09-06 on. */
export function frameOf(s: Shot): FrameGeometry | null {
  const f = framingOf(s)?.frame as Partial<FrameGeometry> | undefined;
  if (!f || typeof f.width_fraction !== "number" || typeof f.height_fraction !== "number") return null;
  return { width_fraction: f.width_fraction, height_fraction: f.height_fraction };
}

export function rigDescription(s: Shot): string {
  const f = framingOf(s);
  if (!f) return "";
  const parts: string[] = [];
  if (typeof f.camera_id === "string" && typeof f.format_id === "string") parts.push(`${f.camera_id} / ${f.format_id}`);
  if (typeof f.sensor_width_mm === "number" && typeof f.sensor_height_mm === "number") parts.push(`${f.sensor_width_mm} × ${f.sensor_height_mm} mm`);
  if (typeof f.speedbooster_factor === "number" && f.speedbooster_factor !== 1) parts.push(`×${f.speedbooster_factor}`);
  return parts.join(" · ");
}
