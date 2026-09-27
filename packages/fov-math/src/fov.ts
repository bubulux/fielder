import { FULL_FRAME, type SensorSize } from "./presets.ts";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface Rig {
  sensor: Pick<SensorSize, "widthMm" | "heightMm">;
  /** Focal reducer factor. 1.0 = none. Must be > 0. */
  speedboosterFactor: number;
}

export interface FovDeg {
  horizontal: number;
  vertical: number;
  diagonal: number;
}

export interface FramingResult {
  /** Lens focal length after the speedbooster (mm): lens × factor. A 0.64 reducer makes an 18 mm behave like 11.5 mm. */
  effectiveFocalLengthMm: number;
  /** Crop factor of the bare sensor vs. full frame, by diagonal. */
  sensorCropFactor: number;
  /** Crop factor including the speedbooster (what the image actually looks like). */
  effectiveCropFactor: number;
  /** Full-frame equivalent focal length (mm). */
  fullFrameEquivalentMm: number;
  fov: FovDeg;
}

export function diagonalMm(s: Pick<SensorSize, "widthMm" | "heightMm">): number {
  return Math.hypot(s.widthMm, s.heightMm);
}

/** Angle of view of one sensor dimension for a rectilinear lens focused at infinity. */
export function angleOfViewDeg(dimensionMm: number, focalLengthMm: number): number {
  return 2 * Math.atan(dimensionMm / (2 * focalLengthMm)) * DEG;
}

export function computeFraming(rig: Rig, lensMm: number): FramingResult {
  if (!(rig.speedboosterFactor > 0)) throw new RangeError("speedboosterFactor must be > 0");
  if (!(lensMm > 0)) throw new RangeError("lensMm must be > 0");

  const effectiveFocalLengthMm = lensMm * rig.speedboosterFactor;
  const sensorCropFactor = diagonalMm(FULL_FRAME) / diagonalMm(rig.sensor);
  const effectiveCropFactor = sensorCropFactor * rig.speedboosterFactor;

  return {
    effectiveFocalLengthMm,
    sensorCropFactor,
    effectiveCropFactor,
    fullFrameEquivalentMm: lensMm * effectiveCropFactor,
    fov: {
      horizontal: angleOfViewDeg(rig.sensor.widthMm, effectiveFocalLengthMm),
      vertical: angleOfViewDeg(rig.sensor.heightMm, effectiveFocalLengthMm),
      diagonal: angleOfViewDeg(diagonalMm(rig.sensor), effectiveFocalLengthMm),
    },
  };
}

export interface PhoneView {
  /** Horizontal angle of view of what is visible in the preview (deg). */
  horizontalFovDeg: number;
  /** Vertical angle of view of what is visible in the preview (deg). */
  verticalFovDeg: number;
}

/**
 * Approximate the phone preview's FOV from a 35mm-equivalent focal length
 * (most Android main cameras are 23-27mm equiv.) and the preview aspect ratio.
 * Assumes the preview is a centre crop of the sensor along its longer axis,
 * so the shorter axis (relative to the crop) keeps the full sensor coverage.
 */
export function phoneViewFromEquivalent(
  equivalentFocalMm: number,
  previewAspect: number, // width / height of the preview as laid out (e.g. 3/4 in portrait)
  sensorAspect = 4 / 3,   // native sensor aspect (width / height, landscape)
): PhoneView {
  // Work in landscape orientation for the sensor, then map to the preview.
  const landscapeAspect = previewAspect >= 1 ? previewAspect : 1 / previewAspect;
  // Equivalent sensor dims on a 4:3 sensor whose diagonal equals FF (43.27mm).
  const ffDiag = diagonalMm(FULL_FRAME);
  const nativeH = ffDiag / Math.hypot(sensorAspect, 1);
  const nativeW = nativeH * sensorAspect;
  // Preview wider than sensor: keep width, crop height. Otherwise keep height, crop width.
  const w = landscapeAspect >= sensorAspect ? nativeW : nativeH * landscapeAspect;
  const h = landscapeAspect >= sensorAspect ? nativeW / landscapeAspect : nativeH;
  const long = angleOfViewDeg(w, equivalentFocalMm);
  const short = angleOfViewDeg(h, equivalentFocalMm);
  return previewAspect >= 1
    ? { horizontalFovDeg: long, verticalFovDeg: short }
    : { horizontalFovDeg: short, verticalFovDeg: long };
}

export interface OverlayRect {
  /** Fraction of preview width/height the rig's frame occupies, centred. May exceed 1. */
  widthFraction: number;
  heightFraction: number;
  /** True when the rig sees more than the phone in at least one axis. */
  exceedsPreview: boolean;
}

/**
 * Size of the rig's frame relative to the phone preview. Both are rectilinear
 * projections sharing an optical axis, so on-screen extent scales with tan(fov/2).
 * `rigFov` is given in the same orientation as the phone preview: pass the rig's
 * horizontal FOV as the axis that is horizontal on screen.
 */
export function overlayRect(rigFov: { horizontal: number; vertical: number }, phone: PhoneView): OverlayRect {
  const widthFraction = Math.tan((rigFov.horizontal / 2) * RAD) / Math.tan((phone.horizontalFovDeg / 2) * RAD);
  const heightFraction = Math.tan((rigFov.vertical / 2) * RAD) / Math.tan((phone.verticalFovDeg / 2) * RAD);
  return { widthFraction, heightFraction, exceedsPreview: widthFraction > 1 || heightFraction > 1 };
}

/** Swap axes for portrait phone orientation with a landscape rig frame. */
export function rotateFov(fov: { horizontal: number; vertical: number }) {
  return { horizontal: fov.vertical, vertical: fov.horizontal };
}

/**
 * The phone's view of a stored photo, recovered from the rig FOV the photo was framed with
 * (already on the photo's axes, i.e. rotated for a portrait rig) and the frame fractions.
 * Inverse of overlayRect: lets any other rig/lens be framed on an existing photo.
 */
export function phoneViewFromFrame(rigFov: { horizontal: number; vertical: number }, frame: { widthFraction: number; heightFraction: number }): PhoneView {
  return {
    horizontalFovDeg: 2 * Math.atan(Math.tan((rigFov.horizontal / 2) * RAD) / frame.widthFraction) * DEG,
    verticalFovDeg: 2 * Math.atan(Math.tan((rigFov.vertical / 2) * RAD) / frame.heightFraction) * DEG,
  };
}

/** A rig + lens as needed to frame it on a photo. */
export interface RigLens { rig: Rig; lensMm: number; portrait?: boolean }

/** Rig FOV on the photo's axes (portrait rigs swap horizontal and vertical). */
export function fovOnPhoto(x: RigLens): { horizontal: number; vertical: number } {
  const fov = computeFraming(x.rig, x.lensMm).fov;
  return x.portrait ? rotateFov(fov) : fov;
}

/**
 * Where `target` would frame on a photo that was taken while `source` was framed at
 * `sourceFrame`. Fractions > 1 mean the target sees more than the photo contains.
 */
export function reframe(source: RigLens, sourceFrame: { widthFraction: number; heightFraction: number }, target: RigLens): OverlayRect {
  return overlayRect(fovOnPhoto(target), phoneViewFromFrame(fovOnPhoto(source), sourceFrame));
}
