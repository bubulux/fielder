import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { BERLIN_DISTRICTS, EXTRA_COLLECTIONS, INT_EXT, label, LIGHT, WEATHER } from "@fielder/vocab";
import type { LocationEntry, ShotTags } from "../types";
import { Button, Chip, ChipRow, colors, Hint, Input, Row } from "./ui";

interface Props {
  /** Pre-filled values (editing, or the previous capture's tags). */
  initial?: Partial<ShotTags>;
  locations: LocationEntry[];
  /** Shots already at a location (for the "shot #n" hint). */
  countAt: (locationId: string) => number;
  submitLabel: string;
  onSubmit: (tags: ShotTags, newLocation: LocationEntry | null) => void;
  cancelLabel?: string;
  onCancel?: () => void;
  busy?: boolean;
}

/** The scouting-tags form: name, location (pick or add), INT/EXT, light, weather. Every field is required. */
export function TagsForm({ initial, locations, countAt, submitLabel, onSubmit, cancelLabel, onCancel, busy }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [light, setLight] = useState<string | null>(initial?.light ?? null);
  const [weather, setWeather] = useState<string | null>(initial?.weather ?? null);
  const [intExt, setIntExt] = useState<string | null>(initial?.int_ext ?? null);
  const initialLoc = locations.find((l) => l.id === initial?.location_id) ?? null;
  const [query, setQuery] = useState(initialLoc?.name ?? "");
  const [picked, setPicked] = useState<LocationEntry | null>(initialLoc);
  const [newLoc, setNewLoc] = useState<{ name: string; district: string | null } | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>(initial?.extra ?? {});
  /** Collection whose value picker is open. */
  const [extraOpen, setExtraOpen] = useState<string | null>(null);
  const [extraQuery, setExtraQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? locations.filter((l) => l.name.toLowerCase().includes(q)) : locations).slice(0, 8);
  }, [query, locations]);
  const exact = locations.some((l) => l.name.trim().toLowerCase() === query.trim().toLowerCase());

  const pickLocation = (l: LocationEntry) => { setPicked(l); setNewLoc(null); setQuery(l.name); };
  const addLocation = () => { setPicked(null); setNewLoc({ name: query.trim(), district: null }); };
  const clearLocation = () => { setPicked(null); setNewLoc(null); setQuery(""); };

  const valid = !!name.trim() && !!light && !!weather && !!intExt && (!!picked || (!!newLoc && !!newLoc.district));
  const isEdit = !!initial?.location_id;
  const count = picked ? countAt(picked.id) : 0;

  const submit = () => {
    if (!valid || busy) return;
    let created: LocationEntry | null = null;
    let id = picked?.id ?? null;
    if (!id && newLoc && newLoc.district) {
      created = { id: Crypto.randomUUID(), name: newLoc.name, district: newLoc.district, createdAt: new Date().toISOString(), synced: false };
      id = created.id;
    }
    onSubmit({ name: name.trim(), light: light!, weather: weather!, int_ext: intExt!, location_id: id!, extra }, created);
  };

  return (
    <>
      <Row label="Name">
        <Input value={name} onChangeText={setName} placeholder="e.g. Bridge from the east bank" autoCapitalize="sentences" />
      </Row>
      <Row label="Location">
        {picked || newLoc ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
        {picked && !isEdit && <Hint>{count === 0 ? "First shot at this location." : `Shot #${count + 1} at this location.`}</Hint>}
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
      <Row label="Extra (optional)">
        <ChipRow>
          {EXTRA_COLLECTIONS.map((c) => (
            <Chip key={c.id} label={extra[c.id] ? `${c.name}: ${extra[c.id]}` : c.name} selected={!!extra[c.id] || extraOpen === c.id}
              onPress={() => { if (extra[c.id]) { const { [c.id]: _, ...rest } = extra; setExtra(rest); setExtraOpen(null); } else { setExtraOpen(extraOpen === c.id ? null : c.id); setExtraQuery(""); } }} />
          ))}
        </ChipRow>
        {extraOpen && (() => {
          const c = EXTRA_COLLECTIONS.find((x) => x.id === extraOpen)!;
          const q = extraQuery.trim().toLowerCase();
          const hits = (q ? c.values.filter((v) => v.toLowerCase().includes(q)) : c.values).slice(0, 12);
          return (
            <View style={{ marginTop: 8 }}>
              <Input value={extraQuery} onChangeText={setExtraQuery} placeholder={`Search ${c.name}…`} autoFocus />
              <View style={s.list}>
                {hits.map((v) => (
                  <Pressable key={v} onPress={() => { setExtra({ ...extra, [c.id]: v }); setExtraOpen(null); }} style={s.item}>
                    <Text style={s.itemName}>{v}</Text>
                  </Pressable>
                ))}
                {hits.length === 0 && <Hint>No match.</Hint>}
                {hits.length === 12 && <Hint>Type more to narrow the list.</Hint>}
              </View>
            </View>
          );
        })()}
        <Hint>Tap a collection to pick a value; tap it again to remove it.</Hint>
      </Row>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        {onCancel && <View style={{ flex: 1 }}><Button label={cancelLabel ?? "Cancel"} kind={cancelLabel === "Discard" ? "danger" : "ghost"} onPress={onCancel} /></View>}
        <View style={{ flex: 2 }}><Button label={submitLabel} onPress={submit} disabled={!valid || busy} /></View>
      </View>
      {!valid && <Hint>All fields are required.</Hint>}
    </>
  );
}

const s = StyleSheet.create({
  list: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  item: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel },
  itemName: { color: colors.text, fontSize: 15 },
  itemSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
});
