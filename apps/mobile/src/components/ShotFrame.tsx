import type { StyleProp, ViewStyle } from "react-native";
import { imageHeaders, imageUri, type Shot } from "../api";
import type { Settings } from "../types";
import { FramedImage, type FrameFractions, type FrameMode } from "./FramedImage";

export { FRAME_MODES, frameModeLabel, type FrameMode } from "./FramedImage";

export function frameOf(shot: Shot): FrameFractions | null {
  const fr = (shot.extra_metadata?.framing as Record<string, unknown> | undefined)?.frame as
    | { width_fraction?: unknown; height_fraction?: unknown }
    | undefined;
  if (!fr || typeof fr.width_fraction !== "number" || typeof fr.height_fraction !== "number") return null;
  return { width: fr.width_fraction, height: fr.height_fraction };
}

export function imageAspect(shot: Shot): number {
  const im = (shot.extra_metadata?.image as { width?: number; height?: number } | undefined) ?? {};
  return im.width && im.height ? im.width / im.height : 4 / 3;
}

interface Props {
  shot: Shot;
  width: number;
  settings: Settings;
  mode: FrameMode;
  style?: StyleProp<ViewStyle>;
}

/** A stored shot rendered with its rig frame (fetched through the authenticated image proxy). */
export function ShotFrame({ shot, width, settings, mode, style }: Props) {
  return (
    <FramedImage
      source={{ uri: imageUri(shot), headers: imageHeaders() }}
      aspect={imageAspect(shot)}
      frame={frameOf(shot)}
      width={width}
      settings={settings}
      mode={mode}
      style={style}
    />
  );
}
