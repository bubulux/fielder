import { useState } from "preact/hooks";
import { BERLIN_DISTRICTS, EXTRA_COLLECTIONS, INT_EXT, label, LIGHT, WEATHER } from "@fielder/vocab";
import { ApiError, putLocation, type Location, type ShotTags } from "./api";

interface Props {
  initial?: Partial<ShotTags>;
  locations: Location[];
  onLocations: (l: Location[]) => void;
  submitLabel: string;
  onSubmit: (tags: ShotTags) => Promise<void>;
  onCancel: () => void;
}

const NEW = "__new__";

/** Scouting tags: name, location (existing or new + district), INT/EXT, light, weather. All required. */
export function TagsForm({ initial, locations, onLocations, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [light, setLight] = useState(initial?.light ?? "");
  const [weather, setWeather] = useState(initial?.weather ?? "");
  const [intExt, setIntExt] = useState(initial?.int_ext ?? "");
  const [locationId, setLocationId] = useState(initial?.location_id ?? "");
  const [newName, setNewName] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>(initial?.extra ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = !!name.trim() && !!light && !!weather && !!intExt && (locationId === NEW ? !!newName.trim() && !!newDistrict : !!locationId);

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      let id = locationId;
      if (id === NEW) {
        const draft = { id: crypto.randomUUID(), name: newName.trim(), district: newDistrict };
        try {
          const created = await putLocation(draft);
          onLocations([...locations, created].sort((a, b) => a.name.localeCompare(b.name)));
          id = created.id;
        } catch (err) {
          const existing = err instanceof ApiError && err.status === 409 ? (err.body as { existing_id?: string } | null)?.existing_id : undefined;
          if (!existing) throw err;
          id = existing;
        }
      }
      await onSubmit({ name: name.trim(), light, weather, int_ext: intExt, location_id: id, extra });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form class="tags-form" onSubmit={submit}>
      <label>Name<input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="e.g. Bridge from the east bank" /></label>
      <label>Location
        <select value={locationId} onChange={(e) => setLocationId((e.target as HTMLSelectElement).value)}>
          <option value="">— choose —</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.district}</option>)}
          <option value={NEW}>＋ New location…</option>
        </select>
      </label>
      {locationId === NEW && (
        <div class="row2">
          <label>New location name<input value={newName} onInput={(e) => setNewName((e.target as HTMLInputElement).value)} /></label>
          <label>District
            <select value={newDistrict} onChange={(e) => setNewDistrict((e.target as HTMLSelectElement).value)}>
              <option value="">— choose —</option>
              {BERLIN_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      )}
      <div class="row3">
        <label>Int/Ext
          <select value={intExt} onChange={(e) => setIntExt((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>{INT_EXT.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </label>
        <label>Light
          <select value={light} onChange={(e) => setLight((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>{LIGHT.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </label>
        <label>Weather
          <select value={weather} onChange={(e) => setWeather((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>{WEATHER.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </label>
      </div>
      {EXTRA_COLLECTIONS.map((c) => {
        const groups = new Map<string, string[]>();
        for (const v of c.values) { const g = v.split(" - ")[0]; groups.set(g, [...(groups.get(g) ?? []), v]); }
        return (
          <label key={c.id}>{c.name} (optional)
            <select value={extra[c.id] ?? ""} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; const { [c.id]: _, ...rest } = extra; setExtra(v ? { ...rest, [c.id]: v } : rest); }}>
              <option value="">—</option>
              {[...groups.entries()].map(([g, vs]) => <optgroup key={g} label={g}>{vs.map((v) => <option key={v} value={v}>{v}</option>)}</optgroup>)}
            </select>
          </label>
        );
      })}
      {error && <div class="error">{error}</div>}
      <div class="actions">
        <button type="button" class="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" class="btn primary" disabled={!valid || busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
