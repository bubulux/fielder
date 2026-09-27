import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { selectOptions, type Extra, type ExtraValue, type FieldDef } from "@fielder/vocab";
import { Chip, ChipRow, colors, Hint, Input, Row } from "./ui";

/** Selects with more options than this get a search box instead of chips. */
const CHIP_LIMIT = 12;

interface Props { defs: readonly FieldDef[]; value: Extra; onChange: (v: Extra) => void; nested?: boolean }

/** Form for a project's extra fields; groups nest, dependent selects follow their sibling. */
export function ExtraEditor({ defs, value, onChange, nested }: Props) {
  return (
    <View style={nested ? s.nested : undefined}>
      {defs.map((f) => (
        <Field key={f.key} def={f} value={value[f.key]} siblings={value}
          onChange={(v) => {
            const next: Extra = { ...value, [f.key]: v };
            // A changed parent invalidates dependent selects that no longer offer their value.
            for (const d of defs) if (d.optionsBy?.field === f.key && !selectOptions(d, next).includes(String(next[d.key] ?? ""))) delete next[d.key];
            onChange(next);
          }} />
      ))}
    </View>
  );
}

function Field({ def, value, siblings, onChange }: { def: FieldDef; value: ExtraValue | undefined; siblings: Extra; onChange: (v: ExtraValue) => void }) {
  const label = def.label;
  switch (def.type) {
    case "group":
      return (
        <Row label={label}>
          <ExtraEditor nested defs={def.fields ?? []} value={value && typeof value === "object" && !Array.isArray(value) ? value : {}} onChange={onChange} />
          {def.help && <Hint>{def.help}</Hint>}
        </Row>
      );
    case "text":
      return <Row label={label}><Input value={typeof value === "string" ? value : ""} onChangeText={onChange} />{def.help && <Hint>{def.help}</Hint>}</Row>;
    case "number":
      return (
        <Row label={label}>
          <Input value={typeof value === "number" ? String(value) : ""} keyboardType="decimal-pad"
            onChangeText={(t) => { const n = Number(t.replace(",", ".")); onChange(t.trim() === "" ? null : Number.isFinite(n) ? n : null); }} />
          {def.help && <Hint>{def.help}</Hint>}
        </Row>
      );
    case "boolean":
      return (
        <Row label={label}>
          <ChipRow>{([true, false] as const).map((b) => <Chip key={String(b)} label={b ? "Yes" : "No"} selected={value === b} onPress={() => onChange(value === b ? null : b)} />)}</ChipRow>
          {def.help && <Hint>{def.help}</Hint>}
        </Row>
      );
    case "select":
      return <Row label={label}><Select def={def} value={value} siblings={siblings} onChange={onChange} />{def.help && <Hint>{def.help}</Hint>}</Row>;
  }
}

function Select({ def, value, siblings, onChange }: { def: FieldDef; value: ExtraValue | undefined; siblings: Extra; onChange: (v: ExtraValue) => void }) {
  const [query, setQuery] = useState("");
  const opts = selectOptions(def, siblings);
  if (def.optionsBy && opts.length === 0) return <Hint>Choose {def.optionsBy.field} first.</Hint>;
  const selected = def.multiple ? (Array.isArray(value) ? value.map(String) : []) : typeof value === "string" ? [value] : [];
  const toggle = (o: string) => {
    if (def.multiple) onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
    else onChange(selected.includes(o) ? null : o);
  };
  if (opts.length <= CHIP_LIMIT) return <ChipRow>{opts.map((o) => <Chip key={o} label={o} selected={selected.includes(o)} onPress={() => toggle(o)} />)}</ChipRow>;

  const q = query.trim().toLowerCase();
  const hits = (q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts).slice(0, CHIP_LIMIT);
  return (
    <>
      {selected.length > 0 && <ChipRow>{selected.map((o) => <Chip key={o} label={`${o} ✕`} selected onPress={() => toggle(o)} />)}</ChipRow>}
      <View style={{ marginTop: selected.length ? 8 : 0 }}>
        <Input value={query} onChangeText={setQuery} placeholder={`Search ${def.label}…`} />
        <View style={s.list}>
          {hits.map((o) => (
            <Pressable key={o} onPress={() => { toggle(o); setQuery(""); }} style={s.item}>
              <Text style={[s.itemText, selected.includes(o) && { color: colors.accent }]}>{o}</Text>
            </Pressable>
          ))}
          {hits.length === 0 && <Text style={[s.itemText, { color: colors.dim, padding: 10 }]}>No match.</Text>}
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  nested: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 10 },
  list: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  item: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel },
  itemText: { color: colors.text, fontSize: 15 },
});
