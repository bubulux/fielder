import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { FIXED, Icon, makeStyles, num, type, useTheme } from "../ui";

/** Solid chip over the camera image (chrome colours, or warn / danger fills), never translucent text. */
export function HudChip({ icon, kind, iconColor, onPress, label, children }: { icon: string; kind?: "warn" | "danger"; iconColor?: string; onPress?: () => void; label?: string; children: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  const fg = kind === "warn" ? c.onWarn : kind === "danger" ? FIXED.white : c.chromeText;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={label}
      style={({ pressed }) => [s.chip, kind === "warn" && s.warn, kind === "danger" && s.danger, pressed && { borderColor: c.accent }, onPress && { minHeight: 40 }]}>
      <Icon name={icon} size={17} color={iconColor ?? fg} />
      <Text style={[s.text, { color: fg }]}>{children}</Text>
      {onPress && <Icon name="chevron-down" size={17} color={fg} />}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", minHeight: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: c.chromeBg, borderWidth: 1.5, borderColor: c.chromeBorder },
  warn: { backgroundColor: c.warn, borderColor: FIXED.black },
  danger: { backgroundColor: FIXED.record, borderColor: FIXED.white },
  text: { ...type("hud", "bold"), ...num, flexShrink: 1 },
}));
