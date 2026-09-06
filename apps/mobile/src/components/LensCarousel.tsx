import { Pressable, StyleSheet, Text, View } from "react-native";
import { LENS_PRESETS_MM } from "@fielder/fov-math";
import { colors } from "./ui";

interface Props {
  lensMm: number;
  onChange: (mm: number) => void;
  /** Vertical strip (landscape phone) or horizontal strip (portrait). */
  vertical: boolean;
  /** Length of the strip along its main axis. */
  length: number;
}

const LENSES = LENS_PRESETS_MM as readonly number[];

/** Step through the built-in focal lengths. For a custom value, stepping goes to the nearest neighbour in the list. */
function step(current: number, dir: -1 | 1): number {
  const i = LENSES.indexOf(current);
  if (i >= 0) return LENSES[Math.min(LENSES.length - 1, Math.max(0, i + dir))];
  const next = dir > 0 ? LENSES.find((mm) => mm > current) : [...LENSES].reverse().find((mm) => mm < current);
  return next ?? current;
}

export function LensCarousel({ lensMm, onChange, vertical, length }: Props) {
  const i = LENSES.indexOf(lensMm);
  const atStart = i === 0 || (i < 0 && lensMm <= LENSES[0]);
  const atEnd = i === LENSES.length - 1 || (i < 0 && lensMm >= LENSES[LENSES.length - 1]);
  const prev = () => onChange(step(lensMm, -1));
  const next = () => onChange(step(lensMm, 1));
  return (
    <View style={[s.strip, vertical ? { width: 72, height: length, flexDirection: "column" } : { height: 64, width: length, flexDirection: "row" }]}>
      {/* In landscape, "up" = wider (shorter focal length), like a zoom ring; in portrait, left = wider. */}
      <Pressable onPress={prev} disabled={atStart} style={s.btn} hitSlop={10}>
        <Text style={[s.arrow, atStart && s.disabled]}>{vertical ? "▲" : "◀"}</Text>
      </Pressable>
      <View style={s.value}>
        <Text style={[s.mm, i < 0 && s.custom]}>{lensMm}</Text>
        <Text style={s.unit}>mm{i < 0 ? " ·custom" : ""}</Text>
      </View>
      <Pressable onPress={next} disabled={atEnd} style={s.btn} hitSlop={10}>
        <Text style={[s.arrow, atEnd && s.disabled]}>{vertical ? "▼" : "▶"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  strip: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  arrow: { color: colors.text, fontSize: 22 },
  disabled: { color: colors.border },
  value: { alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  mm: { color: colors.accent, fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  custom: { color: colors.text },
  unit: { color: colors.dim, fontSize: 10, marginTop: -2 },
});
