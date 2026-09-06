import { OVERLAY_DEFAULTS } from "@fielder/fov-math";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  phoneEquivalentFocalMm: 26,
  borderColor: OVERLAY_DEFAULTS.borderColor,
  borderWidthPx: OVERLAY_DEFAULTS.borderWidthPx,
  blackoutEnabled: OVERLAY_DEFAULTS.blackoutEnabled,
  blackoutColor: OVERLAY_DEFAULTS.blackoutColor,
  rigOrientation: "landscape",
};
