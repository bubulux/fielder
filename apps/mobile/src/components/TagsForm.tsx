import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { INT_EXT, label, LIGHT, WEATHER, type Extra, type FieldDef } from "@fielder/vocab";
import type { LocationEntry, ShotTags } from "../types";
import { ExtraEditor } from "./ExtraEditor";
import { Button, Chip, ChipRow, colors, Hint, Input, Row } from "./ui";

interface Props {
  /** Pre-filled values (editing, or the previous capture's tags). */
  initial?: Partial<ShotTags>;
  locations: LocationEntry[];
  /** Shots already at a location (for the "shot #n" hint). */
  countAt: (locationId: string) => number;
  /** The project's extra fields (cached definitions). */
  fields?: readonly FieldDef[];
  submitLabel: string;
  onSubmit: (tags: ShotTags, newLocation: LocationEntry | null) => void;
  cancelLabel?: string;
  onCancel?: () => void;
  busy?: boolean;
}

/** The scouting-tags form: name, location (pick or add), INT/EXT, light phases + artificial, weather. Everything is optional. */
export function TagsForm({ initial, locations, countAt, fields = [], submitLabel, onSubmit, cancelLabel, onCancel, busy }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [light, setLight] = useState<string[]>(initial?.light ?? []);
  const [artificial, setArtificial] = useState(initial?.artificial ?? false);
  const [weather, setWeather] = useState<string | null>(initial?.weather ?? null);
  const [intExt, setIntExt] = useState<string | null>(initial?.int_ext ?? null);
  const initialLoc = locations.find((l) => l.id === initial?.location_id) ?? null;
  const [query, setQuery] = useState(initialLoc?.name ?? "");
  const [picked, setPicked] = useState<LocationEntry | null>(initialLoc);
  /** Name of a location to create on submit. */
  const [newLoc, setNewLoc] = useState<string | null>(null);
  const [extra, setExtra] = useState<Extra>(initial?.extra ?? {});

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? locations.filter((l) => l.name.toLowerCase().includes(q)) : locations).slice(0, 8);
  }, [query, locations]);
  const exact = locations.some((l) => l.name.trim().toLowerCase() === query.trim().toLowerCase());

  const pickLocation = (l: LocationEntry) => { setPicked(l); setNewLoc(null); setQuery(l.name); };
  const addLocation = () => { setPicked(null); setNewLoc(query.trim()); };
  const clearLocation = () => { setPicked(null); setNewLoc(null); setQuery(""); };

  const toggleLight = (v: string) => setLight((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const isEdit = !!initial?.location_id;
  const count = picked ? countAt(picked.id) : 0;

  const submit = () => {
    if (busy) return;
    let created: LocationEntry | null = null;
    let id = picked?.id ?? null;
    if (!id && newLoc) {
      created = { id: Crypto.randomUUID(), name: newLoc, createdAt: new Date().toISOString(), synced: false };
      id = created.id;
    }
    onSubmit({ name: name.trim() || null, light, artificial, weather, int_ext: intExt, location_id: id, extra }, created);
  };

  return (
    <>
      <Row label="Name (optional, like everything below)">
        <Input value={name} onChangeText={setName} placeholder="e.g. Bridge from the east bank" autoCapitalize="sentences" />
      </Row>
      <Row label="Location">
        {picked || newLoc ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Chip label={picked ? picked.name : `${newLoc} · new`} selected onPress={clearLocation} />
            <Pressable onPress={clearLocation} hitSlop={8}><Text style={{ color: colors.dim }}>change</Text></Pressable>
          </View>
        ) : (
          <>
            <Input value={query} onChangeText={setQuery} placeholder="Search existing or type a new location" autoCapitalize="words" />
            <View style={s.list}>
              {matches.map((l) => (
                <Pressable key={l.id} onPress={() => pickLocation(l)} style={s.item}>
                  <Text style={s.itemName}>{l.name}</Text>
                  <Text style={s.itemSub}>{countAt(l.id)} shot{countAt(l.id) === 1 ? "" : "s"}</Text>
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
        {picked && !isEdit && <Hint>{count === 0 ? "First shot at this location." : `Shot #${count + 1} at this location.`}</Hint>}
        {newLoc && <Hint>First shot at this location.</Hint>}
      </Row>
      <Row label="Int / Ext">
        <ChipRow>{INT_EXT.map((v) => <Chip key={v} label={label(v)} selected={intExt === v} onPress={() => setIntExt(intExt === v ? null : v)} />)}</ChipRow>
      </Row>
      <Row label="Light (every phase the shot works in)">
        <ChipRow>
          {LIGHT.map((v) => <Chip key={v} label={label(v)} selected={light.includes(v)} onPress={() => toggleLight(v)} />)}
          <Chip label="Artificial" selected={artificial} onPress={() => setArtificial(!artificial)} />
        </ChipRow>
      </Row>
      <Row label="Weather">
        <ChipRow>{WEATHER.map((v) => <Chip key={v} label={label(v)} selected={weather === v} onPress={() => setWeather(weather === v ? null : v)} />)}</ChipRow>
      </Row>
      {fields.length > 0 && <ExtraEditor defs={fields} value={extra} onChange={setExtra} />}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        {onCancel && <View style={{ flex: 1 }}><Button label={cancelLabel ?? "Cancel"} kind={cancelLabel === "Discard" ? "danger" : "ghost"} onPress={onCancel} /></View>}
        <View style={{ flex: 2 }}><Button label={submitLabel} onPress={submit} disabled={busy} /></View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  list: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  item: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel },
  itemName: { color: colors.text, fontSize: 15 },
  itemSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
});
