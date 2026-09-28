import { useState } from "preact/hooks";
import { deleteProject, existingIdOf, putProject, putProjectFields, type FieldDefinition, type Project } from "./api";
import { Chip, ErrorLine, Icon, Loading } from "./ui";

/** The project the dashboard works on, or every project at once (the global explorer). */
export type ActiveProject = string | "all";
export const ALL_PROJECTS = "all";

interface Props {
  projects: Project[] | null;
  onChange: (p: Project[]) => void;
  /** All extra-field definitions, to pick the ones a project uses. */
  fields: FieldDefinition[];
  active: ActiveProject | null;
  onActivate: (id: ActiveProject) => void;
  /** First run: no project chosen yet, so this page is all the dashboard shows. */
  gate?: boolean;
}

const sortByName = (list: Project[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Projects table: pick the one to work on, create, rename, delete (empty projects only). */
export function Projects({ projects, onChange, fields, active, onActivate, gate }: Props) {
  const [edit, setEdit] = useState<{ id: string; name: string; notes: string; fieldIds: string[]; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!edit || !edit.name.trim()) return;
    try {
      const saved = await putProject({ id: edit.id, name: edit.name.trim(), notes: edit.notes.trim() || null });
      saved.field_ids = await putProjectFields(saved.id, edit.fieldIds);
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
  const startNew = () => setEdit({ id: crypto.randomUUID(), name: "", notes: "", fieldIds: [], isNew: true });

  if (!projects) return <Loading />;
  const form = edit && (
    <form class="rig-form" onSubmit={(e) => void save(e)}>
      <h3>{edit.isNew ? "New project" : "Edit project"}</h3>
      <label>Name<input value={edit.name} autoFocus onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} placeholder="e.g. Short film 'Nachtbus'" /></label>
      <label>Notes (optional)<textarea rows={3} value={edit.notes} onInput={(e) => setEdit({ ...edit, notes: (e.target as HTMLTextAreaElement).value })} /></label>
      <div class="field">
        <span class="field-label">Extra fields for this project (in the order ticked){fields.length === 0 ? " · none defined yet, see the Fields tab" : ""}</span>
        <div class="f-chips">
          {fields.map((f) => {
            const on = edit.fieldIds.includes(f.id);
            return <Chip key={f.id} selected={on} onClick={() => setEdit({ ...edit, fieldIds: on ? edit.fieldIds.filter((x) => x !== f.id) : [...edit.fieldIds, f.id] })}>{f.definition.label}</Chip>;
          })}
        </div>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div class="form-actions">
        <button type="submit" class="f-btn" disabled={!edit.name.trim()}>{edit.isNew ? "Create and open" : "Save"}</button>
        <button type="button" class="f-btn f-btn--ghost" onClick={() => { setEdit(null); setError(null); }}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div class="page">
      {gate && (
        <div class="gate-intro">
          <h2>Which project are you working on?</h2>
          <p class="meta">Everything you see and every shot you edit belongs to the active project. You can switch any time from the header; the choice is remembered.</p>
        </div>
      )}
      <table class="table">
        <thead><tr><th>Name</th><th>Notes</th><th>Shots</th><th></th></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} class={active === p.id ? "selected" : ""}>
              <td class="name">{p.name}</td>
              <td class="meta">{p.notes ?? ""}</td>
              <td class="num">{p.shot_count}</td>
              <td class="actions">
                {active === p.id ? <span class="f-state f-state--approved"><Icon name="check" />Active</span> : <button class="f-btn f-btn--sm" onClick={() => onActivate(p.id)}>Open</button>}
                {!gate && <button class="f-btn f-btn--secondary f-btn--sm" onClick={() => setEdit({ id: p.id, name: p.name, notes: p.notes ?? "", fieldIds: p.field_ids, isNew: false })}>Edit</button>}
                {!gate && <button class="f-btn f-btn--danger f-btn--sm" disabled={p.shot_count > 0} title={p.shot_count > 0 ? "Only empty projects can be deleted" : undefined} onClick={() => void remove(p)}>Delete</button>}
              </td>
            </tr>
          ))}
          {projects.length === 0 && <tr><td colSpan={4} class="meta">No projects yet. Create the first one.</td></tr>}
        </tbody>
      </table>
      {!edit && (
        <div class="form-actions" style="margin-top:12px">
          <button class="f-btn" onClick={startNew}><Icon name="plus" />New project</button>
          {gate && projects.length > 0 && <button class="f-btn f-btn--secondary" onClick={() => onActivate(ALL_PROJECTS)}>Browse all projects</button>}
        </div>
      )}
      {form}
    </div>
  );
}
