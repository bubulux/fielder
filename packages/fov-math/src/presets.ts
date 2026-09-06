/** Built-in defaults agreed on 2026-09-06. Users can add custom entries in-app. */

export interface SensorSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export const FULL_FRAME: SensorSize = { id: "ff", name: "Full Frame", widthMm: 36, heightMm: 24 };

/** Sensor areas are now defined per camera body and recording format; see cameras.ts. */

/** 1.0 means no speedbooster / focal reducer. */
export const SPEEDBOOSTER_PRESETS: readonly number[] = [1.0, 0.71, 0.64, 0.58];

export const LENS_PRESETS_MM: readonly number[] = [
  12, 14, 16, 18, 20, 24, 28, 35, 40, 50, 58, 85, 105, 135,
];

export const OVERLAY_DEFAULTS = {
  borderColor: "#FFFFFF",
  borderWidthPx: 2,
  blackoutEnabled: false,
  blackoutColor: "rgba(255, 0, 0, 0.5)",
} as const;
