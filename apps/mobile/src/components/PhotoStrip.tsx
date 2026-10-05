import { Pressable, ScrollView, Text } from "react-native";
import { Image } from "expo-image";
import { imageHeaders, imageUri, type Shot } from "../api";
import { FIXED, makeStyles, RADIUS, type, useTheme } from "../ui";

/** Thumbnails of a sequence; renders nothing for single-photo shots. The current one has an accent ring and number. */
export function PhotoStrip({ shot, index, onPick }: { shot: Shot; index: number; onPick: (i: number) => void }) {
  const s = useStyles();
  const { c } = useTheme();
  if (shot.photos.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
      {shot.photos.map((p, i) => (
        <Pressable key={p.id} onPress={() => onPick(i)} style={[s.thumb, i === index && s.thumbOn]} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`} accessibilityState={{ selected: i === index }}>
          <Image source={{ uri: imageUri(p), headers: imageHeaders() }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" />
          <Text style={[s.n, i === index && { backgroundColor: c.accent, color: c.onAccent }]}>{i + 1}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  thumb: { width: 75, height: 56, borderRadius: RADIUS.sm, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: FIXED.photoBg },
  thumbOn: { borderWidth: 3, borderColor: c.accent },
  n: { position: "absolute", left: 3, bottom: 3, backgroundColor: FIXED.black, color: FIXED.white, ...type("caption", "bold"), fontSize: 11, lineHeight: 13, paddingHorizontal: 5, paddingVertical: 2, borderRadius: RADIUS.xs, overflow: "hidden" },
}));
