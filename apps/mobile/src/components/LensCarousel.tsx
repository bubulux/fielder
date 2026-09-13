import { Pressable, StyleSheet, Text, View } from "react-native";
import { lensList, stepLens } from "../lens";
import type { LensRange } from "../types";
import { colors } from "./ui";

interface Props {
  lensMm: number;
  onChange: (mm: number) => void;
  /** Vertical strip (landscape phone) or horizontal strip (portrait). */
  vertical: boolean;
  /** Length of the strip along its main axis. */
  length: number;
  /** Rig lens range; limits the list to focal lengths inside it (endpoints included). */
  range: LensRange | null;
  /** Tap on the value: opens the full lens sheet (custom focal length). */
  onPressValue: () => void;
}

export function LensCarousel({ lensMm, onChange, vertical, length, range, onPressValue }: Props) {
  const list = lensList(range);
  const i = list.indexOf(lensMm);
  const atStart = i === 0 || (i < 0 && lensMm <= list[0]);
  const atEnd = i === list.length - 1 || (i < 0 && lensMm >= list[list.length - 1]);
  const prev = () => onChange(stepLens(list, lensMm, -1));
  const next = () => onChange(stepLens(list, lensMm, 1));
  return (
    <View style={[s.strip, vertical ? { width: 72, height: length, flexDirection: "column" } : { height: 64, width: length, flexDirection: "row" }]}>
      {/* In landscape, "up" = wider (shorter focal length), like a zoom ring; in portrait, left = wider. */}
      <Pressable onPress={prev} disabled={atStart} style={s.btn} hitSlop={10}>
        <Text style={[s.arrow, atStart && s.disabled]}>{vertical ? "▲" : "◀"}</Text>
      </Pressable>
      <Pressable onPress={onPressValue} style={s.value} hitSlop={6}>
        <Text style={[s.mm, i < 0 && s.custom]}>{lensMm}</Text>
        <Text style={s.unit}>mm{i < 0 ? " ·custom" : ""}</Text>
      </Pressable>
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
