import { useEffect, useState } from "preact/hooks";
import { deleteProject, existingIdOf, putProject, putProjectFields, type FieldDefinition, type Project } from "./api";
import { Combobox } from "./Combobox";
import { confirmDialog, cx, Empty, ErrorLine, Icon, promptDialog, SaveStatus, toast, type SaveState } from "./ui";

const sortByName = (list: Project[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Create a project from a name prompt; resolves the saved project or null. */
export async function createProject(projects: Project[], onChange: (p: Project[]) => void): Promise<Project | null> {
  const name = await promptDialog({ title: "New project", input: { label: "Name", placeholder: "e.g. Short film ‘Nachtbus’" }, confirmLabel: "Create" });
  if (!name) return null;
  try {
    const saved = await putProject({ id: crypto.randomUUID(), name, notes: null });
    onChange(sortByName([...projects, saved]));
    return saved;
  } catch (err) {
    toast(existingIdOf(err) ? `A project called “${name}” already exists.` : (err as Error).message, "danger");
    return null;
  }
}

/** First run: nothing chosen yet, so choosing is all the dashboard shows. */
export function ProjectGate({ projects, onChange, onActivate }: { projects: Project[]; onChange: (p: Project[]) => void; onActivate: (id: string) => void }) {
  return (
    <div class="gate">
      <div class="gate__card">
        <span class="gate__brand"><Icon name="camera-iris" />Fielder</span>
        <h1>Which project are you working on?</h1>
        <p class="meta">Everything you see and every shot you edit belongs to the active project. Switch any time from the sidebar; the choice is remembered.</p>
        <div class="f-menu gate__list">
          {projects.map((p) => <button key={p.id} type="button" class="f-menu__item" onClick={() => onActivate(p.id)}><Icon name="folder-outline" /><span class="ellipsis" style={{ flex: 1 }}>{p.name}</span><span class="f-nav__count">{p.shot_count} shots</span></button>)}
          {projects.length > 0 && <div class="f-menu__sep" />}
          {projects.length > 0 && <button type="button" class="f-menu__item" onClick={() => onActivate("all")}><Icon name="folder-multiple-outline" />Browse all projects</button>}
          {projects.length === 0 && <span class="meta" style={{ padding: "10px" }}>No projects yet. Create the first one.</span>}
        </div>
        <button type="button" class="f-btn" onClick={async () => { const p = await createProject(projects, onChange); if (p) onActivate(p.id); }}><Icon name="plus" />New project</button>
      </div>
    </div>
  );
}

interface Props {
  projects: Project[];
  onChange: (p: Project[]) => void;
  fields: FieldDefinition[];
  scope: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onActivate: (id: string) => void;
  onShowShots: (id: string) => void;
  onEditFields: () => void;
}

/** Library › Projects: list with counts | detail (name, notes, ordered extra fields, delete when empty). */
export function ProjectsPage({ projects, onChange, fields, scope, selectedId, onSelect, onActivate, onShowShots, onEditFields }: Props) {
  const selected = projects.find((p) => p.id === selectedId) ?? projects.find((p) => p.id === scope) ?? projects[0] ?? null;
  return (
    <div class="f-app__body">
      <aside class="f-panel f-panel--left" style={{ "--panel-w": "300px" }} aria-label="Projects">
        <div class="f-panel__head"><span class="f-panel__title">Projects</span><button type="button" class="f-btn f-btn--sm" onClick={async () => { const p = await createProject(projects, onChange); if (p) onSelect(p.id); }}><Icon name="plus" />New project</button></div>
        <div class="f-panel__body f-panel__body--flush" role="listbox">
          {projects.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === selected?.id} class={cx("f-row f-row--dense", p.id === selected?.id && "is-selected")} onClick={() => onSelect(p.id)}>
              <div class="f-row__main"><span class="f-row__title">{p.name}</span><span class="f-row__meta">{p.shot_count} shot{p.shot_count === 1 ? "" : "s"} · {p.field_ids.length} field{p.field_ids.length === 1 ? "" : "s"}{p.shot_count === 0 ? " · can be deleted" : ""}</span></div>
              {p.id === scope && <span class="f-ptag">Active</span>}
            </button>
          ))}
        </div>
      </aside>
      {selected ? <ProjectDetail key={selected.id} project={selected} projects={projects} onChange={onChange} fields={fields} active={selected.id === scope} onActivate={onActivate} onShowShots={onShowShots} onEditFields={onEditFields} onDeleted={() => onSelect(null)} />
        : <Empty icon="folder-outline" title="No projects yet" actions={<button type="button" class="f-btn" onClick={() => void createProject(projects, onChange)}><Icon name="plus" />New project</button>} />}
    </div>
  );
}

function ProjectDetail({ project, projects, onChange, fields, active, onActivate, onShowShots, onEditFields, onDeleted }: { project: Project; projects: Project[]; onChange: (p: Project[]) => void; fields: FieldDefinition[]; active: boolean; onActivate: (id: string) => void; onShowShots: (id: string) => void; onEditFields: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(project.name);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [save, setSave] = useState<SaveState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => { setName(project.name); setNotes(project.notes ?? ""); }, [project.id]);
  const replace = (p: Project) => onChange(sortByName(projects.map((x) => (x.id === p.id ? p : x))));

  async function saveMeta(n = name, t = notes) {
    if (!n.trim()) { setNameError("A project needs a name."); return; }
    if (n.trim() === project.name && (t.trim() || null) === project.notes) return;
    setSave("saving"); setNameError(null);
    try { const saved = await putProject({ id: project.id, name: n.trim(), notes: t.trim() || null }); replace({ ...saved, field_ids: project.field_ids }); setSave("saved"); }
    catch (err) { setSave("error"); setNameError(existingIdOf(err) ? `A project called “${n.trim()}” already exists. Names are unique, ignoring case.` : (err as Error).message); }
  }
  async function setFieldIds(ids: string[]) {
    setSave("saving");
    try { const saved = await putProjectFields(project.id, ids); replace({ ...project, field_ids: saved }); setSave("saved"); } catch { setSave("error"); }
  }
  async function remove() {
    const ok = await confirmDialog({ title: `Delete “${project.name}”?`, body: "The project is empty; nothing else is removed.", confirmLabel: "Delete project", danger: true });
    if (!ok) return;
    try { await deleteProject(project.id); onChange(projects.filter((x) => x.id !== project.id)); onDeleted(); toast("Project deleted"); } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); }
  }
  const chosen = project.field_ids.map((id) => fields.find((f) => f.id === id)).filter((f): f is FieldDefinition => !!f);
  const rest = fields.filter((f) => !project.field_ids.includes(f.id));
  const moveField = (i: number, d: number) => { const l = [...project.field_ids]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); void setFieldIds(l); };

  return (
    <div class="f-scroll">
      <div class="f-toolbar">
        <div class="f-toolbar__title"><span>{project.name}</span></div>
        <SaveStatus state={save} onRetry={() => void saveMeta()} />
        <span class="f-toolbar__sp" />
        <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => onShowShots(project.id)}><Icon name="view-grid-outline" />Show {project.shot_count} shots</button>
        {!active && <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => onActivate(project.id)}><Icon name="swap-horizontal" />Make active</button>}
      </div>
      <div class="detail-form">
        <label class="f-field"><span class="f-field__label">Name</span>
          <span class={cx("f-input", nameError && "is-error")}><input value={name} maxLength={80} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => void saveMeta()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></span>
          {nameError && <ErrorLine>{nameError}</ErrorLine>}
        </label>
        <label class="f-field"><span class="f-field__label">Notes</span><textarea class="f-textarea" rows={3} value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} onBlur={() => void saveMeta()} /></label>
        <div class="f-field" style={{ gap: "8px" }}>
          <div class="btn-row"><span class="f-field__label" style={{ flex: 1 }}>Extra fields, in order</span><a href="#" style={{ fontSize: "var(--text-caption)" }} onClick={(e) => { e.preventDefault(); onEditFields(); }}>Edit definitions</a></div>
          {chosen.length > 0 && (
            <div class="list-box">
              {chosen.map((f, i) => (
                <div key={f.id} class="f-row f-row--dense" style={{ cursor: "default" }}>
                  <div class="f-row__main"><span class="f-row__title">{f.definition.label}</span><span class="f-row__meta mono">{f.key} · {f.definition.type}</span></div>
                  <div class="btn-row" style={{ gap: "2px" }}>
                    <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Move up" disabled={i === 0} onClick={() => moveField(i, -1)}><Icon name="arrow-up" /></button>
                    <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Move down" disabled={i === chosen.length - 1} onClick={() => moveField(i, 1)}><Icon name="arrow-down" /></button>
                    <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Remove from project" onClick={() => void setFieldIds(project.field_ids.filter((x) => x !== f.id))}><Icon name="close" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {fields.length === 0 ? <span class="meta">No fields defined yet. Define them in Library › Fields.</span> : rest.length > 0 && (
            <div style={{ width: "320px" }}><Combobox small icon="plus" key={project.field_ids.join()} options={rest.map((f) => ({ value: f.id, label: f.definition.label, hint: f.definition.type }))} value={null} clearable={false} placeholder={`Add a field… (${rest.length} more defined)`} onChange={(v) => { if (v) void setFieldIds([...project.field_ids, v]); }} /></div>
          )}
        </div>
        <div class="danger-zone">
          <button type="button" class="f-btn f-btn--danger" disabled={project.shot_count > 0} onClick={() => void remove()}><Icon name="delete-outline" />Delete project</button>
          {project.shot_count > 0 && <span class="meta">Only empty projects can be deleted. Move or delete its {project.shot_count} shots first.</span>}
        </div>
      </div>
    </div>
  );
}
