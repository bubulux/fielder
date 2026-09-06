import {
  computeFraming,
  overlayRect,
  phoneViewFromEquivalent,
  rotateFov,
  type FramingResult,
} from "@fielder/fov-math";
import { PHONE } from "./phone.ts";
import type { Preset, Settings } from "./types.ts";

export interface Box { width: number; height: number }
export interface Rect { left: number; top: number; width: number; height: number }

/** Largest 4:3 (landscape window) or 3:4 (portrait window) box that fits the window. */
export function previewBox(window: Box, sensorAspect: number = PHONE.sensorAspect): Box {
  const portrait = window.height >= window.width;
  const aspect = portrait ? 1 / sensorAspect : sensorAspect; // width / height on screen
  let width = window.width;
  let height = width / aspect;
  if (height > window.height) {
    height = window.height;
    width = height * aspect;
  }
  return { width, height };
}

export interface OverlayLayout {
  framing: FramingResult;
  /** Rig frame in preview-box coordinates. */
  rect: Rect;
  /** True when the rig sees more than the phone in at least one axis. */
  exceedsPreview: boolean;
  /**
   * Live camera image, in preview-box coordinates. Equals the whole box unless the rig
   * sees more than the phone; then the image is shrunk (and centred) so the rig frame can be
   * drawn at true proportion around it. Everything outside the image is unknown to the phone.
   */
  camera: Rect;
  /** Rig frame relative to the phone photo (centred). > 1 means the rig sees more than the phone. */
  fractions: { width: number; height: number };
  phoneFov: { horizontalFovDeg: number; verticalFovDeg: number };
}

export function computeOverlay(settings: Settings, preset: Preset, lensMm: number, preview: Box, fit = settings.fitToFrame): OverlayLayout {
  const framing = computeFraming(
    { sensor: { widthMm: preset.sensorWidthMm, heightMm: preset.sensorHeightMm }, speedboosterFactor: preset.speedboosterFactor },
    lensMm,
  );
  const phoneFov = phoneViewFromEquivalent(settings.phoneEquivalentFocalMm, preview.width / preview.height, PHONE.sensorAspect);
  // On screen, horizontal always means world-horizontal (the preview rotates with the device),
  // so the rig's horizontal FOV maps to the screen's horizontal axis unless the rig is held portrait.
  const rigFov = settings.rigOrientation === "portrait" ? rotateFov(framing.fov) : framing.fov;
  const r = overlayRect(rigFov, phoneFov);
  // Scale the camera image so the rig frame fits the box: always shrink when the rig sees
  // more than the phone; in "fit" mode also magnify (digital zoom) so the frame fills the box.
  const limit = Math.max(r.widthFraction, r.heightFraction);
  const scale = fit ? 1 / limit : 1 / Math.max(1, limit);
  const camW = preview.width * scale;
  const camH = preview.height * scale;
  const width = r.widthFraction * camW;
  const height = r.heightFraction * camH;
  return {
    framing,
    phoneFov,
    exceedsPreview: r.exceedsPreview,
    fractions: { width: r.widthFraction, height: r.heightFraction },
    camera: { left: (preview.width - camW) / 2, top: (preview.height - camH) / 2, width: camW, height: camH },
    rect: { left: (preview.width - width) / 2, top: (preview.height - height) / 2, width, height },
  };
}

export function formatDeg(d: number): string {
  return `${d.toFixed(1)}°`;
}
