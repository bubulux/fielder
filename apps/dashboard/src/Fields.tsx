import { useMemo, useState } from "preact/hooks";
import { FIELD_PROMPT, validateFieldDef, type Extra, type FieldDef } from "@fielder/vocab";
import { deleteField, importFields, putField, type FieldDefinition, type Project } from "./api";
import { ExtraEditor } from "./ExtraEditor";

interface Props { fields: FieldDefinition[] | null; onChange: (f: FieldDefinition[]) => void; projects: Project[] }

const TEMPLATES: Record<string, FieldDef> = {
  text: { key: "notes", label: "Notes", type: "text" },
  select: { key: "parking", label: "Parking", type: "select", options: ["On site", "Street", "None"] },
  group: {
    key: "ubahn", label: "U-Bahn", type: "group", fields: [
      { key: "line", label: "Line", type: "select", options: ["U1", "U4"] },
      { key: "station", label: "Station", type: "select", optionsBy: { field: "line", options: { U1: ["Kurfürstendamm"], U4: ["Nollendorfplatz", "Bayerischer Platz"] } } },
    ],
  },
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Global extra-field definitions: edit as JSON with a live form preview, import many at once (e.g. from an AI). */
export function Fields({ fields, onChange, projects }: Props) {
  const [edit, setEdit] = useState<{ id: string; text: string; isNew: boolean } | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extra>({});
  const [copied, setCopied] = useState(false);

  const parsed = useMemo((): { def: FieldDef | null; err: string | null } => {
    if (!edit) return { def: null, err: null };
    try { const v = JSON.parse(edit.text) as unknown; const err = validateFieldDef(v); return { def: err ? null : (v as FieldDef), err }; } catch (e) { return { def: null, err: `JSON: ${(e as Error).message}` }; }
  }, [edit?.text]);
  const usedBy = (id: string) => projects.filter((p) => p.field_ids.includes(id)).map((p) => p.name);

  async function save() {
    if (!edit || !parsed.def) return;
    try {
      const saved = await putField(edit.id, parsed.def);
      onChange([...(fields ?? []).filter((f) => f.id !== saved.id), saved].sort((a, b) => a.key.localeCompare(b.key)));
      setEdit(null); setError(null);
    } catch (e) { setError((e as Error).message); }
  }
  async function runImport() {
    if (importText === null) return;
    try {
      const v = JSON.parse(importText) as unknown;
      const list = Array.isArray(v) ? v : [v];
      const r = await importFields(list);
      onChange(r.fields);
      setImportText(null); setError(null);
      alert(`Imported: ${r.created} new, ${r.updated} replaced.`);
    } catch (e) { setError((e as Error).message); }
  }
  async function remove(f: FieldDefinition) {
    const used = usedBy(f.id);
    if (!confirm(`Delete field "${f.definition.label}"?${used.length ? ` Used by: ${used.join(", ")}.` : ""} Values already stored on shots stay in the data but are no longer shown or edited.`)) return;
    try { await deleteField(f.id); onChange((fields ?? []).filter((x) => x.id !== f.id)); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }
  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  if (!fields) return <div class="status">Loading…</div>;
  return (
    <div class="rigs fields-page">
      <p class="meta" style="max-width:820px">
        Extra fields describe project-specific details of a shot (e.g. the nearest U-Bahn station, access notes). They are defined once here and each project picks the ones it uses (Projects → Edit).
        Definitions are JSON, so an AI can write them: copy the prompt, describe what you need, paste the answer into Import.
      </p>
      <div class="actions" style="justify-content:flex-start;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn primary" onClick={() => { setEdit({ id: crypto.randomUUID(), text: pretty(TEMPLATES.text), isNew: true }); setPreview({}); }}>＋ New field</button>
        <button class="btn" onClick={() => setImportText("")}>Import JSON…</button>
        <button class="btn outline" onClick={() => copy(pretty(fields.map((f) => f.definition)))} disabled={fields.length === 0}>Copy all as JSON</button>
        <button class="btn outline" onClick={() => copy(FIELD_PROMPT)}>Copy prompt for AI</button>
        {copied && <span class="meta">Copied.</span>}
      </div>
      {importText !== null && (
        <div class="rig-form">
          <h3>Import field definitions</h3>
          <textarea class="json" rows={14} value={importText} placeholder='[{ "key": "...", "label": "...", "type": "text" }]' onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)} />
          <div class="meta">A JSON array (or a single field). Existing keys are replaced, new keys are added.</div>
          {error && <div class="error">{error}</div>}
          <div class="actions" style="justify-content:flex-start">
            <button class="btn primary" disabled={!importText.trim()} onClick={() => void runImport()}>Import</button>
            <button class="btn" onClick={() => { setImportText(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      <table>
        <thead><tr><th>Label</th><th>Key</th><th>Type</th><th>Used by</th><th></th></tr></thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id} class={edit?.id === f.id ? "selected" : ""}>
              <td>{f.definition.label}</td>
              <td class="meta">{f.key}</td>
              <td class="meta">{f.definition.type}{f.definition.type === "group" ? ` (${f.definition.fields?.length ?? 0})` : ""}</td>
              <td class="meta">{usedBy(f.id).join(", ") || "—"}</td>
              <td class="actions">
                <button class="btn" onClick={() => { setEdit({ id: f.id, text: pretty(f.definition), isNew: false }); setPreview({}); setError(null); }}>Edit</button>
                <button class="btn danger" onClick={() => void remove(f)}>Delete</button>
              </td>
            </tr>
          ))}
          {fields.length === 0 && <tr><td colSpan={5} class="meta">No fields yet.</td></tr>}
        </tbody>
      </table>
      {edit && (
        <div class="rig-form field-edit">
          <h3>{edit.isNew ? "New field" : "Edit field"}</h3>
          {edit.isNew && (
            <div class="chips">
              <span class="meta">Start from:</span>
              {Object.keys(TEMPLATES).map((t) => <button type="button" key={t} class="chip" onClick={() => setEdit({ ...edit, text: pretty(TEMPLATES[t]) })}>{t}</button>)}
            </div>
          )}
          <div class="field-edit-cols">
            <textarea class="json" rows={18} value={edit.text} spellcheck={false} onInput={(e) => setEdit({ ...edit, text: (e.target as HTMLTextAreaElement).value })} />
            <div>
              <div class="meta" style="margin-bottom:6px">Preview</div>
              {parsed.def ? <div class="tags-form"><ExtraEditor defs={[parsed.def]} value={preview} onChange={setPreview} /></div> : <div class="error">{parsed.err}</div>}
            </div>
          </div>
          {error && <div class="error">{error}</div>}
          <div class="actions" style="justify-content:flex-start">
            <button class="btn primary" disabled={!parsed.def} onClick={() => void save()}>Save field</button>
            <button class="btn" onClick={() => { setEdit(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
