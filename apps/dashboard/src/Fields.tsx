import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FIELD_PROMPT, validateFieldDef, type Extra, type FieldDef } from "@fielder/vocab";
import { deleteField, importFields, putField, type FieldDefinition, type Project } from "./api";
import { ExtraEditor } from "./ExtraEditor";
import { useKeys } from "./keys";
import { Popover } from "./ShotsPage";
import { confirmDialog, cx, Empty, Icon, SaveStatus, toast, type SaveState } from "./ui";

interface Props { fields: FieldDefinition[]; onChange: (f: FieldDefinition[]) => void; projects: Project[]; selectedId: string | null; onSelect: (id: string | null) => void }

const TEMPLATES: Record<string, { label: string; def: FieldDef }> = {
  text: { label: "Text", def: { key: "notes", label: "Notes", type: "text" } },
  number: { label: "Number", def: { key: "floors", label: "Floors", type: "number" } },
  boolean: { label: "Yes / no", def: { key: "parking", label: "Parking", type: "boolean" } },
  select: { label: "Select", def: { key: "power", label: "Power", type: "select", options: ["Mains", "Generator", "None"] } },
  group: {
    label: "Group with a dependent select",
    def: { key: "ubahn", label: "U-Bahn", type: "group", fields: [
      { key: "line", label: "Line", type: "select", options: ["U1", "U4"] },
      { key: "station", label: "Station", type: "select", optionsBy: { field: "line", options: { U1: ["Kurfürstendamm"], U4: ["Nollendorfplatz", "Bayerischer Platz"] } } },
    ] },
  },
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Line (1-based) of a JSON.parse error, from "position N" or "line L column C" in the message. */
function errorLine(text: string, message: string): number | null {
  const lc = /line (\d+)/.exec(message);
  if (lc) return Number(lc[1]);
  const pos = /position (\d+)/.exec(message);
  if (pos) return text.slice(0, Number(pos[1])).split("\n").length;
  return null;
}

/** Library › Fields: list | JSON editor with line numbers and the error line | live preview of the form. */
export function FieldsPage({ fields, onChange, projects, selectedId, onSelect }: Props) {
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<{ id: string; isNew: boolean; text: string } | null>(null);
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  useEffect(() => { if (selected && draft?.id !== selected.id) setDraft({ id: selected.id, isNew: false, text: pretty(selected.definition) }); }, [selected?.id]);
  useEffect(() => { if (!selectedId && !draft && fields[0]) onSelect(fields[0].id); }, [fields.length]);

  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast(`${what} copied`));
  const startNew = (t: FieldDef) => { setMenu(false); setImporting(false); onSelect(null); setDraft({ id: crypto.randomUUID(), isNew: true, text: pretty(t) }); };

  return (
    <>
      <div class="f-toolbar">
        <div class="f-toolbar__title"><span>Extra fields</span><span class="meta num" style={{ fontSize: "var(--text-body)" }}>{fields.length}</span></div>
        <span class="f-toolbar__sp" />
        <div class="menu-anchor">
          <button type="button" class="f-btn f-btn--sm" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="plus" />New field<Icon name="chevron-down" /></button>
          {menu && <Popover right onClose={() => setMenu(false)}><div class="f-menu__label">Start from</div>{Object.entries(TEMPLATES).map(([k, t]) => <button key={k} type="button" class="f-menu__item" onClick={() => startNew(t.def)}>{t.label}</button>)}</Popover>}
        </div>
        <button type="button" class="f-btn f-btn--secondary f-btn--sm" aria-pressed={importing} onClick={() => setImporting(!importing)}><Icon name="file-import-outline" />Import JSON…</button>
        <button type="button" class="f-btn f-btn--secondary f-btn--sm" disabled={fields.length === 0} onClick={() => copy(pretty(fields.map((f) => f.definition)), "All definitions")}><Icon name="content-copy" />Copy all</button>
        <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => copy(FIELD_PROMPT, "Prompt")}><Icon name="robot-outline" />Copy prompt for AI</button>
      </div>
      <div class="f-app__body">
        <aside class="f-panel f-panel--left" style={{ "--panel-w": "260px" }}>
          <div class="f-panel__body f-panel__body--flush" role="listbox" aria-label="Fields">
            {fields.length === 0 && <div class="f-empty"><div class="meta">No fields yet. Start from a template or import JSON (e.g. written by an AI with the copied prompt).</div></div>}
            {draft?.isNew && <div class="f-row f-row--dense is-selected"><div class="f-row__main"><span class="f-row__title">New field</span><span class="f-row__meta">not saved yet</span></div></div>}
            {fields.map((f) => {
              const used = projects.filter((p) => p.field_ids.includes(f.id)).length;
              return (
                <button key={f.id} type="button" role="option" aria-selected={f.id === selectedId && !importing} class={cx("f-row f-row--dense", f.id === selectedId && !draft?.isNew && !importing && "is-selected")} onClick={() => { setImporting(false); onSelect(f.id); }}>
                  <div class="f-row__main"><span class="f-row__title">{f.definition.label}</span><span class="f-row__meta"><span class="mono">{f.key}</span> · {f.definition.type}{f.definition.multiple ? " · multiple" : ""} · {used ? `${used} project${used === 1 ? "" : "s"}` : "unused"}</span></div>
                </button>
              );
            })}
          </div>
        </aside>
        {importing ? <ImportPane onDone={(list) => { onChange(list); setImporting(false); }} onCancel={() => setImporting(false)} />
          : draft ? <Editor key={draft.id} draft={draft} fields={fields} projects={projects} onChange={onChange}
            onSaved={(f) => { setDraft({ id: f.id, isNew: false, text: pretty(f.definition) }); onSelect(f.id); }}
            onDeleted={() => { setDraft(null); onSelect(null); }} onCancelNew={() => { setDraft(null); onSelect(fields[0]?.id ?? null); }} />
          : <Empty icon="form-textbox" title="No field selected" />}
      </div>
    </>
  );
}

function Editor({ draft, fields, projects, onChange, onSaved, onDeleted, onCancelNew }: { draft: { id: string; isNew: boolean; text: string }; fields: FieldDefinition[]; projects: Project[]; onChange: (f: FieldDefinition[]) => void; onSaved: (f: FieldDefinition) => void; onDeleted: () => void; onCancelNew: () => void }) {
  const [text, setText] = useState(draft.text);
  const [save, setSave] = useState<SaveState>("idle");
  const [preview, setPreview] = useState<Extra>({});
  const [lastValid, setLastValid] = useState<FieldDef | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const parsed = useMemo((): { def: FieldDef | null; err: string | null; line: number | null } => {
    try { const v = JSON.parse(text) as unknown; const err = validateFieldDef(v); return { def: err ? null : (v as FieldDef), err, line: null }; }
    catch (e) { const m = (e as Error).message; return { def: null, err: `JSON: ${m}`, line: errorLine(text, m) }; }
  }, [text]);
  useEffect(() => { if (parsed.def) setLastValid(parsed.def); }, [parsed.def]);
  const dirty = text !== draft.text || draft.isNew;
  const used = projects.filter((p) => p.field_ids.includes(draft.id)).map((p) => p.name);
  const lines = text.split("\n").length;

  async function saveField() {
    if (!parsed.def) return;
    setSave("saving");
    try {
      const saved = await putField(draft.id, parsed.def);
      onChange([...fields.filter((f) => f.id !== saved.id), saved].sort((a, b) => a.key.localeCompare(b.key)));
      setSave("saved");
      onSaved(saved);
    } catch (e) { setSave("error"); toast((e as Error).message, "danger"); }
  }
  async function remove() {
    const def = fields.find((f) => f.id === draft.id);
    if (!def) return;
    const ok = await confirmDialog({ title: `Delete “${def.definition.label}”?`, body: `${used.length ? `Used by ${used.join(", ")}. ` : ""}Values already stored on shots stay in the data but are no longer shown or edited.`, confirmLabel: "Delete field", danger: true });
    if (!ok) return;
    try { await deleteField(def.id); onChange(fields.filter((x) => x.id !== def.id)); onDeleted(); toast("Field deleted"); } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); }
  }
  useKeys({ "Mod+s": () => void saveField(), Escape: () => area.current?.blur() });

  const title = parsed.def ?? lastValid;
  return (
    <>
      <div class="json-pane">
        <div class="btn-row">
          <strong style={{ flex: 1 }}>{title?.label ?? "Field"} <span class="mono meta">{title?.key}</span></strong>
          <SaveStatus state={parsed.err ? "idle" : dirty ? "dirty" : save} />
          {parsed.err && <span class="f-save f-save--error"><Icon name="alert-circle" />1 error</span>}
        </div>
        <div class={cx("f-json", parsed.err && "is-error")} style={{ flex: 1 }}>
          <div class="f-json__gutter" ref={gutter} aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} class={parsed.line === i + 1 ? "is-err" : ""}>{i + 1}</span>)}</div>
          <textarea ref={area} class="json-area" spellcheck={false} aria-label="Definition JSON" value={text} rows={lines}
            onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); setSave("idle"); }}
            onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.target as HTMLTextAreaElement; const s = t.selectionStart; setText(text.slice(0, s) + "  " + text.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); } }} />
        </div>
        {parsed.err && <div class="f-banner f-banner--danger"><Icon name="alert-circle" /><div class="f-banner__text"><span class="f-banner__title">{parsed.line ? `Line ${parsed.line}` : "Definition"}</span><span class="f-banner__meta mono">{parsed.err}</span></div></div>}
        <div class="btn-row">
          <button type="button" class="f-btn" disabled={!parsed.def || !dirty} onClick={() => void saveField()}>Save field<span class="f-btn__kbd">⌘S</span></button>
          {draft.isNew ? <button type="button" class="f-btn f-btn--ghost" onClick={onCancelNew}>Cancel</button> : <button type="button" class="f-btn f-btn--ghost" disabled={!dirty} onClick={() => setText(draft.text)}>Revert</button>}
          <span class="grow" />
          {!draft.isNew && <span class="meta">{used.length ? `Used by ${used.join(", ")}` : "Not used by any project"}</span>}
          {!draft.isNew && <button type="button" class="f-btn f-btn--danger f-btn--sm" onClick={() => void remove()}><Icon name="delete-outline" />Delete…</button>}
        </div>
      </div>
      <aside class="f-panel" style={{ "--panel-w": "300px" }}>
        <div class="f-panel__head"><span class="f-panel__title" style={{ fontSize: "var(--text-body)" }}>Live preview</span>{parsed.err && lastValid && <span class="meta">last valid</span>}</div>
        <div class="f-panel__body">{title ? <ExtraEditor defs={[title]} value={preview} onChange={setPreview} /> : <span class="meta">Fix the JSON to see the form.</span>}</div>
      </aside>
    </>
  );
}

function ImportPane({ onDone, onCancel }: { onDone: (f: FieldDefinition[]) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function run() {
    try {
      const v = JSON.parse(text) as unknown;
      const r = await importFields(Array.isArray(v) ? v : [v]);
      onDone(r.fields);
      toast(`Imported: ${r.created} new, ${r.updated} replaced`);
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <div class="json-pane">
      <strong>Import field definitions</strong>
      <span class="meta">A JSON array (or a single field). Existing keys are replaced, new keys are added. Tip: “Copy prompt for AI”, describe what you need, paste the answer here.</span>
      <textarea class="f-textarea mono" style={{ flex: 1, fontSize: "12.5px" }} spellcheck={false} value={text} placeholder='[{ "key": "…", "label": "…", "type": "text" }]' onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); setError(null); }} />
      {error && <div class="f-banner f-banner--danger"><Icon name="alert-circle" /><div class="f-banner__text"><span class="f-banner__title">Not imported</span><span class="f-banner__meta mono">{error}</span></div></div>}
      <div class="btn-row"><button type="button" class="f-btn" disabled={!text.trim()} onClick={() => void run()}><Icon name="file-import-outline" />Import</button><button type="button" class="f-btn f-btn--ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}
