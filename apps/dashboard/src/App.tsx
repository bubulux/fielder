import { useEffect, useMemo, useState } from "preact/hooks";
import { deleteShot, fetchAllShots, type Shot } from "./api";
import { coords, fovLabel, framingOf, rigLabel, when } from "./format";
import { MapView } from "./MapView";

type Tab = "gallery" | "map";

export function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === "#map" ? "map" : "gallery"));
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [focus, setFocus] = useState<Shot | null>(null);

  const load = () => fetchAllShots().then(setShots).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { location.hash = tab === "map" ? "map" : ""; }, [tab]);

  const rigs = useMemo(() => new Set((shots ?? []).map((s) => s.preset_name ?? (framingOf(s)?.preset_name as string) ?? "?")).size, [shots]);

  async function remove(s: Shot) {
    if (!confirm(`Delete this shot from ${when(s.timestamp)}? This removes the image and its metadata permanently.`)) return;
    try {
      await deleteShot(s.id);
      setShots((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      setOpen(null);
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div class="app">
      <header>
        <h1><span>▣</span> Fielder</h1>
        <span class="meta">{shots ? `${shots.length} shots · ${rigs} rigs` : "loading…"}</span>
        <nav class="tabs">
          <button class={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}>Gallery</button>
          <button class={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Map</button>
          <button onClick={() => { setShots(null); void load(); }} title="Reload">↻</button>
        </nav>
      </header>
      <main>
        {error && <div class="status">Could not load shots: {error}</div>}
        {!error && !shots && <div class="status">Loading…</div>}
        {shots && tab === "gallery" && (
          shots.length === 0 ? <div class="status">No shots yet. Capture one with the phone app.</div> : (
            <div class="gallery">
              {shots.map((s) => (
                <article class="card" key={s.id} onClick={() => setOpen(s)}>
                  <img src={s.image_url} alt="" loading="lazy" />
                  <div class="body">
                    <div class="title">{rigLabel(s)}</div>
                    <div class="sub">{when(s.timestamp)}</div>
                    <div class="sub">{fovLabel(s)}</div>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
        {shots && tab === "map" && <MapView shots={shots} onOpen={setOpen} focus={focus} />}
      </main>
      {open && (
        <div class="detail-backdrop" onClick={() => setOpen(null)}>
          <div class="detail" onClick={(e) => e.stopPropagation()}>
            <img src={open.image_url} alt="" />
            <div class="side">
              <div>
                <div style="font-weight:600;font-size:15px">{rigLabel(open)}</div>
                <div class="meta">{when(open.timestamp)}</div>
              </div>
              <dl>
                <dt>FOV</dt><dd>{fovLabel(open) || "n/a"}</dd>
                <dt>Position</dt><dd><a style="color:var(--accent)" href={`https://www.openstreetmap.org/?mlat=${open.lat}&mlon=${open.lon}#map=17/${open.lat}/${open.lon}`} target="_blank" rel="noreferrer">{coords(open)}</a></dd>
                <dt>Lens</dt><dd>{open.lens_mm} mm</dd>
                <dt>Preset</dt><dd>{open.preset_name ?? "deleted / unsynced"}</dd>
                <dt>ID</dt><dd class="meta">{open.id}</dd>
              </dl>
              {open.extra_metadata && <pre>{JSON.stringify(open.extra_metadata, null, 2)}</pre>}
              <div class="actions">
                <button class="btn" onClick={() => { setTab("map"); setFocus(open); setOpen(null); }}>Show on map</button>
                <button class="btn danger" onClick={() => void remove(open)}>Delete</button>
                <button class="btn" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
