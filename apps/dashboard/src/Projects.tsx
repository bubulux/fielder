import { useState } from "preact/hooks";
import { deleteProject, existingIdOf, putProject, type Project } from "./api";

/** The project the dashboard works on, or every project at once (the global explorer). */
export type ActiveProject = string | "all";
export const ALL_PROJECTS = "all";

interface Props {
  projects: Project[] | null;
  onChange: (p: Project[]) => void;
  active: ActiveProject | null;
  onActivate: (id: ActiveProject) => void;
  /** First run: no project chosen yet, so this page is all the dashboard shows. */
  gate?: boolean;
}

const sortByName = (list: Project[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Projects table: pick the one to work on, create, rename, delete (empty projects only). */
export function Projects({ projects, onChange, active, onActivate, gate }: Props) {
  const [edit, setEdit] = useState<{ id: string; name: string; notes: string; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!edit || !edit.name.trim()) return;
    try {
      const saved = await putProject({ id: edit.id, name: edit.name.trim(), notes: edit.notes.trim() || null });
      onChange(sortByName([...(projects ?? []).filter((p) => p.id !== saved.id), saved]));
      if (edit.isNew) onActivate(saved.id);
      setEdit(null); setError(null);
    } catch (err) {
      const existing = existingIdOf(err);
      setError(existing ? "Another project already has this name." : (err as Error).message);
    }
  }
  async function remove(p: Project) {
    if (!confirm(`Delete project "${p.name}"?`)) return;
    try {
      await deleteProject(p.id);
      onChange((projects ?? []).filter((x) => x.id !== p.id));
      if (active === p.id) onActivate(ALL_PROJECTS);
    } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }
  const startNew = () => setEdit({ id: crypto.randomUUID(), name: "", notes: "", isNew: true });

  if (!projects) return <div class="status">Loading…</div>;
  const form = edit && (
    <form class="rig-form" onSubmit={(e) => void save(e)}>
      <h3>{edit.isNew ? "New project" : "Edit project"}</h3>
      <label>Name<input value={edit.name} autoFocus onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} placeholder="e.g. Short film 'Nachtbus'" /></label>
      <label>Notes (optional)<textarea rows={3} value={edit.notes} onInput={(e) => setEdit({ ...edit, notes: (e.target as HTMLTextAreaElement).value })} /></label>
      {error && <div class="error">{error}</div>}
      <div class="actions" style="justify-content:flex-start">
        <button type="submit" class="btn primary" disabled={!edit.name.trim()}>{edit.isNew ? "Create and open" : "Save"}</button>
        <button type="button" class="btn" onClick={() => { setEdit(null); setError(null); }}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div class="rigs">
      {gate && (
        <div class="gate-intro">
          <h2>Which project are you working on?</h2>
          <p class="meta">Everything you see and every shot you edit belongs to the active project. You can switch any time from the header; the choice is remembered.</p>
        </div>
      )}
      <table>
        <thead><tr><th>Name</th><th>Notes</th><th>Shots</th><th></th></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} class={active === p.id ? "selected" : ""}>
              <td>{p.name}</td>
              <td class="meta">{p.notes ?? ""}</td>
              <td>{p.shot_count}</td>
              <td class="actions">
                {active === p.id ? <span class="meta">active</span> : <button class="btn primary" onClick={() => onActivate(p.id)}>Open</button>}
                {!gate && <button class="btn" onClick={() => setEdit({ id: p.id, name: p.name, notes: p.notes ?? "", isNew: false })}>Edit</button>}
                {!gate && <button class="btn danger" disabled={p.shot_count > 0} title={p.shot_count > 0 ? "Only empty projects can be deleted" : undefined} onClick={() => void remove(p)}>Delete</button>}
              </td>
            </tr>
          ))}
          {projects.length === 0 && <tr><td colSpan={4} class="meta">No projects yet. Create the first one.</td></tr>}
        </tbody>
      </table>
      {!edit && (
        <div class="actions" style="justify-content:flex-start;margin-top:12px">
          <button class="btn primary" onClick={startNew}>＋ New project</button>
          {gate && projects.length > 0 && <button class="btn" onClick={() => onActivate(ALL_PROJECTS)}>Browse all projects</button>}
        </div>
      )}
      {form}
    </div>
  );
}
