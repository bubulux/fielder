import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { FramedImage, FRAME_MODES, frameModeLabel, type FrameMode } from "../components/FramedImage";
import { TagsForm } from "../components/TagsForm";
import { Chip, ChipRow, colors } from "../components/ui";
import type { CaptureDraft, LocationEntry, Settings, ShotTags } from "../types";

interface Props {
  draft: CaptureDraft | null;
  settings: Settings;
  locations: LocationEntry[];
  /** Shots already taken at a location (uploaded + pending). */
  countAt: (locationId: string) => number;
  onUpload: (tags: ShotTags, newLocation: LocationEntry | null) => void;
  onDiscard: () => void;
}

/** Consecutive shots usually share place and conditions: remember them, but never the name. */
let lastTags: Partial<ShotTags> = {};

/** Capture (or finished sequence) -> this form -> Upload or Discard. Every field is optional. */
export function ShotReview({ draft, settings, locations, countAt, onUpload, onDiscard }: Props) {
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("mask");
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [draft?.shotId]);
  if (!draft || draft.photos.length === 0) return null;

  const current = draft.photos[Math.min(index, draft.photos.length - 1)];
  const photoWidth = portrait ? width - 32 : Math.min(width * 0.45, height * 1.3);
  const photo = (
    <View style={{ alignItems: "center" }}>
      <FramedImage source={{ uri: current.uri }} aspect={current.meta.width / current.meta.height} frame={current.frame} width={photoWidth} settings={settings} mode={mode} style={{ borderRadius: 8 }} />
      {draft.photos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: photoWidth }} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
          {draft.photos.map((p, i) => (
            <Pressable key={p.meta.id} onPress={() => setIndex(i)} style={[s.thumb, i === index && { borderColor: colors.accent }]}>
              <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ marginTop: 8 }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
      </View>
    </View>
  );
  const form = (
    <TagsForm
      key={draft.shotId}
      initial={{ ...lastTags, name: null }}
      locations={locations}
      countAt={countAt}
      submitLabel={draft.photos.length > 1 ? `Upload ${draft.photos.length} photos` : "Upload"}
      cancelLabel="Discard"
      onCancel={onDiscard}
      onSubmit={(tags, newLoc) => { lastTags = { light: tags.light, artificial: tags.artificial, weather: tags.weather, int_ext: tags.int_ext, location_id: tags.location_id }; onUpload(tags, newLoc); }}
    />
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onDiscard}>
      <View style={s.root}>
        <View style={s.header}><Text style={s.title}>{draft.photos.length > 1 ? `New sequence · ${draft.photos.length} photos` : "New shot"}</Text></View>
        {portrait ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {photo}
            {form}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, flexDirection: "row" }}>
            <ScrollView contentContainerStyle={{ padding: 16 }} style={{ flexGrow: 0 }}>{photo}</ScrollView>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} style={{ flex: 1 }}>
              {form}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  thumb: { width: 64, height: 48, borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: "#000" },
});
