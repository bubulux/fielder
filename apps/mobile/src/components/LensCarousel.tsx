import { Pressable, Text, View } from "react-native";
import { lensList, stepLens } from "../lens";
import { makeStyles, num, RADIUS, type, useTheme } from "../theme";
import type { LensRange } from "../types";
import { Icon } from "./ui";

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

/** Viewfinder chrome: wider / focal length / longer, on an opaque bar so it reads over the camera image. */
export function LensCarousel({ lensMm, onChange, vertical, length, range, onPressValue }: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const list = lensList(range);
  const i = list.indexOf(lensMm);
  const atStart = i === 0 || (i < 0 && lensMm <= list[0]);
  const atEnd = i === list.length - 1 || (i < 0 && lensMm >= list[list.length - 1]);
  const prev = () => onChange(stepLens(list, lensMm, -1));
  const next = () => onChange(stepLens(list, lensMm, 1));
  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <Pressable onPress={dir < 0 ? prev : next} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={dir < 0 ? "Wider lens" : "Longer lens"}
      style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.surfaceSunken }, disabled && s.btnOff]}>
      {/* In landscape, "up" = wider (shorter focal length), like a zoom ring; in portrait, left = wider. */}
      <Icon name={vertical ? (dir < 0 ? "chevron-up" : "chevron-down") : dir < 0 ? "chevron-left" : "chevron-right"} size={28} color={disabled ? c.textDisabled : c.chromeText} />
    </Pressable>
  );
  return (
    <View style={[s.strip, vertical ? { width: 76, height: length, flexDirection: "column", borderRightWidth: 2 } : { height: 68, width: length, flexDirection: "row", borderTopWidth: 2 }]}>
      {arrow(-1, atStart)}
      <Pressable onPress={onPressValue} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Lens ${lensMm} mm, tap for all focal lengths`}
        style={({ pressed }) => [s.value, pressed && { backgroundColor: c.accentPressed }]}>
        <Text style={s.mm}>{lensMm}</Text>
        <Text style={s.unit}>{i < 0 ? "mm · custom" : "mm"}</Text>
      </Pressable>
      {arrow(1, atEnd)}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  strip: { alignItems: "center", justifyContent: "center", gap: 6, padding: 6, backgroundColor: c.chromeBg, borderColor: c.chromeBorder },
  btn: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: c.chromeBorder },
  btnOff: { borderStyle: "dashed", borderColor: c.textDisabled },
  value: { alignItems: "center", justifyContent: "center", minWidth: 64, minHeight: 52, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: c.accent },
  mm: { ...type("title", "heavy"), color: c.onAccent, ...num },
  unit: { ...type("caption", "semibold"), fontSize: 11, lineHeight: 12, color: c.onAccent },
}));
