import { OVERLAY_DEFAULTS } from "@fielder/fov-math";
import { PHONE } from "./phone.ts";
import type { Settings } from "./types.ts";

export const DEFAULT_SETTINGS: Settings = {
  phoneEquivalentFocalMm: PHONE.mainCameraEquivalentFocalMm,
  borderColor: OVERLAY_DEFAULTS.borderColor,
  borderWidthPx: OVERLAY_DEFAULTS.borderWidthPx,
  blackoutEnabled: OVERLAY_DEFAULTS.blackoutEnabled,
  blackoutColor: OVERLAY_DEFAULTS.blackoutColor,
  rigOrientation: "landscape",
  fitToFrame: false,
  orientationLock: "auto",
  humanViewEnabled: false,
  humanViewFocalMm: 50,
  humanViewButton: "cycle",
  directUpload: false,
  loggingEnabled: false,
  hudEnabled: true,
};
