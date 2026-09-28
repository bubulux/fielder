import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { label, lightLabel, SHOT_STATES, STATE_ICONS } from "@fielder/vocab";
import { deleteShot, type SavedView, type Shot } from "./api";
import { FilterPanel } from "./FilterBuilder";
import { cover, rigLabel, shotTitle, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { useKeys } from "./keys";
import { ShotsMap } from "./MapView";
import { ModeSwitch } from "./ModeSwitch";
import { ShotCard } from "./ShotCard";
import { filterPills, ruleCount, runQuery, type Layout, type RefLists, type ShotsQuery, type Sort, type StateFilter } from "./shotsQuery";
import { confirmDialog, cx, Empty, Icon, Kbd, Seg, SeqBadge, StateMarker, toast } from "./ui";

interface Props {
  shots: Shot[] | null;
  error: string | null;
  scopeName: string;
  isAll: boolean;
  query: ShotsQuery;
  onQuery: (q: ShotsQuery) => void;
  view: SavedView | null;
  edited: boolean;
  onSaveView: () => void;
  onSaveAsNew: () => void;
  onRevert: () => void;
  onViewMenu: (action: "rename" | "delete") => void;
  panel: boolean;
  onPanel: (open: boolean) => void;
  layout: Layout;
  onLayout: (l: Layout) => void;
  mask: MaskMode;
  onMask: (m: MaskMode) => void;
  ctx: RefLists;
  onOpen: (s: Shot, list: Shot[]) => void;
  mapSelected: string | null;
  onMapSelected: (id: string | null) => void;
  onDeleted: (ids: string[]) => void;
  onReload: () => void;
  onSwitchScope: () => void;
}

const SORTS: { id: Sort; label: string }[] = [{ id: "newest", label: "Newest first" }, { id: "oldest", label: "Oldest first" }, { id: "name", label: "Name A–Z" }];

/** Shots: one place to browse (grid, list or map), filter (state switch, search, rules) and keep saved views. */
export function ShotsPage(p: Props) {
  const { query, onQuery, ctx } = p;
  const result = useMemo(() => (p.shots ? runQuery(p.shots, query, ctx.extra) : null), [p.shots, query, ctx.extra]);
  const shots = result?.shots ?? [];
  const rules = ruleCount(query.filter);
  const search = useRef<HTMLInputElement>(null);
  const setQuery = (q: Partial<ShotsQuery>) => onQuery({ ...query, ...q });
  const [menu, setMenu] = useState<"sort" | "view" | null>(null);

  useKeys({
    "/": () => search.current?.focus(),
    f: () => p.onPanel(!p.panel),
    Escape: (e) => { if (e.target === search.current) { search.current?.blur(); return; } return false; },
  });

  const title = p.view ? p.view.name : p.isAll ? "All shots · all projects" : "Shots";
  const total = p.shots?.length ?? 0;
  const filtered = rules > 0 || query.search.trim() !== "";
  const resultLine = !result ? "Loading…" : filtered ? `${result.matched} of ${total} shots` : `${total} shots`;
  const pills = filterPills(query.filter, ctx);
  const removePill = (i: number) => setQuery({ filter: { ...query.filter, rules: query.filter.rules.filter((_, j) => j !== i) } });

  const stateOpt = (s: StateFilter) => ({
    id: s, icon: s === "all" ? undefined : STATE_ICONS[s],
    label: <>{s === "all" ? "All" : label(s)} <span class="f-seg__n">{result ? result.counts[s] : "–"}</span></>,
  });

  return (
    <>
      <div class="f-toolbar">
        <div class="f-toolbar__title">
          {p.view && <Icon name="filter-variant" />}
          <span>{title}</span>
          {p.edited && <span class="f-edited">Edited</span>}
        </div>
        {p.view && p.edited && (
          <div class="btn-row" style={{ gap: "6px" }}>
            <button type="button" class="f-btn f-btn--sm" onClick={p.onSaveView}>Save</button>
            <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={p.onSaveAsNew}>Save as new…</button>
            <button type="button" class="f-btn f-btn--ghost f-btn--sm" onClick={p.onRevert}>Revert</button>
          </div>
        )}
        {!p.view && rules > 0 && <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={p.onSaveAsNew}><Icon name="content-save-outline" />Save view…</button>}
        {p.view && (
          <div class="menu-anchor">
            <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="View menu: rename, delete" aria-expanded={menu === "view"} onClick={() => setMenu(menu === "view" ? null : "view")}><Icon name="dots-horizontal" /></button>
            {menu === "view" && (
              <Popover onClose={() => setMenu(null)}>
                <button type="button" class="f-menu__item" onClick={() => { setMenu(null); p.onViewMenu("rename"); }}><Icon name="pencil-outline" />Rename…</button>
                <div class="f-menu__sep" />
                <button type="button" class="f-menu__item f-menu__item--danger" onClick={() => { setMenu(null); p.onViewMenu("delete"); }}><Icon name="delete-outline" />Delete view…</button>
              </Popover>
            )}
          </div>
        )}
        <div class="f-toolbar__sp" />
        <label class="f-input f-input--sm f-input--search">
          <i class="mdi mdi-magnify f-input__icon" aria-hidden="true" />
          <input ref={search} value={query.search} placeholder="Name or location" aria-label="Search shots" onInput={(e) => setQuery({ search: (e.target as HTMLInputElement).value })} />
          {query.search ? <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" style={{ height: "24px", width: "24px", marginRight: "4px" }} aria-label="Clear search" onClick={() => setQuery({ search: "" })}><Icon name="close" /></button> : <Kbd>/</Kbd>}
        </label>
        <button type="button" class={cx("f-btn f-btn--sm", !p.panel && "f-btn--secondary")} aria-pressed={p.panel} onClick={() => p.onPanel(!p.panel)}>
          <Icon name="filter-variant" />Filter{rules > 0 && <span class="f-btn__kbd">{rules}</span>}
        </button>
        <Seg label="Layout" value={p.layout} onChange={p.onLayout} options={[{ id: "grid", icon: "view-grid-outline", label: "Grid" }, { id: "list", icon: "view-list-outline", label: "List" }, { id: "map", icon: "map-outline", label: "Map" }]} />
        <ModeSwitch value={p.mask} onChange={p.onMask} />
      </div>
      <div class="f-toolbar f-toolbar--sub">
        <Seg label="Review state" value={query.state} onChange={(state) => setQuery({ state })} options={(["all", ...SHOT_STATES] as StateFilter[]).map(stateOpt)} />
        {pills.length > 0 && (
          <div class="f-fpills">
            {pills.map((pl) => (
              <span key={pl.index} class={cx("f-fpill", pl.any && "f-fpill--any")}>
                <span style={{ cursor: "pointer" }} onClick={() => p.onPanel(true)}>{pl.text} <b>{pl.bold}</b></span>
                <button type="button" class="f-fpill__x" aria-label="Remove rule" onClick={() => removePill(pl.index)}><Icon name="close" /></button>
              </span>
            ))}
            <button type="button" class="f-linkbtn" style={{ fontSize: "var(--text-caption)" }} onClick={() => setQuery({ filter: { ...query.filter, rules: [] } })}>Clear</button>
          </div>
        )}
        <div class="f-toolbar__sp" />
        <span class="meta num">{resultLine}</span>
        <div class="menu-anchor">
          <button type="button" class="f-btn f-btn--ghost f-btn--sm" aria-expanded={menu === "sort"} onClick={() => setMenu(menu === "sort" ? null : "sort")}>{SORTS.find((s) => s.id === query.sort)?.label}<Icon name="chevron-down" /></button>
          {menu === "sort" && (
            <Popover onClose={() => setMenu(null)} right>
              {SORTS.map((s) => <button key={s.id} type="button" class={cx("f-menu__item", s.id === query.sort && "is-sel")} onClick={() => { setMenu(null); setQuery({ sort: s.id }); }}><Icon name={s.id === query.sort ? "check" : "blank"} />{s.label}</button>)}
            </Popover>
          )}
        </div>
      </div>
      <div class="f-app__body">
        {p.error && !p.shots ? (
          <div class="f-scroll"><div style={{ padding: "16px" }}><LoadError message={p.error} onRetry={p.onReload} /></div></div>
        ) : !result ? (
          <div class="f-scroll"><div class="shot-grid">{Array.from({ length: 12 }, (_, i) => <div key={i} class="skel-card"><div class="f-skel" style={{ aspectRatio: "4 / 3", borderRadius: 0 }} /><div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}><div class="f-skel" style={{ height: "14px", width: "70%" }} /><div class="f-skel" style={{ height: "10px", width: "50%" }} /></div></div>)}</div></div>
        ) : total === 0 ? (
          <Empty icon="camera-off-outline" title={`No shots in ${p.scopeName} yet`} actions={<button type="button" class="f-btn f-btn--secondary" onClick={p.onSwitchScope}>Switch scope</button>}>
            Shots appear here after the phone uploads them. Pick another scope to browse other projects.
          </Empty>
        ) : shots.length === 0 && p.layout !== "map" ? (
          <Empty icon="filter-remove-outline" title="No shots match" actions={<><button type="button" class="f-btn f-btn--secondary" onClick={() => p.onPanel(true)}>Edit filter</button><button type="button" class="f-btn f-btn--ghost" onClick={() => onQuery({ ...query, filter: { ...query.filter, rules: [] }, search: "", state: "all" })}>Clear filter</button></>}>
            None of the {total} shots pass {rules > 0 ? "all rules" : "the search and state switch"}. Remove a rule or widen a range.
          </Empty>
        ) : p.layout === "map" ? (
          <ShotsMap shots={shots} mask={p.mask} selectedId={p.mapSelected} onSelect={p.onMapSelected} onOpen={(s) => p.onOpen(s, shots)} />
        ) : p.layout === "list" ? (
          <ShotsList shots={shots} isAll={p.isAll} mask={p.mask} onOpen={(s) => p.onOpen(s, shots)} onDeleted={p.onDeleted} />
        ) : (
          <ShotsGrid shots={shots} isAll={p.isAll} mask={p.mask} onOpen={(s) => p.onOpen(s, shots)} />
        )}
        {p.error && p.shots && <div class="float-banner"><LoadError message={p.error} onRetry={p.onReload} /></div>}
        {p.panel && <FilterPanel group={query.filter} ctx={ctx} onChange={(filter) => setQuery({ filter })} onClose={() => p.onPanel(false)} resultLine={resultLine} />}
      </div>
    </>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div class="f-banner f-banner--danger" role="alert">
      <Icon name="alert-circle" />
      <div class="f-banner__text"><span class="f-banner__title">Couldn’t load shots</span><span class="f-banner__meta">{message}</span></div>
      <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

/** A small menu anchored under its button; closes on outside click or Esc. */
export function Popover({ children, onClose, right }: { children: ComponentChildren; onClose: () => void; right?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc, true); };
  }, []);
  return <div ref={box} class="f-menu popover" style={right ? { right: 0 } : { left: 0 }}>{children}</div>;
}

function ShotsGrid({ shots, isAll, mask, onOpen }: { shots: Shot[]; isAll: boolean; mask: MaskMode; onOpen: (s: Shot) => void }) {
  const grid = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(0);
  useEffect(() => { if (focus >= shots.length) setFocus(Math.max(0, shots.length - 1)); }, [shots.length]);
  const cols = () => (grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(" ").length : 1);
  const move = (d: number) => {
    const n = Math.max(0, Math.min(shots.length - 1, focus + d));
    setFocus(n);
    (grid.current?.querySelectorAll<HTMLElement>(".f-card")[n])?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols() : e.key === "ArrowUp" ? -cols() : 0;
    if (d) { e.preventDefault(); move(d); }
  };
  return (
    <div class="f-scroll">
      <div ref={grid} class="shot-grid" role="grid" aria-label="Shots" onKeyDown={onKey}>
        {shots.map((s, i) => <ShotCard key={s.id} shot={s} mask={mask} project={isAll ? s.project_name : null} focused={i === focus} onFocus={() => setFocus(i)} onClick={() => onOpen(s)} />)}
      </div>
    </div>
  );
}

function ShotsList({ shots, isAll, mask, onOpen, onDeleted }: { shots: Shot[]; isAll: boolean; mask: MaskMode; onOpen: (s: Shot) => void; onDeleted: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => { setSelected((cur) => new Set([...cur].filter((id) => shots.some((s) => s.id === id)))); }, [shots]);
  useEffect(() => { body.current?.children[focus]?.scrollIntoView({ block: "nearest" }); }, [focus]);

  const toggle = (i: number, range: boolean) => {
    const id = shots[i]?.id;
    if (!id) return;
    setSelected((cur) => {
      const n = new Set(cur);
      if (range && anchor !== null) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; for (let k = a; k <= b; k++) n.add(shots[k].id); }
      else if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    setAnchor(i);
  };
  async function removeSelected() {
    const ids = shots.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (!ids.length) return;
    const ok = await confirmDialog({ title: `Delete ${ids.length} shot${ids.length === 1 ? "" : "s"}?`, body: "Removes the images and their metadata permanently. Archiving keeps them.", confirmLabel: `Delete ${ids.length}`, danger: true });
    if (!ok) return;
    setBusy(true);
    const done: string[] = [], failed: string[] = [];
    for (const id of ids) { try { await deleteShot(id); done.push(id); } catch (e) { failed.push((e as Error).message); } }
    setBusy(false);
    setSelected(new Set());
    onDeleted(done);
    if (failed.length) toast(`${failed.length} deletion(s) failed: ${failed[0]}`, "danger"); else toast(`Deleted ${done.length} shot${done.length === 1 ? "" : "s"}`);
  }

  useKeys({
    j: () => setFocus((f) => Math.min(shots.length - 1, f + 1)),
    k: () => setFocus((f) => Math.max(0, f - 1)),
    ArrowDown: () => setFocus((f) => Math.min(shots.length - 1, f + 1)),
    ArrowUp: () => setFocus((f) => Math.max(0, f - 1)),
    x: () => toggle(focus, false),
    "Shift+X": () => toggle(focus, true),
    Enter: () => { if (shots[focus]) onOpen(shots[focus]); },
    Delete: () => void removeSelected(),
    Escape: () => { if (selected.size === 0) return false; setSelected(new Set()); },
  });

  const all = shots.length > 0 && selected.size === shots.length;
  const some = selected.size > 0 && !all;
  return (
    <div class="f-scroll" style={{ position: "relative" }}>
      <table class="f-table">
        <thead><tr>
          <th class="is-cell-check"><button type="button" class={cx("f-check", all && "is-checked", some && "is-indeterminate")} aria-label={all ? "Deselect all" : "Select all"} onClick={() => setSelected(all ? new Set() : new Set(shots.map((s) => s.id)))}><span class="f-check__box">{all ? <Icon name="check" /> : some ? <Icon name="minus" /> : null}</span></button></th>
          <th style={{ width: "72px" }} />
          <th>Name</th>{isAll && <th>Project</th>}<th>Location</th><th>State</th><th>INT/EXT</th><th>Light</th><th>Rig · lens</th><th class="is-num">Photos</th><th>Captured</th>
        </tr></thead>
        <tbody ref={body}>
          {shots.map((s, i) => (
            <tr key={s.id} class={cx(selected.has(s.id) && "is-selected", i === focus && "is-focus")} onClick={(e) => { setFocus(i); if (e.shiftKey || e.metaKey || e.ctrlKey) toggle(i, e.shiftKey); else onOpen(s); }}>
              <td class="is-cell-check" onClick={(e) => { e.stopPropagation(); setFocus(i); toggle(i, e.shiftKey); }}>
                <span class={cx("f-check", selected.has(s.id) && "is-checked")} role="checkbox" aria-checked={selected.has(s.id)} aria-label={`Select ${shotTitle(s)}`}><span class="f-check__box">{selected.has(s.id) && <Icon name="check" />}</span></span>
              </td>
              <td><div class="f-table__thumb"><Framed photo={cover(s)} mode={mask} /></div></td>
              <td class="is-strong"><div style={{ display: "flex", alignItems: "center", gap: "6px", maxWidth: "240px" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{shotTitle(s)}</span>{s.photos.length > 1 && <SeqBadge count={s.photos.length} small />}</div></td>
              {isAll && <td><span class="f-ptag">{s.project_name}</span></td>}
              <td>{s.location_name ?? <span class="is-dim">—</span>}</td>
              <td><StateMarker state={s.state} /></td>
              <td>{label(s.int_ext).toUpperCase() || <span class="is-dim">—</span>}</td>
              <td>{lightLabel(s.light, s.artificial) || <span class="is-dim">—</span>}</td>
              <td class="is-dim">{rigLabel(cover(s))}</td>
              <td class="is-num">{s.photos.length}</td>
              <td class="is-dim">{when(s.captured_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected.size > 0 && (
        <div class="selbar-wrap">
          <div class="f-selbar">
            <Icon name="checkbox-multiple-marked" size={20} />
            <span>{selected.size} selected</span>
            {!all && <button type="button" class="f-linkbtn" style={{ fontSize: "var(--text-small)" }} onClick={() => setSelected(new Set(shots.map((s) => s.id)))}>Select all {shots.length}</button>}
            <span class="f-selbar__sp" />
            <button type="button" class="f-btn f-btn--ghost f-btn--sm" onClick={() => setSelected(new Set())}>Clear<span class="f-btn__kbd">Esc</span></button>
            <button type="button" class="f-btn f-btn--danger f-btn--sm" disabled={busy} onClick={() => void removeSelected()}><Icon name="delete-outline" />{busy ? "Deleting…" : `Delete ${selected.size} shot${selected.size === 1 ? "" : "s"}…`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
