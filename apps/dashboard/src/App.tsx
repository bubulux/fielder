import { useEffect, useMemo, useState } from "preact/hooks";
import { SHOT_STATES } from "@fielder/vocab";
import { deleteShot, fetchAllShots, fetchLocations, fetchPresets, fetchProjects, fetchViews, type Location, type Preset, type Project, type SavedView, type Shot, type ShotState } from "./api";
import { cover, isFrameMode, photoCountLabel, placeLabel, rigLabel, shotTitle, tagsLabel, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { Locations } from "./Locations";
import { MapView } from "./MapView";
import { ModeSwitch } from "./ModeSwitch";
import { ALL_PROJECTS, Projects, type ActiveProject } from "./Projects";
import { Review } from "./Review";
import { Rigs } from "./Rigs";
import { Badge, ShotDetail } from "./ShotDetail";
import { Views } from "./Views";

type Tab = "gallery" | "review" | "map" | "views" | "projects" | "rigs" | "locations";
const TABS: Tab[] = ["gallery", "review", "map", "views", "projects", "rigs", "locations"];
type Filter = ShotState | "all";
type Layout = "grid" | "list";

function readStorage(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
const loadLayout = (): Layout => (readStorage("layout") === "list" ? "list" : "grid");
function loadMask(): MaskMode { const v = readStorage("maskMode"); return isFrameMode(v) ? v : "mask"; }
const tabFromHash = (): Tab => (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : "gallery";

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [focus, setFocus] = useState<Shot | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mask, setMaskState] = useState<MaskMode>(loadMask);
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  /** Remembered across reloads until changed; null until one is chosen (the project page is shown instead). */
  const [storedProject, setStoredProject] = useState<ActiveProject | null>(() => readStorage("project"));
  const setLayout = (l: Layout) => { setLayoutState(l); writeStorage("layout", l); };
  const setMask = (m: MaskMode) => { setMaskState(m); writeStorage("maskMode", m); };
  const activate = (p: ActiveProject) => { setStoredProject(p); writeStorage("project", p); setSelected(new Set()); };
  /** The list the open shot belongs to, for prev/next in the dialog. */
  const [openList, setOpenList] = useState<Shot[]>([]);
  /** Row selection in the list layout (shot ids). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelected = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const refreshCounts = () => { void fetchLocations().then(setLocations).catch(() => {}); void fetchProjects().then(setProjects).catch(() => {}); };
  const load = () => Promise.all([fetchAllShots().then(setShots), fetchProjects().then(setProjects), fetchPresets().then(setPresets), fetchLocations().then(setLocations), fetchViews().then(setViews)]).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { location.hash = tab === "gallery" ? "" : tab; }, [tab]);

  // A remembered project that no longer exists counts as "not chosen".
  const active: ActiveProject | null = storedProject === ALL_PROJECTS || (storedProject && projects?.some((p) => p.id === storedProject)) ? storedProject : null;
  const activeName = active === ALL_PROJECTS ? "All projects" : projects?.find((p) => p.id === active)?.name ?? "";
  const projectShots = useMemo(() => (shots ?? []).filter((s) => active === ALL_PROJECTS || s.project_id === active), [shots, active]);
  const visible = useMemo(() => projectShots.filter((s) => filter === "all" || s.state === filter), [projectShots, filter]);
  const counts = useMemo(() => Object.fromEntries((["all", ...SHOT_STATES] as Filter[]).map((f) => [f, projectShots.filter((s) => f === "all" || s.state === f).length])), [projectShots]);
  const unreviewed = counts.unreviewed ?? 0;
  const showProjectColumn = active === ALL_PROJECTS;

  const updated = (s: Shot) => { setShots((cur) => (cur ?? []).map((x) => (x.id === s.id ? s : x))); setOpen((cur) => (cur?.id === s.id ? s : cur)); refreshCounts(); };
  const deleted = (id: string) => { setShots((cur) => (cur ?? []).filter((x) => x.id !== id)); setSelected((cur) => { const n = new Set(cur); n.delete(id); return n; }); refreshCounts(); };

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
    refreshCounts();
    if (failed.length) alert(`${failed.length} deletion(s) failed:\n${failed.join("\n")}`);
  }
  const openShot = (s: Shot, list?: Shot[]) => { setOpenList(list ?? visible); setOpen(s); };
  const loaded = !!shots && !!projects;

  return (
    <div class="app">
      <header>
        <h1><span>▣</span> Fielder</h1>
        {loaded && active && (
          <select class="project-switch" value={active} title="Active project" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v === "__manage__") setTab("projects"); else activate(v); }}>
            {projects!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={ALL_PROJECTS}>All projects</option>
            <option value="__manage__">Manage projects…</option>
          </select>
        )}
        <span class="meta">{loaded ? `${projectShots.length} shots · ${presets?.length ?? 0} rigs · ${locations?.length ?? 0} locations` : "loading…"}</span>
        {active && (tab === "gallery" || tab === "map") && (
          <div class="seg" title="Review state">
            {(["all", ...SHOT_STATES] as Filter[]).map((f) => <button key={f} class={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f} {counts[f] ?? 0}</button>)}
          </div>
        )}
        {active && (tab === "gallery" || tab === "map" || tab === "views") && <ModeSwitch value={mask} onChange={setMask} />}
        {active && tab === "gallery" && (
          <div class="seg" title="Layout">
            <button class={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")}>Grid</button>
            <button class={layout === "list" ? "active" : ""} onClick={() => setLayout("list")}>List</button>
          </div>
        )}
        {active && (
          <nav class="tabs">
            {TABS.map((t) => <button key={t} class={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "review" && unreviewed ? `Review (${unreviewed})` : t[0].toUpperCase() + t.slice(1)}</button>)}
            <button onClick={() => { setShots(null); setProjects(null); setPresets(null); setLocations(null); void load(); }} title="Reload">↻</button>
          </nav>
        )}
      </header>
      <main>
        {error && <div class="status">Could not load: {error}</div>}
        {!error && !loaded && <div class="status">Loading…</div>}
        {loaded && !active && <Projects gate projects={projects} onChange={setProjects} active={null} onActivate={activate} />}
        {loaded && active && tab === "gallery" && (
          visible.length === 0 ? <div class="status">{filter === "all" ? `No shots in ${activeName} yet. Capture one with the phone app.` : `No ${filter} shots.`}</div>
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
                <thead><tr><th></th><th></th><th>Name</th>{showProjectColumn && <th>Project</th>}<th>Location</th><th>Tags</th><th>Rig · lens</th><th>Date</th><th>State</th></tr></thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id} onClick={() => openShot(s)} class={selected.has(s.id) ? "selected" : ""}>
                      <td class="sel" onClick={(e) => { e.stopPropagation(); toggleSelected(s.id); }}><input type="checkbox" checked={selected.has(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelected(s.id)} /></td>
                      <td class="thumb"><Framed photo={cover(s)} mode={mask} /></td>
                      <td class="name">{shotTitle(s)}{photoCountLabel(s) && <div class="meta">{photoCountLabel(s)}</div>}</td>
                      {showProjectColumn && <td>{s.project_name}</td>}
                      <td>{placeLabel(s) || "—"}</td>
                      <td class="meta">{tagsLabel(s) || "—"}</td>
                      <td class="meta">{rigLabel(cover(s))}</td>
                      <td class="meta">{when(s.captured_at)}</td>
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
                  <div class="card-img">
                    <Framed photo={cover(s)} mode={mask} />
                    {s.photos.length > 1 && <span class="count-badge" title={photoCountLabel(s)}>▤ {s.photos.length}</span>}
                  </div>
                  <div class="body">
                    <div class="title">{shotTitle(s)}</div>
                    <div class="sub">{[showProjectColumn ? s.project_name : null, placeLabel(s) || rigLabel(cover(s))].filter(Boolean).join(" · ")}</div>
                    <div class="sub row"><span>{when(s.captured_at)}</span><Badge shot={s} /></div>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
        {loaded && active && tab === "review" && <Review shots={projectShots} mask={mask} onUpdated={updated} onDeleted={deleted} onOpen={openShot} />}
        {loaded && active && tab === "map" && <MapView shots={visible} onOpen={(s) => openShot(s, visible)} focus={focus} mask={mask} />}
        {loaded && active && tab === "views" && <Views shots={projectShots} projects={projects} locations={locations ?? []} presets={presets ?? []} views={views} onViews={setViews} mask={mask} onOpen={openShot} />}
        {loaded && active && tab === "projects" && <Projects projects={projects} onChange={setProjects} active={active} onActivate={(p) => { activate(p); setTab("gallery"); }} />}
        {loaded && active && tab === "rigs" && <Rigs presets={presets} shots={shots ?? []} onChange={setPresets} />}
        {loaded && active && tab === "locations" && <Locations locations={locations} onChange={setLocations} onShotsChanged={() => void fetchAllShots().then(setShots).catch(() => {})} />}
      </main>
      {open && (
        <ShotDetail
          key={open.id}
          shot={open}
          initialMode={mask}
          projects={projects ?? []}
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
