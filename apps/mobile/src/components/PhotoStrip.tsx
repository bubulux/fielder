import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Image } from "expo-image";
import { imageHeaders, imageUri, type Shot } from "../api";
import { colors } from "./ui";

/** Thumbnails of a sequence; renders nothing for single-photo shots. */
export function PhotoStrip({ shot, index, onPick }: { shot: Shot; index: number; onPick: (i: number) => void }) {
  if (shot.photos.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
      {shot.photos.map((p, i) => (
        <Pressable key={p.id} onPress={() => onPick(i)} style={[s.thumb, i === index && { borderColor: colors.accent }]}>
          <Image source={{ uri: imageUri(p), headers: imageHeaders() }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" />
          <Text style={s.n}>{i + 1}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  thumb: { width: 72, height: 54, borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: "#000" },
  n: { position: "absolute", right: 4, bottom: 1, color: "#fff", fontSize: 11, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 3 },
});
