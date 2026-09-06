/**
 * The one phone this app runs on. Not generic by design.
 * Motorola Edge 50 Pro, main (wide) camera: 50 MP OmniVision OV50E, f/1.4,
 * 1/1.55" sensor, 25 mm full-frame-equivalent focal length (GSMArena spec sheet).
 * The preview is the sensor's native 4:3 frame; expo-camera does not apply
 * a digital zoom at zoom=0, so the 4:3 preview shows the full 25 mm-equivalent FOV.
 */
export const PHONE = {
  model: "Motorola Edge 50 Pro",
  mainCameraEquivalentFocalMm: 25,
  sensorAspect: 4 / 3,
} as const;
