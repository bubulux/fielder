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
  rect: Rect;
  exceedsPreview: boolean;
  phoneFov: { horizontalFovDeg: number; verticalFovDeg: number };
}

export function computeOverlay(settings: Settings, preset: Preset, lensMm: number, preview: Box): OverlayLayout {
  const framing = computeFraming(
    { sensor: { widthMm: preset.sensorWidthMm, heightMm: preset.sensorHeightMm }, speedboosterFactor: preset.speedboosterFactor },
    lensMm,
  );
  const phoneFov = phoneViewFromEquivalent(settings.phoneEquivalentFocalMm, preview.width / preview.height, PHONE.sensorAspect);
  // On screen, horizontal always means world-horizontal (the preview rotates with the device),
  // so the rig's horizontal FOV maps to the screen's horizontal axis unless the rig is held portrait.
  const rigFov = settings.rigOrientation === "portrait" ? rotateFov(framing.fov) : framing.fov;
  const r = overlayRect(rigFov, phoneFov);
  const width = Math.min(r.widthFraction, 1) * preview.width;
  const height = Math.min(r.heightFraction, 1) * preview.height;
  return {
    framing,
    phoneFov,
    exceedsPreview: r.exceedsPreview,
    rect: { left: (preview.width - width) / 2, top: (preview.height - height) / 2, width, height },
  };
}

export function formatDeg(d: number): string {
  return `${d.toFixed(1)}°`;
}
