import { useEffect, useMemo, useState } from "preact/hooks";
import { deletePreset, deleteShot, fetchAllShots, fetchPresets, type Preset, type Shot } from "./api";
import { coords, fovLabel, framingOf, rigDescription, rigLabel, when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { MapView } from "./MapView";

type Tab = "gallery" | "map" | "rigs";

function loadMask(): MaskMode {
  try { const v = localStorage.getItem("maskMode"); if (v === "mask" || v === "frame" || v === "off") return v; } catch { /* ignore */ }
  return "mask";
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === "#map" ? "map" : location.hash === "#rigs" ? "rigs" : "gallery"));
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [focus, setFocus] = useState<Shot | null>(null);
  const [mask, setMaskState] = useState<MaskMode>(loadMask);
  const setMask = (m: MaskMode) => { setMaskState(m); try { localStorage.setItem("maskMode", m); } catch { /* ignore */ } };

  const load = () => Promise.all([fetchAllShots().then(setShots), fetchPresets().then(setPresets)]).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { location.hash = tab === "gallery" ? "" : tab; }, [tab]);

  const rigCount = useMemo(() => new Set((shots ?? []).map((s) => s.preset_name ?? (framingOf(s)?.preset_name as string) ?? "?")).size, [shots]);

  async function remove(s: Shot) {
    if (!confirm(`Delete this shot from ${when(s.timestamp)}? This removes the image and its metadata permanently.`)) return;
    try {
      await deleteShot(s.id);
      setShots((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      setOpen(null);
    } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }
  async function removePreset(p: Preset) {
    const used = (shots ?? []).filter((s) => s.preset_id === p.id).length;
    if (!confirm(`Delete rig "${p.name}"?${used ? ` ${used} shot(s) reference it; they keep their framing snapshot.` : ""} The phone drops it on next launch.`)) return;
    try {
      await deletePreset(p.id);
      setPresets((cur) => (cur ?? []).filter((x) => x.id !== p.id));
    } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  return (
    <div class="app">
      <header>
        <h1><span>▣</span> Fielder</h1>
        <span class="meta">{shots ? `${shots.length} shots · ${rigCount} rigs` : "loading…"}</span>
        {tab !== "rigs" && (
          <div class="seg" title="How to show the rig frame on photos">
            <button class={mask === "mask" ? "active" : ""} onClick={() => setMask("mask")}>Mask</button>
            <button class={mask === "frame" ? "active" : ""} onClick={() => setMask("frame")}>Frame</button>
            <button class={mask === "off" ? "active" : ""} onClick={() => setMask("off")}>Raw</button>
          </div>
        )}
        <nav class="tabs">
          <button class={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}>Gallery</button>
          <button class={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Map</button>
          <button class={tab === "rigs" ? "active" : ""} onClick={() => setTab("rigs")}>Rigs</button>
          <button onClick={() => { setShots(null); setPresets(null); void load(); }} title="Reload">↻</button>
        </nav>
      </header>
      <main>
        {error && <div class="status">Could not load: {error}</div>}
        {!error && !shots && <div class="status">Loading…</div>}
        {shots && tab === "gallery" && (
          shots.length === 0 ? <div class="status">No shots yet. Capture one with the phone app.</div> : (
            <div class="gallery">
              {shots.map((s) => (
                <article class="card" key={s.id} onClick={() => setOpen(s)}>
                  <Framed shot={s} mode={mask} />
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
        {shots && tab === "map" && <MapView shots={shots} onOpen={setOpen} focus={focus} mask={mask} />}
        {tab === "rigs" && (
          <div class="rigs">
            {!presets ? <div class="status">Loading…</div> : presets.length === 0 ? <div class="status">No rigs saved yet. Create one in the phone app.</div> : (
              <table>
                <thead><tr><th>Name</th><th>Camera / format</th><th>Sensor area</th><th>Speedbooster</th><th>Shots</th><th></th></tr></thead>
                <tbody>
                  {presets.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td class="meta">{p.camera_id && p.format_id ? `${p.camera_id} / ${p.format_id}` : "custom"}</td>
                      <td>{p.sensor_width_mm} × {p.sensor_height_mm} mm</td>
                      <td>{p.speedbooster_factor === 1 ? "none" : `×${p.speedbooster_factor}`}</td>
                      <td>{(shots ?? []).filter((s) => s.preset_id === p.id).length}</td>
                      <td><button class="btn danger" onClick={() => void removePreset(p)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p class="meta" style="margin-top:12px">Rigs are created and edited on the phone; the server copy is the source of truth and the phone pulls it on every launch.</p>
          </div>
        )}
      </main>
      {open && (
        <div class="detail-backdrop" onClick={() => setOpen(null)}>
          <div class="detail" onClick={(e) => e.stopPropagation()}>
            <Framed shot={open} mode={mask} />
            <div class="side">
              <div>
                <div style="font-weight:600;font-size:15px">{rigLabel(open)}</div>
                <div class="meta">{when(open.timestamp)}</div>
                <div class="meta">{rigDescription(open)}</div>
              </div>
              <dl>
                <dt>FOV</dt><dd>{fovLabel(open) || "n/a"}</dd>
                <dt>Position</dt><dd><a style="color:var(--accent)" href={`https://www.openstreetmap.org/?mlat=${open.lat}&mlon=${open.lon}#map=17/${open.lat}/${open.lon}`} target="_blank" rel="noreferrer">{coords(open)}</a></dd>
                <dt>Lens</dt><dd>{open.lens_mm} mm</dd>
                <dt>Rig</dt><dd>{open.preset_name ?? "deleted / unsynced"}</dd>
                <dt>ID</dt><dd class="meta">{open.id}</dd>
              </dl>
              {open.extra_metadata && <pre>{JSON.stringify(open.extra_metadata, null, 2)}</pre>}
              <div class="actions">
                <button class="btn" onClick={() => void downloadCrop(open)} title="Download the photo cropped to the rig frame">Download crop</button>
                <a class="btn" href={open.image_url} download target="_blank" rel="noreferrer" style="text-decoration:none">Original</a>
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
