import { useState } from "preact/hooks";
import { ApiError, deleteLocation, putLocation, type Location } from "./api";
import { ErrorLine, Loading } from "./ui";

interface Props { locations: Location[] | null; onChange: (l: Location[]) => void; onShotsChanged: () => void }

/** Locations table: rename, delete (shots keep their photos and lose the link). Shared by all projects. */
export function Locations({ locations, onChange, onShotsChanged }: Props) {
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!edit || !edit.name.trim()) return;
    try {
      const saved = await putLocation({ id: edit.id, name: edit.name.trim() });
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

  if (!locations) return <Loading />;
  return (
    <div class="page">
      <table class="table">
        <thead><tr><th>Name</th><th>Shots</th><th>Approved</th><th></th></tr></thead>
        <tbody>
          {locations.map((l) => edit?.id === l.id ? (
            <tr key={l.id}>
              <td><input value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></td>
              <td>{l.shot_count}</td><td>{l.approved_count}</td>
              <td class="actions"><button class="f-btn f-btn--sm" onClick={(e) => void save(e)}>Save</button><button class="f-btn f-btn--ghost f-btn--sm" onClick={() => { setEdit(null); setError(null); }}>Cancel</button></td>
            </tr>
          ) : (
            <tr key={l.id}>
              <td class="name">{l.name}</td><td class="num">{l.shot_count}</td><td class="num">{l.approved_count}</td>
              <td class="actions"><button class="f-btn f-btn--secondary f-btn--sm" onClick={() => setEdit({ id: l.id, name: l.name })}>Edit</button><button class="f-btn f-btn--danger f-btn--sm" onClick={() => void remove(l)}>Delete</button></td>
            </tr>
          ))}
          {locations.length === 0 && <tr><td colSpan={4} class="meta">No locations yet. They are created when a shot is tagged.</td></tr>}
        </tbody>
      </table>
      {error && <ErrorLine>{error}</ErrorLine>}
      <p class="meta">Locations are shared by all projects. They are created from the phone's capture form or when editing a shot's tags here.</p>
    </div>
  );
}
