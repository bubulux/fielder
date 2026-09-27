import { useState } from "preact/hooks";
import { INT_EXT, label, LIGHT, WEATHER } from "@fielder/vocab";
import { existingIdOf, putLocation, type Location, type ShotTags } from "./api";

interface Props {
  initial?: Partial<ShotTags>;
  locations: Location[];
  onLocations: (l: Location[]) => void;
  submitLabel: string;
  onSubmit: (tags: ShotTags) => Promise<void>;
  onCancel: () => void;
}

const NEW = "__new__";

/** Scouting tags: name, location (existing or new), INT/EXT, light phases + artificial, weather. All optional. */
export function TagsForm({ initial, locations, onLocations, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [light, setLight] = useState<string[]>(initial?.light ?? []);
  const [artificial, setArtificial] = useState(initial?.artificial ?? false);
  const [weather, setWeather] = useState(initial?.weather ?? "");
  const [intExt, setIntExt] = useState(initial?.int_ext ?? "");
  const [locationId, setLocationId] = useState(initial?.location_id ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything is optional; a new location needs a name.
  const valid = locationId !== NEW || !!newName.trim();
  const toggleLight = (v: string) => setLight((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      let id = locationId;
      if (id === NEW) {
        try {
          const created = await putLocation({ id: crypto.randomUUID(), name: newName.trim() });
          onLocations([...locations, created].sort((a, b) => a.name.localeCompare(b.name)));
          id = created.id;
        } catch (err) {
          const existing = existingIdOf(err);
          if (!existing) throw err;
          id = existing;
        }
      }
      await onSubmit({ name: name.trim() || null, light, artificial, weather: weather || null, int_ext: intExt || null, location_id: id || null, extra: initial?.extra ?? {} });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form class="tags-form" onSubmit={submit}>
      <label>Name (optional, like everything below)<input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="e.g. Bridge from the east bank" /></label>
      <label>Location
        <select value={locationId} onChange={(e) => setLocationId((e.target as HTMLSelectElement).value)}>
          <option value="">— choose —</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value={NEW}>＋ New location…</option>
        </select>
      </label>
      {locationId === NEW && <label>New location name<input value={newName} onInput={(e) => setNewName((e.target as HTMLInputElement).value)} /></label>}
      <div class="row2">
        <label>Int/Ext
          <select value={intExt} onChange={(e) => setIntExt((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>{INT_EXT.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </label>
        <label>Weather
          <select value={weather} onChange={(e) => setWeather((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>{WEATHER.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </label>
      </div>
      <div class="field">
        <span class="field-label">Light (every phase the shot works in)</span>
        <div class="chips">
          {LIGHT.map((v) => <button type="button" key={v} class={`chip ${light.includes(v) ? "active" : ""}`} onClick={() => toggleLight(v)}>{label(v)}</button>)}
          <button type="button" class={`chip ${artificial ? "active" : ""}`} onClick={() => setArtificial(!artificial)}>Artificial</button>
        </div>
      </div>
      {error && <div class="error">{error}</div>}
      <div class="actions">
        <button type="button" class="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" class="btn primary" disabled={!valid || busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
