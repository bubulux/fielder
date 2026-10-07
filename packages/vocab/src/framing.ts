/**
 * Framings (issue #29): which part of a photo the rig sees. A frame is its size relative to the
 * photo (from a rig + lens, as captured or re-framed) plus its centre (`x`, `y`, fractions of the
 * photo; absent = 0.5, so every frame stored before #29 is a centred frame). The as-captured frame
 * lives in `photos.framing.frame`; saved framings are rows of `framings`; one may be the photo's
 * root, which every view on both clients shows.
 */

export interface Frame {
  width_fraction: number;
  height_fraction: number;
  /** Centre of the frame as a fraction of the photo width; default 0.5. */
  x?: number;
  /** Centre of the frame as a fraction of the photo height; default 0.5. */
  y?: number;
}

/** A saved framing of one photo, as the API returns it. */
export interface Framing {
  id: string;
  photo_id: string;
  name: string;
  /** Rig preset the size came from; null = the rig the photo was captured with. */
  rig_id: string | null;
  lens_mm: number;
  frame: Frame;
  position: number;
  created_at: string;
  updated_at: string | null;
}

export const MAX_FRAMING_NAME = 80;

const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Structural check of a frame (with an optional centre). */
export function validateFrame(v: unknown, field = "frame"): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return `${field} must be an object`;
  const f = v as Record<string, unknown>;
  if (!num(f.width_fraction, 0.01, 20) || !num(f.height_fraction, 0.01, 20)) return `${field} must have width_fraction and height_fraction (0.01..20)`;
  if (f.x !== undefined && !num(f.x, 0, 1)) return `${field}.x must be 0..1`;
  if (f.y !== undefined && !num(f.y, 0, 1)) return `${field}.y must be 0..1`;
  return null;
}

/**
 * The centre a frame can actually have: on an axis where the frame is smaller than the photo it
 * stays fully on the photo; on an axis where the rig sees more than the phone (fraction ≥ 1) it
 * cannot move, because there is no picture beyond the photo's edge.
 */
export function clampCentre(f: Frame): { x: number; y: number } {
  const axis = (c: number | undefined, size: number) => (size >= 1 ? 0.5 : Math.min(1 - size / 2, Math.max(size / 2, c ?? 0.5)));
  return { x: axis(f.x, f.width_fraction), y: axis(f.y, f.height_fraction) };
}

/** The frame with its centre clamped (and filled in). */
export const withCentre = (f: Frame): Required<Frame> => ({ width_fraction: f.width_fraction, height_fraction: f.height_fraction, ...clampCentre(f) });

/** True when the frame can be moved at all (smaller than the photo on at least one axis). */
export const canMove = (f: Frame) => f.width_fraction < 1 || f.height_fraction < 1;

/** The same centre with a new size (re-picking rig or lens keeps where the frame was). */
export const resize = (f: Frame, size: { width_fraction: number; height_fraction: number }): Required<Frame> => withCentre({ ...size, x: f.x, y: f.y });

/**
 * The frame a photo is shown with: its root framing when one is set and still exists, else the
 * as-captured frame. Both clients call this from `frameOf`.
 */
export function rootFrame(photo: { framing: Record<string, unknown> | null; framings?: readonly Framing[]; root_framing_id?: string | null }): Required<Frame> | null {
  const root = photo.root_framing_id ? photo.framings?.find((f) => f.id === photo.root_framing_id) : undefined;
  if (root) return withCentre(root.frame);
  const f = photo.framing?.frame as Partial<Frame> | undefined;
  if (!f || typeof f.width_fraction !== "number" || typeof f.height_fraction !== "number") return null;
  return withCentre({ width_fraction: f.width_fraction, height_fraction: f.height_fraction });
}

/**
 * The frame an overlay or a timeline clip is shown with: the framing it references when that still
 * exists (so it follows edits), else the frame it saved when it was set (fallback after a delete).
 */
export function referencedFrame(photo: { framings?: readonly Framing[] }, ref: { framing_id?: string | null; frame: Frame | null }): Required<Frame> | null {
  const linked = ref.framing_id ? photo.framings?.find((f) => f.id === ref.framing_id) : undefined;
  if (linked) return withCentre(linked.frame);
  return ref.frame ? withCentre(ref.frame) : null;
}
