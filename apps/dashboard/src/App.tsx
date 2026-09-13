import { useEffect, useMemo, useState } from "preact/hooks";
import { SHOT_STATES } from "@fielder/vocab";
import { deleteShot, fetchAllShots, fetchLocations, fetchPresets, fetchViews, type Location, type Preset, type SavedView, type Shot, type ShotState } from "./api";
import { isFrameMode, placeLabel, rigLabel, shotTitle, tagsLabel, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { Locations } from "./Locations";
import { MapView } from "./MapView";
import { ModeSwitch } from "./ModeSwitch";
import { Review } from "./Review";
import { Rigs } from "./Rigs";
import { Badge, ShotDetail } from "./ShotDetail";
import { Views } from "./Views";

type Tab = "gallery" | "review" | "map" | "views" | "rigs" | "locations";
const TABS: Tab[] = ["gallery", "review", "map", "views", "rigs", "locations"];
type Filter = ShotState | "all";
type Layout = "grid" | "list";
function loadLayout(): Layout { try { return localStorage.getItem("layout") === "list" ? "list" : "grid"; } catch { return "grid"; } }

function loadMask(): MaskMode {
  try { const v = localStorage.getItem("maskMode"); if (isFrameMode(v)) return v; } catch { /* ignore */ }
  return "mask";
}
const tabFromHash = (): Tab => (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : "gallery";

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [focus, setFocus] = useState<Shot | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mask, setMaskState] = useState<MaskMode>(loadMask);
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const setLayout = (l: Layout) => { setLayoutState(l); try { localStorage.setItem("layout", l); } catch { /* ignore */ } };
  /** The list the open shot belongs to, for prev/next in the dialog. */
  const [openList, setOpenList] = useState<Shot[]>([]);
  /** Row selection in the list layout (shot ids). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelected = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMask = (m: MaskMode) => { setMaskState(m); try { localStorage.setItem("maskMode", m); } catch { /* ignore */ } };

  const load = () => Promise.all([fetchAllShots().then(setShots), fetchPresets().then(setPresets), fetchLocations().then(setLocations), fetchViews().then(setViews)]).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { location.hash = tab === "gallery" ? "" : tab; }, [tab]);

  const visible = useMemo(() => (shots ?? []).filter((s) => filter === "all" || s.state === filter), [shots, filter]);
  const counts = useMemo(() => Object.fromEntries((["all", ...SHOT_STATES] as Filter[]).map((f) => [f, (shots ?? []).filter((s) => f === "all" || s.state === f).length])), [shots]);
  const unreviewed = counts.unreviewed ?? 0;

  const updated = (s: Shot) => { setShots((cur) => (cur ?? []).map((x) => (x.id === s.id ? s : x))); setOpen((cur) => (cur?.id === s.id ? s : cur)); void fetchLocations().then(setLocations).catch(() => {}); };
  const deleted = (id: string) => { setShots((cur) => (cur ?? []).filter((x) => x.id !== id)); setSelected((cur) => { const n = new Set(cur); n.delete(id); return n; }); void fetchLocations().then(setLocations).catch(() => {}); };

  async function deleteSelected() {
    const ids = visible.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} shot${ids.length === 1 ? "" : "s"} permanently? This removes the images and their metadata. Archiving keeps them.`)) return;
    setBulkBusy(true);
    const failed: string[] = [];
    for (const id of ids) {
      try { await deleteShot(id); setShots((cur) => (cur ?? []).filter((x) => x.id !== id)); } catch (e) { failed.push(`${id}: ${(e as Error).message}`); }
    }
    setSelected(new Set());
    setBulkBusy(false);
    void fetchLocations().then(setLocations).catch(() => {});
    if (failed.length) alert(`${failed.length} deletion(s) failed:\n${failed.join("\n")}`);
  }
  const openShot = (s: Shot, list?: Shot[]) => { setOpenList(list ?? visible); setOpen(s); };

  return (
    <div class="app">
      <header>
        <h1><span>▣</span> Fielder</h1>
        <span class="meta">{shots ? `${shots.length} shots · ${presets?.length ?? 0} rigs · ${locations?.length ?? 0} locations` : "loading…"}</span>
        {(tab === "gallery" || tab === "map") && (
          <div class="seg" title="Review state">
            {(["all", ...SHOT_STATES] as Filter[]).map((f) => <button key={f} class={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f} {counts[f] ?? 0}</button>)}
          </div>
        )}
        {(tab === "gallery" || tab === "map" || tab === "views") && <ModeSwitch value={mask} onChange={setMask} />}
        {tab === "gallery" && (
          <div class="seg" title="Layout">
            <button class={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")}>Grid</button>
            <button class={layout === "list" ? "active" : ""} onClick={() => setLayout("list")}>List</button>
          </div>
        )}
        <nav class="tabs">
          {TABS.map((t) => <button key={t} class={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "review" && unreviewed ? `Review (${unreviewed})` : t[0].toUpperCase() + t.slice(1)}</button>)}
          <button onClick={() => { setShots(null); setPresets(null); setLocations(null); void load(); }} title="Reload">↻</button>
        </nav>
      </header>
      <main>
        {error && <div class="status">Could not load: {error}</div>}
        {!error && !shots && <div class="status">Loading…</div>}
        {shots && tab === "gallery" && (
          visible.length === 0 ? <div class="status">{filter === "all" ? "No shots yet. Capture one with the phone app." : `No ${filter} shots.`}</div>
          : layout === "list" ? (
            <div class="list">
              {(() => {
                const selectedVisible = visible.filter((s) => selected.has(s.id)).length;
                const allSelected = selectedVisible === visible.length;
                return (
                  <div class="bulk-bar">
                    <label class="check"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))} /> {allSelected ? "Deselect all" : "Select all"}</label>
                    <span class="meta">{selectedVisible} selected</span>
                    <button class="btn danger" disabled={selectedVisible === 0 || bulkBusy} onClick={() => void deleteSelected()}>{bulkBusy ? "Deleting…" : `Delete selected (${selectedVisible})`}</button>
                    {selectedVisible > 0 && <button class="btn" onClick={() => setSelected(new Set())}>Clear</button>}
                  </div>
                );
              })()}
              <table>
                <thead><tr><th></th><th></th><th>Name</th><th>Location</th><th>Tags</th><th>Rig · lens</th><th>Date</th><th>State</th></tr></thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id} onClick={() => openShot(s)} class={selected.has(s.id) ? "selected" : ""}>
                      <td class="sel" onClick={(e) => { e.stopPropagation(); toggleSelected(s.id); }}><input type="checkbox" checked={selected.has(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelected(s.id)} /></td>
                      <td class="thumb"><Framed shot={s} mode={mask} /></td>
                      <td class="name">{shotTitle(s)}</td>
                      <td>{placeLabel(s) || "—"}</td>
                      <td class="meta">{tagsLabel(s) || "—"}</td>
                      <td class="meta">{rigLabel(s)}</td>
                      <td class="meta">{when(s.timestamp)}</td>
                      <td><Badge shot={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div class="gallery">
              {visible.map((s) => (
                <article class="card" key={s.id} onClick={() => openShot(s)}>
                  <Framed shot={s} mode={mask} />
                  <div class="body">
                    <div class="title">{shotTitle(s)}</div>
                    <div class="sub">{placeLabel(s) || rigLabel(s)}</div>
                    <div class="sub row"><span>{when(s.timestamp)}</span><Badge shot={s} /></div>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
        {shots && tab === "review" && <Review shots={shots} mask={mask} onUpdated={updated} onDeleted={deleted} onOpen={openShot} />}
        {shots && tab === "map" && <MapView shots={visible} onOpen={(s) => openShot(s, visible)} focus={focus} mask={mask} />}
        {shots && tab === "views" && <Views shots={shots} locations={locations ?? []} presets={presets ?? []} views={views} onViews={setViews} mask={mask} onOpen={openShot} />}
        {tab === "rigs" && <Rigs presets={presets} shots={shots ?? []} onChange={setPresets} />}
        {tab === "locations" && <Locations locations={locations} onChange={setLocations} onShotsChanged={() => void fetchAllShots().then(setShots).catch(() => {})} />}
      </main>
      {open && (
        <ShotDetail
          key={open.id}
          shot={open}
          initialMode={mask}
          locations={locations ?? []}
          onLocations={setLocations}
          onUpdated={updated}
          onDeleted={deleted}
          onShowOnMap={(s) => { setTab("map"); setFocus(s); setOpen(null); }}
          onClose={() => setOpen(null)}
          list={openList.map((x) => (shots ?? []).find((y) => y.id === x.id) ?? x)}
          onNavigate={setOpen}
        />
      )}
    </div>
  );
}
