import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { FramedImage, FRAME_MODES, frameModeLabel, type FrameFractions, type FrameMode } from "../components/FramedImage";
import { TagsForm } from "../components/TagsForm";
import { Chip, ChipRow, colors } from "../components/ui";
import type { LocationEntry, Settings, ShotTags } from "../types";

export interface Draft {
  uri: string;
  width: number;
  height: number;
  frame: FrameFractions;
}

interface Props {
  draft: Draft | null;
  settings: Settings;
  locations: LocationEntry[];
  /** Shots already taken at a location (uploaded + pending). */
  countAt: (locationId: string) => number;
  onUpload: (tags: ShotTags, newLocation: LocationEntry | null) => void;
  onDiscard: () => void;
}

/** Consecutive shots usually share place and conditions: remember them, but never the name. */
let lastTags: Partial<ShotTags> = {};

/** Capture -> this form -> Upload or Discard. Every field is required. */
export function ShotReview({ draft, settings, locations, countAt, onUpload, onDiscard }: Props) {
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("mask");
  if (!draft) return null;

  const photoWidth = portrait ? width - 32 : Math.min(width * 0.45, height * 1.3);
  const photo = (
    <View style={{ alignItems: "center" }}>
      <FramedImage source={{ uri: draft.uri }} aspect={draft.width / draft.height} frame={draft.frame} width={photoWidth} settings={settings} mode={mode} style={{ borderRadius: 8 }} />
      <View style={{ marginTop: 8 }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
      </View>
    </View>
  );
  const form = (
    <TagsForm
      key={draft.uri}
      initial={{ ...lastTags, name: "" }}
      locations={locations}
      countAt={countAt}
      submitLabel="Upload"
      cancelLabel="Discard"
      onCancel={onDiscard}
      onSubmit={(tags, newLoc) => { lastTags = { light: tags.light, weather: tags.weather, int_ext: tags.int_ext, location_id: tags.location_id }; onUpload(tags, newLoc); }}
    />
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onDiscard}>
      <View style={s.root}>
        <View style={s.header}><Text style={s.title}>New shot</Text></View>
        {portrait ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {photo}
            {form}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View style={{ padding: 16 }}>{photo}</View>
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
});
