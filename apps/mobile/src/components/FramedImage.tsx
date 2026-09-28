import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageSource } from "expo-image";
import type { Settings } from "../types";
import { FIXED } from "../theme";
import { Overlay } from "./Overlay";
import { Seg } from "./ui";

/** "mask" = neutral dark mask outside the frame, "frame" = border only, "fit" = crop to the frame, "off" = raw photo. */
export type FrameMode = "mask" | "frame" | "fit" | "off";
export const FRAME_MODES: readonly FrameMode[] = ["mask", "frame", "fit", "off"];
export const frameModeLabel = (m: FrameMode) => (m === "off" ? "Raw" : m[0].toUpperCase() + m.slice(1));

export interface FrameFractions { width: number; height: number }

interface Props {
  source: ImageSource;
  /** Photo aspect ratio (w/h). */
  aspect: number;
  /** Rig frame relative to the photo, centred; null when unknown. */
  frame: FrameFractions | null;
  width: number;
  settings: Settings;
  mode: FrameMode;
  style?: StyleProp<ViewStyle>;
}

/** A photo with the rig frame re-applied from its geometry (same layout rules as the live view). */
export function FramedImage({ source, aspect, frame: f, width, settings, mode, style }: Props) {
  // Fit = the box is the rig frame. Where the rig saw more than the phone (fraction > 1) the photo
  // covers less than the box and the rest stays black, like the live view.
  const fit = mode === "fit" && !!f;
  const box = fit && f
    ? { width, height: width / (aspect * (f.width / f.height)) }
    : { width, height: width / aspect };
  let img: { width: number; height: number };
  let rect: { left: number; top: number; width: number; height: number } | null = null;
  if (fit && f) {
    img = { width: box.width / f.width, height: box.height / f.height };
  } else {
    const scale = f ? 1 / Math.max(1, f.width, f.height) : 1;
    img = { width: box.width * scale, height: box.height * scale };
    if (f) rect = { width: f.width * img.width, height: f.height * img.height, left: (box.width - f.width * img.width) / 2, top: (box.height - f.height * img.height) / 2 };
  }
  const shrunk = img.width < box.width - 0.5 || img.height < box.height - 0.5;
  return (
    <View style={[{ width: box.width, height: box.height, backgroundColor: FIXED.photoBg, overflow: "hidden" }, style]}>
      <Image
        source={source}
        style={{ position: "absolute", width: img.width, height: img.height, left: (box.width - img.width) / 2, top: (box.height - img.height) / 2 }}
        contentFit="fill"
        cachePolicy="disk"
        transition={120}
      />
      {rect && mode !== "off" && (
        <Overlay preview={box} rect={rect} settings={{ ...settings, blackoutEnabled: mode === "mask" }} exceedsPreview={shrunk} neutral />
      )}
    </View>
  );
}

/** Mask / Frame / Fit / Raw switch shown under photos. */
export function FrameModeSeg({ value, onChange, block }: { value: FrameMode; onChange: (m: FrameMode) => void; block?: boolean }) {
  return <Seg size="lg" block={block} accessibilityLabel="How to show the rig frame" value={value} onChange={onChange} options={FRAME_MODES.map((m) => ({ id: m, label: frameModeLabel(m) }))} />;
}
