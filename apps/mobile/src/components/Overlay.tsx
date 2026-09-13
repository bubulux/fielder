import { StyleSheet, Text, View } from "react-native";
import type { Box, Rect } from "../framing";
import type { Settings } from "../types";

interface Props {
  preview: Box;
  rect: Rect;
  settings: Settings;
  exceedsPreview: boolean;
  /** Optional human-view reference frame (thin cyan line, no blackout). */
  human?: { rect: Rect; fits: boolean } | null;
}

export const HUMAN_COLOR = "#00E5FF";

/** Frame rectangle plus optional blackout outside it. Pure layout, no per-frame work. */
export function Overlay({ preview, rect, settings, exceedsPreview, human }: Props) {
  const right = preview.width - rect.left - rect.width;
  const bottom = preview.height - rect.top - rect.height;
  const tint = settings.blackoutEnabled ? settings.blackoutColor : "transparent";
  const borderColor = settings.borderColor;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: preview.width, height: preview.height }]}>
      {settings.blackoutEnabled && (
        <>
          <View style={{ position: "absolute", left: 0, top: 0, right: 0, height: rect.top, backgroundColor: tint }} />
          <View style={{ position: "absolute", left: 0, bottom: 0, right: 0, height: bottom, backgroundColor: tint }} />
          <View style={{ position: "absolute", left: 0, top: rect.top, width: rect.left, height: rect.height, backgroundColor: tint }} />
          <View style={{ position: "absolute", right: 0, top: rect.top, width: right, height: rect.height, backgroundColor: tint }} />
        </>
      )}
      <View
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderWidth: settings.borderWidthPx,
          borderColor,
          borderStyle: exceedsPreview ? "dashed" : "solid", // dashed = frame extends beyond what the phone can see
        }}
      />
      {human && (
        <View
          style={{
            position: "absolute",
            left: human.rect.left,
            top: human.rect.top,
            width: human.rect.width,
            height: human.rect.height,
            borderWidth: 1,
            borderColor: HUMAN_COLOR,
            borderStyle: human.fits ? "solid" : "dashed",
          }}
        >
          <Text style={{ position: "absolute", left: 4, top: 2, color: HUMAN_COLOR, fontSize: 10, letterSpacing: 0.5 }}>human</Text>
        </View>
      )}
    </View>
  );
}
