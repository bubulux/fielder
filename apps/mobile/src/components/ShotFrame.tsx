import type { StyleProp, ViewStyle } from "react-native";
import { imageHeaders, imageUri, type Photo } from "../api";
import { offlinePhotoUri } from "../offline";
import type { Settings } from "../types";
import { FramedImage, type FrameFractions, type FrameMode } from "./FramedImage";

export { FRAME_MODES, frameModeLabel, type FrameMode } from "./FramedImage";

export function frameOf(photo: Photo): FrameFractions | null {
  const fr = photo.framing?.frame as { width_fraction?: unknown; height_fraction?: unknown } | undefined;
  if (!fr || typeof fr.width_fraction !== "number" || typeof fr.height_fraction !== "number") return null;
  return { width: fr.width_fraction, height: fr.height_fraction };
}

/** Photo aspect ratio (w/h) as uploaded; 4:3 when unknown. */
export const imageAspect = (photo: Photo): number => (photo.width && photo.height ? photo.width / photo.height : 4 / 3);

interface Props {
  photo: Photo;
  width: number;
  settings: Settings;
  mode: FrameMode;
  style?: StyleProp<ViewStyle>;
}

/** A stored photo rendered with its rig frame: the offline copy if there is one, else through the authenticated image proxy. */
export function ShotFrame({ photo, width, settings, mode, style }: Props) {
  const local = offlinePhotoUri(photo);
  return (
    <FramedImage
      source={local ? { uri: local } : { uri: imageUri(photo), headers: imageHeaders() }}
      aspect={imageAspect(photo)}
      frame={frameOf(photo)}
      width={width}
      settings={settings}
      mode={mode}
      style={style}
    />
  );
}
