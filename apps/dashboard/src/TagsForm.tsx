import { useState } from "preact/hooks";
import { INT_EXT, label, LIGHT, WEATHER, type Extra, type FieldDef } from "@fielder/vocab";
import { existingIdOf, putLocation, type Location, type ShotTags } from "./api";
import { Combobox } from "./Combobox";
import { ExtraEditor } from "./ExtraEditor";

interface Props {
  initial?: Partial<ShotTags>;
  locations: Location[];
  onLocations: (l: Location[]) => void;
  /** The project's extra fields. */
  fields: readonly FieldDef[];
  submitLabel: string;
  onSubmit: (tags: ShotTags) => Promise<void>;
  onCancel: () => void;
}

const NEW = "__new__";
const vocab = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }));

/** Scouting tags: name, location (existing or new), INT/EXT, light phases + artificial, weather. All optional. */
export function TagsForm({ initial, locations, onLocations, fields, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [light, setLight] = useState<string[]>(initial?.light ?? []);
  const [artificial, setArtificial] = useState(initial?.artificial ?? false);
  const [weather, setWeather] = useState<string | null>(initial?.weather || null);
  const [intExt, setIntExt] = useState<string | null>(initial?.int_ext || null);
  const [locationId, setLocationId] = useState<string | null>(initial?.location_id || null);
  /** Typed into the location box and not existing yet; created on submit. */
  const [newName, setNewName] = useState<string | null>(null);
  const [extra, setExtra] = useState<Extra>(initial?.extra ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLight = (v: string) => setLight((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const locationOptions = [
    ...locations.map((l) => ({ value: l.id, label: l.name, hint: l.shot_count ? `${l.shot_count} shot${l.shot_count === 1 ? "" : "s"}` : undefined })),
    ...(newName ? [{ value: NEW, label: newName, hint: "new" }] : []),
  ];

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      let id = locationId;
      if (id === NEW && newName) {
        try {
          const created = await putLocation({ id: crypto.randomUUID(), name: newName });
          onLocations([...locations, created].sort((a, b) => a.name.localeCompare(b.name)));
          id = created.id;
        } catch (err) {
          const existing = existingIdOf(err);
          if (!existing) throw err;
          id = existing;
        }
      }
      await onSubmit({ name: name.trim() || null, light, artificial, weather, int_ext: intExt, location_id: id, extra });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form class="tags-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <label>Name (optional, like everything below)<input autoFocus value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="e.g. Bridge from the east bank" /></label>
      <label>Location
        <Combobox options={locationOptions} value={locationId} placeholder="Type to search or create…"
          onChange={(v) => { setLocationId(v); if (v !== NEW) setNewName(null); }}
          onCreate={(text) => { setNewName(text); setLocationId(NEW); }} />
      </label>
      <div class="row2">
        <label>Int/Ext<Combobox options={vocab(INT_EXT)} value={intExt} onChange={setIntExt} placeholder="—" /></label>
        <label>Weather<Combobox options={vocab(WEATHER)} value={weather} onChange={setWeather} placeholder="—" /></label>
      </div>
      <div class="field">
        <span class="field-label">Light (every phase the shot works in)</span>
        <div class="chips">
          {LIGHT.map((v) => <button type="button" key={v} class={`chip ${light.includes(v) ? "active" : ""}`} onClick={() => toggleLight(v)}>{label(v)}</button>)}
          <button type="button" class={`chip ${artificial ? "active" : ""}`} onClick={() => setArtificial(!artificial)}>Artificial</button>
        </div>
      </div>
      {fields.length > 0 && <ExtraEditor defs={fields} value={extra} onChange={setExtra} />}
      {error && <div class="error">{error}</div>}
      <div class="actions">
        <button type="button" class="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" class="btn primary" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
