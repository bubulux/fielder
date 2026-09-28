import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { FramedImage, FrameModeSeg, type FrameMode } from "../components/FramedImage";
import { TagsForm } from "../components/TagsForm";
import { Header } from "../components/ui";
import { FIXED, makeStyles, RADIUS } from "../theme";
import type { FieldDef } from "@fielder/vocab";
import type { CaptureDraft, LocationEntry, Settings, ShotTags } from "../types";

interface Props {
  draft: CaptureDraft | null;
  settings: Settings;
  locations: LocationEntry[];
  /** Shots already taken at a location (uploaded + pending). */
  countAt: (locationId: string) => number;
  /** Extra fields of the active project. */
  fields: readonly FieldDef[];
  onUpload: (tags: ShotTags, newLocation: LocationEntry | null) => void;
  onDiscard: () => void;
}

/** Consecutive shots usually share place and conditions: remember them, but never the name. */
let lastTags: Partial<ShotTags> = {};

/** Capture (or finished sequence) -> this form -> Upload or Discard. Every field is optional. */
export function ShotReview({ draft, settings, locations, countAt, fields, onUpload, onDiscard }: Props) {
  const s = useStyles();
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
            <Pressable key={p.meta.id} onPress={() => setIndex(i)} style={[s.thumb, i === index && s.thumbOn]} accessibilityLabel={`Photo ${i + 1}`} accessibilityState={{ selected: i === index }}>
              <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ marginTop: 8 }}><FrameModeSeg value={mode} onChange={setMode} /></View>
    </View>
  );
  const form = (
    <TagsForm
      key={draft.shotId}
      initial={{ ...lastTags, name: null }}
      locations={locations}
      countAt={countAt}
      fields={fields}
      submitLabel={draft.photos.length > 1 ? `Upload ${draft.photos.length} photos` : "Upload"}
      cancelLabel="Discard"
      onCancel={onDiscard}
      onSubmit={(tags, newLoc) => { lastTags = { light: tags.light, artificial: tags.artificial, weather: tags.weather, int_ext: tags.int_ext, location_id: tags.location_id }; onUpload(tags, newLoc); }}
    />
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onDiscard}>
      <View style={s.root}>
        <Header title={draft.photos.length > 1 ? `New sequence · ${draft.photos.length} photos` : "New shot"} sub="Every field is optional" />
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

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  thumb: { width: 68, height: 51, borderRadius: RADIUS.sm, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: FIXED.photoBg },
  thumbOn: { borderWidth: 3, borderColor: c.accent },
}));
