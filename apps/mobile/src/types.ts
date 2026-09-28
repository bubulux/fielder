import type { Extra } from "@fielder/vocab";

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
  /** Human button: "cycle" steps off -> 35 -> 43 -> 50 -> off; "toggle" flips between off and humanViewFocalMm. */
  humanViewButton: "cycle" | "toggle";
  /** Skip the tag form after a capture: every shot (or finished sequence) goes straight into the upload queue. */
  directUpload: boolean;
  /** Record a detailed log on the phone that can be shared for debugging. */
  loggingEnabled: boolean;
  /** Show the info overlay (rig, math, warnings) on the live view. */
  hudEnabled: boolean;
  /** "auto" follows the phone's dark mode; "sun" = light (daylight), "set" = dark. */
  theme: "auto" | "sun" | "set";
}

/** Scouting tags entered in the review form after capture. Values are @fielder/vocab ids; null / [] / false = not specified. */
export interface ShotTags {
  name: string | null;
  /** Daylight phases the shot works in (subset of LIGHT). */
  light: string[];
  /** Lit artificially, independent of the daylight phases. */
  artificial: boolean;
  weather: string | null;
  int_ext: string | null;
  location_id: string | null;
  extra: Extra;
}

/** One captured image. Rig/lens framing and GPS are per photo (a sequence can change lens). */
export interface PhotoMetadata {
  id: string;
  /** Position inside the shot, 0-based. */
  ordinal: number;
  timestamp: string;
  lat: number;
  lon: number;
  gps_accuracy_m: number | null;
  lens_mm: number;
  preset_id: string | null;
  width: number;
  height: number;
  /** Rig/lens snapshot incl. `frame` fractions, so the dashboard can re-apply the mask. */
  framing: Record<string, unknown>;
  /** Phone model, EXIF focal lengths, GPS extras. */
  device: Record<string, unknown>;
}

/** What POST /api/shots receives: the shot's tags plus its photos. */
export interface ShotMetadata extends ShotTags {
  id: string;
  project_id: string;
  photos: PhotoMetadata[];
}

/** A named place; lives on the server, cached locally so the form works offline. Shared by all projects. */
export interface LocationEntry {
  id: string;
  name: string;
  createdAt: string;
  /** false until the Worker has acknowledged the PUT. */
  synced: boolean;
}

/** Every shot belongs to one; the active one is chosen once and remembered. Cached locally like locations. */
export interface ProjectEntry {
  id: string;
  name: string;
  createdAt: string;
  /** Extra-field definitions the project uses, in order (see /vocab fields.ts). */
  fieldIds?: string[];
  /** false until the Worker has acknowledged the PUT. */
  synced: boolean;
}

export interface PendingUpload {
  metadata: ShotMetadata;
  /** Persistent local copy of each photo's low-res JPEG, by photo id. */
  files: Record<string, string>;
  attempts: number;
  lastError?: string;
  /** Rejected by the server repeatedly: kept on the phone, only retried by hand (Setup → Uploads). */
  stuck?: boolean;
}
/** One captured photo waiting for the tag form or the queue. */
export interface DraftPhoto {
  /** Local file (temp for single captures, persistent for sequences). */
  uri: string;
  meta: PhotoMetadata;
  /** Rig frame relative to the photo, for the preview. */
  frame: { width: number; height: number };
}

/** A capture (one photo) or a sequence (many) that is not queued yet. */
export interface CaptureDraft {
  shotId: string;
  photos: DraftPhoto[];
}
