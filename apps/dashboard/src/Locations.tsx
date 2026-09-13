import { useState } from "preact/hooks";
import { BERLIN_DISTRICTS } from "@fielder/vocab";
import { ApiError, deleteLocation, putLocation, type Location } from "./api";

interface Props { locations: Location[] | null; onChange: (l: Location[]) => void; onShotsChanged: () => void }

/** Locations table: rename, change district, delete (shots keep their photo and lose the link). */
export function Locations({ locations, onChange, onShotsChanged }: Props) {
  const [edit, setEdit] = useState<{ id: string; name: string; district: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!edit || !edit.name.trim() || !edit.district) return;
    try {
      const saved = await putLocation({ id: edit.id, name: edit.name.trim(), district: edit.district });
      const rest = (locations ?? []).filter((l) => l.id !== saved.id);
      onChange([...rest, saved].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      setEdit(null); setError(null);
      onShotsChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "Another location already has this name." : (err as Error).message);
    }
  }
  async function remove(l: Location) {
    if (!confirm(`Delete location "${l.name}"?${l.shot_count ? ` ${l.shot_count} shot(s) lose their location (photos are kept).` : ""}`)) return;
    try { await deleteLocation(l.id); onChange((locations ?? []).filter((x) => x.id !== l.id)); onShotsChanged(); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  if (!locations) return <div class="status">Loading…</div>;
  return (
    <div class="rigs">
      <table>
        <thead><tr><th>Name</th><th>District</th><th>Shots</th><th>Approved</th><th></th></tr></thead>
        <tbody>
          {locations.map((l) => edit?.id === l.id ? (
            <tr key={l.id}>
              <td><input value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></td>
              <td>
                <select value={edit.district} onChange={(e) => setEdit({ ...edit, district: (e.target as HTMLSelectElement).value })}>
                  {BERLIN_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </td>
              <td>{l.shot_count}</td><td>{l.approved_count}</td>
              <td class="actions"><button class="btn primary" onClick={(e) => void save(e)}>Save</button><button class="btn" onClick={() => { setEdit(null); setError(null); }}>Cancel</button></td>
            </tr>
          ) : (
            <tr key={l.id}>
              <td>{l.name}</td><td>{l.district}</td><td>{l.shot_count}</td><td>{l.approved_count}</td>
              <td class="actions"><button class="btn" onClick={() => setEdit({ id: l.id, name: l.name, district: l.district })}>Edit</button><button class="btn danger" onClick={() => void remove(l)}>Delete</button></td>
            </tr>
          ))}
          {locations.length === 0 && <tr><td colSpan={5} class="meta">No locations yet. They are created when a shot is tagged.</td></tr>}
        </tbody>
      </table>
      {error && <div class="error">{error}</div>}
      <p class="meta">Locations are created from the phone's capture form or when editing a shot's tags here.</p>
    </div>
  );
}
