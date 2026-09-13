import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Crypto from "expo-crypto";
import { BERLIN_DISTRICTS, INT_EXT, label, LIGHT, WEATHER } from "@fielder/vocab";
import { FramedImage, FRAME_MODES, frameModeLabel, type FrameFractions, type FrameMode } from "../components/FramedImage";
import { Button, Chip, ChipRow, colors, Hint, Input, Row } from "../components/ui";
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

/** Capture -> this form -> Upload or Discard. Every field is required. */
export function ShotReview({ draft, settings, locations, countAt, onUpload, onDiscard }: Props) {
  const { width, height } = useWindowDimensions();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("mask");
  const [name, setName] = useState("");
  const [light, setLight] = useState<string | null>(null);
  const [weather, setWeather] = useState<string | null>(null);
  const [intExt, setIntExt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LocationEntry | null>(null);
  const [newLoc, setNewLoc] = useState<{ name: string; district: string | null } | null>(null);

  // Fresh form for every capture; keep the previous location and setting tags since consecutive shots usually share them.
  useEffect(() => { if (draft) { setName(""); } }, [draft?.uri]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? locations.filter((l) => l.name.toLowerCase().includes(q)) : locations;
    return list.slice(0, 8);
  }, [query, locations]);
  const exact = locations.find((l) => l.name.trim().toLowerCase() === query.trim().toLowerCase()) ?? null;

  const pickLocation = (l: LocationEntry) => { setPicked(l); setNewLoc(null); setQuery(l.name); };
  const addLocation = () => { setPicked(null); setNewLoc({ name: query.trim(), district: null }); };
  const clearLocation = () => { setPicked(null); setNewLoc(null); setQuery(""); };

  const locationId = picked?.id ?? null;
  const count = locationId ? countAt(locationId) : 0;
  const valid = !!name.trim() && !!light && !!weather && !!intExt && (!!picked || (!!newLoc && !!newLoc.district));

  const upload = () => {
    if (!valid || !draft) return;
    let created: LocationEntry | null = null;
    let id = locationId;
    if (!id && newLoc && newLoc.district) {
      created = { id: Crypto.randomUUID(), name: newLoc.name, district: newLoc.district, createdAt: new Date().toISOString(), synced: false };
      id = created.id;
      // Next shot at this place can reuse it right away.
      setPicked(created); setNewLoc(null); setQuery(created.name);
    }
    onUpload({ name: name.trim(), light: light!, weather: weather!, int_ext: intExt!, location_id: id! }, created);
  };

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
    <>
      <Row label="Name">
        <Input value={name} onChangeText={setName} placeholder="e.g. Bridge from the east bank" autoCapitalize="sentences" />
      </Row>
      <Row label="Location">
        {picked || newLoc ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Chip label={`${picked?.name ?? newLoc?.name}${picked ? ` · ${picked.district}` : " · new"}`} selected onPress={clearLocation} />
            <Pressable onPress={clearLocation} hitSlop={8}><Text style={{ color: colors.dim }}>change</Text></Pressable>
          </View>
        ) : (
          <>
            <Input value={query} onChangeText={setQuery} placeholder="Search existing or type a new location" autoCapitalize="words" />
            <View style={s.list}>
              {matches.map((l) => (
                <Pressable key={l.id} onPress={() => pickLocation(l)} style={s.item}>
                  <Text style={s.itemName}>{l.name}</Text>
                  <Text style={s.itemSub}>{l.district} · {countAt(l.id)} shot{countAt(l.id) === 1 ? "" : "s"}</Text>
                </Pressable>
              ))}
              {query.trim().length > 0 && !exact && (
                <Pressable onPress={addLocation} style={s.item}>
                  <Text style={[s.itemName, { color: colors.accent }]}>＋ Add “{query.trim()}” as a new location</Text>
                </Pressable>
              )}
              {matches.length === 0 && !query.trim() && <Hint>No locations yet. Type a name to create the first one.</Hint>}
            </View>
          </>
        )}
        {picked && <Hint>{count === 0 ? "First shot at this location." : `Shot #${count + 1} at this location.`}</Hint>}
        {newLoc && <Hint>First shot at this location.</Hint>}
      </Row>
      {newLoc && (
        <Row label="District (new location)">
          <ChipRow>
            {BERLIN_DISTRICTS.map((d) => <Chip key={d} label={d} selected={newLoc.district === d} onPress={() => setNewLoc({ ...newLoc, district: d })} />)}
          </ChipRow>
        </Row>
      )}
      <Row label="Int / Ext">
        <ChipRow>{INT_EXT.map((v) => <Chip key={v} label={label(v)} selected={intExt === v} onPress={() => setIntExt(v)} />)}</ChipRow>
      </Row>
      <Row label="Light">
        <ChipRow>{LIGHT.map((v) => <Chip key={v} label={label(v)} selected={light === v} onPress={() => setLight(v)} />)}</ChipRow>
      </Row>
      <Row label="Weather">
        <ChipRow>{WEATHER.map((v) => <Chip key={v} label={label(v)} selected={weather === v} onPress={() => setWeather(v)} />)}</ChipRow>
      </Row>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button label="Discard" kind="danger" onPress={onDiscard} /></View>
        <View style={{ flex: 2 }}><Button label="Upload" onPress={upload} disabled={!valid} /></View>
      </View>
      {!valid && <Hint>All fields are required before uploading.</Hint>}
    </>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onDiscard}>
      <View style={s.root}>
        <View style={s.header}>
          <Text style={s.title}>New shot</Text>
        </View>
        {portrait ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {photo}
            {form}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View style={{ padding: 16, justifyContent: "flex-start" }}>{photo}</View>
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
  list: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  item: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel },
  itemName: { color: colors.text, fontSize: 15 },
  itemSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
});
