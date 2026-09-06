/** Built-in defaults agreed on 2026-09-06. Users can add custom entries in-app. */

export interface SensorSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export const FULL_FRAME: SensorSize = { id: "ff", name: "Full Frame", widthMm: 36, heightMm: 24 };

export const SENSOR_PRESETS: readonly SensorSize[] = [
  { id: "mft", name: "Micro Four Thirds", widthMm: 17.3, heightMm: 13 },
  { id: "apsc-canon", name: "APS-C (Canon)", widthMm: 22.3, heightMm: 14.9 },
  { id: "apsc", name: "APS-C (Sony/Nikon/Fuji)", widthMm: 23.5, heightMm: 15.6 },
  { id: "s35", name: "Super 35", widthMm: 24.89, heightMm: 18.66 },
  FULL_FRAME,
  { id: "1inch", name: '1"', widthMm: 13.2, heightMm: 8.8 },
];

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
