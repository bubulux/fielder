import { useEffect, useMemo, useState } from "preact/hooks";
import { SHOT_STATES } from "@fielder/vocab";
import { fetchAllShots, fetchLocations, fetchPresets, fetchViews, type Location, type Preset, type SavedView, type Shot, type ShotState } from "./api";
import { isFrameMode, placeLabel, rigLabel, shotTitle, when } from "./format";
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
  const setMask = (m: MaskMode) => { setMaskState(m); try { localStorage.setItem("maskMode", m); } catch { /* ignore */ } };

  const load = () => Promise.all([fetchAllShots().then(setShots), fetchPresets().then(setPresets), fetchLocations().then(setLocations), fetchViews().then(setViews)]).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { location.hash = tab === "gallery" ? "" : tab; }, [tab]);

  const visible = useMemo(() => (shots ?? []).filter((s) => filter === "all" || s.state === filter), [shots, filter]);
  const counts = useMemo(() => Object.fromEntries((["all", ...SHOT_STATES] as Filter[]).map((f) => [f, (shots ?? []).filter((s) => f === "all" || s.state === f).length])), [shots]);
  const unreviewed = counts.unreviewed ?? 0;

  const updated = (s: Shot) => { setShots((cur) => (cur ?? []).map((x) => (x.id === s.id ? s : x))); setOpen((cur) => (cur?.id === s.id ? s : cur)); void fetchLocations().then(setLocations).catch(() => {}); };
  const deleted = (id: string) => { setShots((cur) => (cur ?? []).filter((x) => x.id !== id)); void fetchLocations().then(setLocations).catch(() => {}); };
  const openShot = (s: Shot) => setOpen(s);

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
        <nav class="tabs">
          {TABS.map((t) => <button key={t} class={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "review" && unreviewed ? `Review (${unreviewed})` : t[0].toUpperCase() + t.slice(1)}</button>)}
          <button onClick={() => { setShots(null); setPresets(null); setLocations(null); void load(); }} title="Reload">↻</button>
        </nav>
      </header>
      <main>
        {error && <div class="status">Could not load: {error}</div>}
        {!error && !shots && <div class="status">Loading…</div>}
        {shots && tab === "gallery" && (
          visible.length === 0 ? <div class="status">{filter === "all" ? "No shots yet. Capture one with the phone app." : `No ${filter} shots.`}</div> : (
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
        {shots && tab === "map" && <MapView shots={visible} onOpen={openShot} focus={focus} mask={mask} />}
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
        />
      )}
    </div>
  );
}
