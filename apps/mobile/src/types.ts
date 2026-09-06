export interface Preset {
  id: string;
  name: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  speedboosterFactor: number;
  createdAt: string;
  /** false until the Worker has acknowledged the PUT. */
  synced: boolean;
}

export type RigOrientation = "landscape" | "portrait";

export interface Settings {
  /** 35mm-equivalent focal length of the phone's main camera. Calibrate from EXIF or edit. */
  phoneEquivalentFocalMm: number;
  borderColor: string;
  borderWidthPx: number;
  blackoutEnabled: boolean;
  blackoutColor: string;
  rigOrientation: RigOrientation;
}

export interface ShotMetadata {
  id: string;
  timestamp: string;
  lat: number;
  lon: number;
  lens_mm: number;
  preset_id: string | null;
  extra_metadata: Record<string, unknown>;
}

export interface PendingUpload {
  metadata: ShotMetadata;
  /** Persistent local copy of the low-res JPEG. */
  fileUri: string;
  attempts: number;
  lastError?: string;
}
