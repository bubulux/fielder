import { useEffect, useMemo, useState } from "preact/hooks";
import { SHOT_STATES, type FieldDef } from "@fielder/vocab";
import { deleteShot, fetchAllShots, fetchFields, fetchLocations, fetchPresets, fetchProjects, fetchViews, type FieldDefinition, type Location, type Preset, type Project, type SavedView, type Shot, type ShotState } from "./api";
import { cover, isFrameMode, photoCountLabel, placeLabel, rigLabel, shotTitle, tagsLabel, when } from "./format";
import { Fields } from "./Fields";
import { Framed, type MaskMode } from "./Framed";
import { Locations } from "./Locations";
import { MapView } from "./MapView";
import { ModeSwitch } from "./ModeSwitch";
import { ALL_PROJECTS, Projects, type ActiveProject } from "./Projects";
import { Review } from "./Review";
import { Rigs } from "./Rigs";
import { Schedule } from "./Schedule";
import { ShotCard } from "./ShotCard";
import { ShotDetail } from "./ShotDetail";
import { useTheme, type ThemeChoice } from "./theme";
import { Chip, Empty, Icon, Loading, Seg, StateMarker } from "./ui";
import { Views } from "./Views";

type Tab = "gallery" | "review" | "map" | "schedule" | "views" | "projects" | "fields" | "rigs" | "locations";
/** Work tabs first, then the library/settings pages, split by a divider in the header. */
const WORK_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "gallery", label: "Gallery", icon: "view-grid-outline" },
  { id: "review", label: "Review", icon: "checkbox-marked-outline" },
  { id: "map", label: "Map", icon: "map-outline" },
  { id: "schedule", label: "Schedule", icon: "calendar-clock" },
  { id: "views", label: "Views", icon: "filter-variant" },
];
const LIBRARY_TABS: { id: Tab; label: string }[] = [
  { id: "projects", label: "Projects" }, { id: "fields", label: "Fields" }, { id: "rigs", label: "Rigs" }, { id: "locations", label: "Locations" },
];
const TABS: Tab[] = [...WORK_TABS, ...LIBRARY_TABS].map((t) => t.id);
const THEMES: { id: ThemeChoice; icon: string; title: string }[] = [
  { id: "auto", icon: "theme-light-dark", title: "Follow the system" },
  { id: "sun", icon: "white-balance-sunny", title: "Sun: light, for daylight" },
  { id: "set", icon: "weather-night", title: "Set: dark" },
];
type Filter = ShotState | "all";
type Layout = "grid" | "list";

function readStorage(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
const loadLayout = (): Layout => (readStorage("layout") === "list" ? "list" : "grid");
function loadMask(): MaskMode { const v = readStorage("maskMode"); return isFrameMode(v) ? v : "mask"; }
const tabFromHash = (): Tab => (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : "gallery";

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [theme, setTheme] = useTheme();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [fields, setFields] = useState<FieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [focus, setFocus] = useState<Shot | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mask, setMaskState] = useState<MaskMode>(loadMask);
  /** The dialog starts from the global mode; a change there sticks for prev/next until it closes. */
  const [dialogMode, setDialogMode] = useState<MaskMode>(mask);
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
  const load = () => Promise.all([fetchAllShots().then(setShots), fetchProjects().then(setProjects), fetchPresets().then(setPresets), fetchLocations().then(setLocations), fetchViews().then(setViews), fetchFields().then(setFields)]).catch((e: Error) => setError(e.message));
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
  /** Extra-field definitions a project uses, in its order. */
  const fieldsOf = (projectId: string): FieldDef[] => {
    const ids = projects?.find((p) => p.id === projectId)?.field_ids ?? [];
    return ids.map((id) => fields?.find((f) => f.id === id)?.definition).filter((d): d is FieldDef => !!d);
  };
  /** For filters: the active project's fields, or every definition when browsing all projects. */
  const filterDefs = useMemo(() => (active === ALL_PROJECTS ? (fields ?? []).map((f) => f.definition) : active ? fieldsOf(active) : []), [active, fields, projects]);

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
  const openShot = (s: Shot, list?: Shot[]) => { setOpenList(list ?? visible); setDialogMode(mask); setOpen(s); };
  const loaded = !!shots && !!projects;

  return (
    <div class="app">
      <header class="app-header">
        <span class="brand"><Icon name="camera-iris" />Fielder</span>
        {loaded && active && (
          <select class="project-switch" value={active} title="Active project" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v === "__manage__") setTab("projects"); else activate(v); }}>
            {projects!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={ALL_PROJECTS}>All projects</option>
            <option value="__manage__">Manage projects…</option>
          </select>
        )}
        {active && (
          <>
            <nav class="f-tabs" role="tablist" aria-label="Work">
              {WORK_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" class="f-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} />{t.label}{t.id === "review" && unreviewed > 0 && <span class="f-tab__count" title={`${unreviewed} to review`}>{unreviewed}</span>}
                </button>
              ))}
            </nav>
            <span class="tab-divider" />
            <nav class="f-tabs" role="tablist" aria-label="Library">
              {LIBRARY_TABS.map((t) => <button key={t.id} type="button" role="tab" class="f-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
            </nav>
          </>
        )}
        <span class="grow" />
        <Seg label="Theme" options={THEMES} value={theme} onChange={setTheme} />
        <button type="button" class="f-btn f-btn--ghost f-btn--icon" title="Reload" aria-label="Reload" onClick={() => { setShots(null); setProjects(null); setPresets(null); setLocations(null); void load(); }}><Icon name="refresh" /></button>
      </header>
      <div class="toolbar">
        {active && (tab === "gallery" || tab === "map") && (
          <div class="f-chips" role="group" aria-label="Review state">
            {(["all", ...SHOT_STATES] as Filter[]).map((f) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} <span class="num">{counts[f] ?? 0}</span></Chip>)}
          </div>
        )}
        {active && (tab === "gallery" || tab === "review" || tab === "map" || tab === "views") && <ModeSwitch value={mask} onChange={setMask} />}
        {active && tab === "gallery" && <Seg label="Layout" value={layout} onChange={setLayout} options={[{ id: "grid", icon: "view-grid-outline", label: "Grid" }, { id: "list", icon: "view-list-outline", label: "List" }]} />}
        {active && (tab === "gallery" || tab === "map") && <><span class="grow" /><span class="meta num">{loaded ? `${projectShots.length} shots · ${presets?.length ?? 0} rigs · ${locations?.length ?? 0} locations` : ""}</span></>}
      </div>
      <main>
        {error && <Empty icon="cloud-alert" title="Could not load">{error}</Empty>}
        {!error && !loaded && <Loading />}
        {loaded && !active && <Projects gate projects={projects} onChange={setProjects} fields={fields ?? []} active={null} onActivate={activate} />}
        {loaded && active && tab === "gallery" && (
          visible.length === 0 ? <Empty icon="camera-iris" title={filter === "all" ? `No shots in ${activeName} yet` : `No ${filter} shots`}>{filter === "all" ? "Capture one with the phone app." : null}</Empty>
          : layout === "list" ? (
            <div class="list">
              {(() => {
                const selectedVisible = visible.filter((s) => selected.has(s.id)).length;
                const allSelected = selectedVisible === visible.length;
                return (
                  <div class="bulk-bar">
                    <label class="check"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))} /> {allSelected ? "Deselect all" : "Select all"}</label>
                    <span class="meta num">{selectedVisible} selected</span>
                    <button class="f-btn f-btn--danger f-btn--sm" disabled={selectedVisible === 0 || bulkBusy} onClick={() => void deleteSelected()}><Icon name="delete-outline" />{bulkBusy ? "Deleting…" : `Delete selected (${selectedVisible})`}</button>
                    {selectedVisible > 0 && <button class="f-btn f-btn--ghost f-btn--sm" onClick={() => setSelected(new Set())}>Clear</button>}
                  </div>
                );
              })()}
              <table class="table">
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
                      <td class="meta num">{when(s.captured_at)}</td>
                      <td><StateMarker state={s.state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div class="gallery">
              {visible.map((s) => <ShotCard key={s.id} shot={s} mask={mask} project={showProjectColumn ? s.project_name : null} onClick={() => openShot(s)} />)}
            </div>
          )
        )}
        {loaded && active && tab === "review" && <Review shots={projectShots} mask={mask} projects={projects} fieldsOf={fieldsOf} locations={locations ?? []} onLocations={setLocations} onUpdated={updated} onDeleted={deleted} />}
        {loaded && active && tab === "map" && <MapView shots={visible} onOpen={(s) => openShot(s, visible)} focus={focus} mask={mask} />}
        {loaded && active && tab === "schedule" && (active === ALL_PROJECTS
          ? <Empty icon="calendar-clock" title="Pick a project">Shooting days belong to a project: pick one in the header to plan its days.</Empty>
          : <Schedule projectId={active} shots={projectShots} mask={mask} onOpen={openShot} />)}
        {loaded && active && tab === "views" && <Views shots={projectShots} projects={projects} fieldDefs={filterDefs} locations={locations ?? []} presets={presets ?? []} views={views} onViews={setViews} mask={mask} onOpen={openShot} />}
        {loaded && active && tab === "projects" && <Projects projects={projects} onChange={setProjects} fields={fields ?? []} active={active} onActivate={(p) => { activate(p); setTab("gallery"); }} />}
        {loaded && active && tab === "fields" && <Fields fields={fields} onChange={setFields} projects={projects ?? []} />}
        {loaded && active && tab === "rigs" && <Rigs presets={presets} shots={shots ?? []} onChange={setPresets} />}
        {loaded && active && tab === "locations" && <Locations locations={locations} onChange={setLocations} onShotsChanged={() => void fetchAllShots().then(setShots).catch(() => {})} />}
      </main>
      {open && (
        <ShotDetail
          key={open.id}
          shot={open}
          mode={dialogMode}
          onMode={setDialogMode}
          projects={projects ?? []}
          presets={presets ?? []}
          fields={fieldsOf(open.project_id)}
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
