export interface Preset {
  id: string;
  name: string;
  /** Camera body + recording format from @fielder/fov-math CAMERAS, or null for a custom sensor. */
  cameraId: string | null;
  formatId: string | null;
  /** Resolved active sensor area; source of truth for the math. */
  sensorWidthMm: number;
  sensorHeightMm: number;
  speedboosterFactor: number;
  /** Optional focal-length range of the lens on this rig (e.g. 18-35 zoom); null = any lens. */
  lensMinMm: number | null;
  lensMaxMm: number | null;
  createdAt: string;
  /** false until the Worker has acknowledged the PUT. */
  synced: boolean;
}

export interface LensRange { min: number; max: number }
export const lensRangeOf = (p: Preset | null | undefined): LensRange | null =>
  p && p.lensMinMm != null && p.lensMaxMm != null ? { min: p.lensMinMm, max: p.lensMaxMm } : null;

export type RigOrientation = "landscape" | "portrait";
/** Screen orientation the app locks to on launch; "auto" follows the sensor. */
export type OrientationLock = "auto" | "landscape" | "portrait";

export interface Settings {
  /** 35mm-equivalent focal length of the phone's main camera. Calibrate from EXIF or edit. */
  phoneEquivalentFocalMm: number;
  borderColor: string;
  borderWidthPx: number;
  blackoutEnabled: boolean;
  blackoutColor: string;
  rigOrientation: RigOrientation;
  /** Digitally scale the preview so the rig frame fills the screen. */
  fitToFrame: boolean;
  orientationLock: OrientationLock;
  /** Draw a second, thin frame showing roughly what a human sees (a "normal" lens, in FF-equivalent mm). */
  humanViewEnabled: boolean;
  humanViewFocalMm: number;
  /** Show the info overlay (rig, math, warnings) on the live view. */
  hudEnabled: boolean;
}

/** Scouting tags entered in the review form after capture. Values are @fielder/vocab ids. */
export interface ShotTags {
  name: string;
  light: string;
  weather: string;
  int_ext: string;
  location_id: string;
  /** Optional named collections, e.g. { ubahn: "U1 - Kurfürstendamm" }; see EXTRA_COLLECTIONS in @fielder/vocab. */
  extra: Record<string, string>;
}

export interface ShotMetadata extends ShotTags {
  id: string;
  timestamp: string;
  lat: number;
  lon: number;
  lens_mm: number;
  preset_id: string | null;
  extra_metadata: Record<string, unknown>;
}

/** A named place; lives on the server, cached locally so the form works offline. */
export interface LocationEntry {
  id: string;
  name: string;
  district: string;
  createdAt: string;
  /** false until the Worker has acknowledged the PUT. */
  synced: boolean;
}

export interface PendingUpload {
  metadata: ShotMetadata;
  /** Persistent local copy of the low-res JPEG. */
  fileUri: string;
  attempts: number;
  lastError?: string;
}
