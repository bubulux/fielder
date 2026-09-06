import { useEffect, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LENS_PRESETS_MM } from "@fielder/fov-math";
import { colors } from "./ui";

const ITEM = 56;

interface Props {
  lensMm: number;
  onChange: (mm: number) => void;
  /** Vertical strip (landscape phone) or horizontal strip (portrait). */
  vertical: boolean;
  /** Length of the strip along its scroll axis. */
  length: number;
}

/** One-tap / swipe lens picker over the built-in focal lengths. Custom values still go through the Lens sheet. */
export function LensCarousel({ lensMm, onChange, vertical, length }: Props) {
  const list = useRef<FlatList<number>>(null);
  const data = LENS_PRESETS_MM as number[];
  const index = data.indexOf(lensMm);
  const pad = Math.max(0, (length - ITEM) / 2);

  useEffect(() => {
    if (index >= 0) list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, [index, vertical, length]);

  return (
    <View style={vertical ? { width: 72, height: length } : { height: 64, width: length }}>
      <FlatList
        ref={list}
        data={data}
        horizontal={!vertical}
        keyExtractor={(mm) => String(mm)}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        contentContainerStyle={vertical ? { paddingVertical: pad } : { paddingHorizontal: pad }}
        getItemLayout={(_, i) => ({ length: ITEM, offset: ITEM * i, index: i })}
        onMomentumScrollEnd={(e) => {
          const off = vertical ? e.nativeEvent.contentOffset.y : e.nativeEvent.contentOffset.x;
          const i = Math.min(data.length - 1, Math.max(0, Math.round(off / ITEM)));
          if (data[i] !== lensMm) onChange(data[i]);
        }}
        renderItem={({ item }) => {
          const sel = item === lensMm;
          return (
            <Pressable onPress={() => onChange(item)} style={[s.item, vertical ? { height: ITEM } : { width: ITEM }]}>
              <Text style={[s.mm, sel && s.mmSel]}>{item}</Text>
              {sel && <Text style={s.unit}>mm</Text>}
            </Pressable>
          );
        }}
      />
      {/* centre marker */}
      <View pointerEvents="none" style={[s.marker, vertical ? { top: pad, left: 4, right: 4, height: ITEM } : { left: pad, top: 4, bottom: 4, width: ITEM }]} />
    </View>
  );
}

const s = StyleSheet.create({
  item: { alignItems: "center", justifyContent: "center" },
  mm: { color: colors.dim, fontSize: 18, fontVariant: ["tabular-nums"] },
  mmSel: { color: colors.accent, fontSize: 22, fontWeight: "700" },
  unit: { color: colors.accent, fontSize: 10, marginTop: -2 },
  marker: { position: "absolute", borderRadius: 10, borderWidth: 1, borderColor: colors.border },
});
