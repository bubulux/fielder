import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { imageHeaders, imageUri, type Shot } from "../api";
import type { Settings } from "../types";
import { Overlay } from "./Overlay";

export function frameOf(shot: Shot): { width: number; height: number } | null {
  const fr = (shot.extra_metadata?.framing as Record<string, unknown> | undefined)?.frame as
    | { width_fraction?: unknown; height_fraction?: unknown }
    | undefined;
  if (!fr || typeof fr.width_fraction !== "number" || typeof fr.height_fraction !== "number") return null;
  return { width: fr.width_fraction, height: fr.height_fraction };
}

function imageAspect(shot: Shot): number {
  const im = (shot.extra_metadata?.image as { width?: number; height?: number } | undefined) ?? {};
  return im.width && im.height ? im.width / im.height : 4 / 3;
}

interface Props {
  shot: Shot;
  width: number;
  settings: Settings;
  /** "mask" = tint outside the frame, "frame" = border only, "off" = raw photo. */
  mode: "mask" | "frame" | "off";
  style?: StyleProp<ViewStyle>;
}

/** Photo with the rig frame re-applied from the stored geometry (same layout rules as the live view). */
export function ShotFrame({ shot, width, settings, mode, style }: Props) {
  const aspect = imageAspect(shot);
  const box = { width, height: width / aspect };
  const f = frameOf(shot);
  const scale = f ? 1 / Math.max(1, f.width, f.height) : 1;
  const img = { width: box.width * scale, height: box.height * scale };
  const rect = f
    ? { width: f.width * img.width, height: f.height * img.height, left: (box.width - f.width * img.width) / 2, top: (box.height - f.height * img.height) / 2 }
    : null;
  return (
    <View style={[{ width: box.width, height: box.height, backgroundColor: "#000", overflow: "hidden" }, style]}>
      <Image
        source={{ uri: imageUri(shot), headers: imageHeaders() }}
        style={{ position: "absolute", width: img.width, height: img.height, left: (box.width - img.width) / 2, top: (box.height - img.height) / 2 }}
        contentFit="fill"
        cachePolicy="disk"
        transition={120}
      />
      {rect && mode !== "off" && (
        <Overlay preview={box} rect={rect} settings={{ ...settings, blackoutEnabled: mode === "mask" }} exceedsPreview={scale < 1} />
      )}
    </View>
  );
}
