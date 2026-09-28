import { useMemo, useState } from "preact/hooks";
import { emptyFilter, evaluateFilter, extraFilterFields, type FieldDef, type FilterGroup } from "@fielder/vocab";
import { deleteView, putView, type Location, type Preset, type Project, type SavedView, type Shot } from "./api";
import { FilterBuilderResults } from "./ViewsResults";
import { GroupEditor } from "./FilterBuilder";
import { filterable } from "./format";
import type { MaskMode } from "./Framed";
import { ErrorLine, Icon } from "./ui";

interface Props {
  shots: Shot[];
  projects: Project[];
  /** Extra fields that can be filtered on. */
  fieldDefs: readonly FieldDef[];
  locations: Location[];
  presets: Preset[];
  views: SavedView[] | null;
  onViews: (v: SavedView[]) => void;
  mask: MaskMode;
  onOpen: (s: Shot, list: Shot[]) => void;
}

/** Filter tool: build a query, see matching shots, save it as a named view on the server. */
export function Views({ shots, projects, fieldDefs, locations, presets, views, onViews, mask, onOpen }: Props) {
  const [current, setCurrent] = useState<SavedView | null>(null);
  const [filter, setFilter] = useState<FilterGroup>(emptyFilter);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const extra = useMemo(() => extraFilterFields(fieldDefs), [fieldDefs]);
  const results = useMemo(() => shots.filter((s) => evaluateFilter(filter, filterable(s), extra)), [shots, filter, extra]);

  const load = (v: SavedView) => { setCurrent(v); setFilter(v.filter); setName(v.name); setDirty(false); setError(null); };
  const fresh = () => { setCurrent(null); setFilter(emptyFilter()); setName(""); setDirty(false); setError(null); };
  const change = (g: FilterGroup) => { setFilter(g); setDirty(true); };

  async function save(asNew = false) {
    if (!name.trim()) { setError("Give the view a name."); return; }
    setBusy(true); setError(null);
    try {
      const saved = await putView({ id: asNew || !current ? crypto.randomUUID() : current.id, name: name.trim(), filter });
      onViews([...(views ?? []).filter((v) => v.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      setCurrent(saved); setDirty(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!current || !confirm(`Delete view "${current.name}"?`)) return;
    try { await deleteView(current.id); onViews((views ?? []).filter((v) => v.id !== current.id)); fresh(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div class="views">
      <aside class="views-side">
        <div class="views-list">
          <div class="views-head"><strong>Saved views</strong><button class="f-btn f-btn--sm" onClick={fresh}><Icon name="plus" />New</button></div>
          {!views ? <div class="meta">Loading…</div> : views.length === 0 ? <div class="meta">None yet. Build a filter and save it.</div> : views.map((v) => (
            <button key={v.id} class={`view-item ${current?.id === v.id ? "active" : ""}`} onClick={() => load(v)}>
              <span>{v.name}</span>
              <span class="count">{shots.filter((s) => evaluateFilter(v.filter, filterable(s), extra)).length}</span>
            </button>
          ))}
        </div>
        <div class="views-save">
          <input value={name} onInput={(e) => { setName((e.target as HTMLInputElement).value); setDirty(true); }} placeholder="View name" />
          <div class="form-actions">
            <button class="f-btn" disabled={busy} onClick={() => void save(false)}>{current ? "Save" : "Save view"}</button>
            {current && <button class="f-btn f-btn--secondary" disabled={busy} onClick={() => void save(true)}>Save as new</button>}
            {current && <button class="f-btn f-btn--danger" disabled={busy} onClick={() => void remove()}><Icon name="delete-outline" />Delete</button>}
          </div>
          {dirty && current && <div class="warn"><Icon name="circle-edit-outline" /> Unsaved changes</div>}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>
      </aside>
      <section class="views-main">
        <GroupEditor group={filter} ctx={{ projects, locations, presets, extra }} onChange={change} />
        <FilterBuilderResults shots={results} total={shots.length} mask={mask} onOpen={onOpen} />
      </section>
    </div>
  );
}
