import { useState } from "preact/hooks";
import { CAMERAS, CUSTOM_CAMERA_ID, findFormat, SPEEDBOOSTER_PRESETS } from "@fielder/fov-math";
import { deletePreset, putPreset, type Preset, type Shot } from "./api";
import { Chip, ErrorLine, Icon, Loading } from "./ui";

interface Props { presets: Preset[] | null; shots: Shot[]; onChange: (p: Preset[]) => void }

interface Draft { id: string; name: string; cameraId: string; formatId: string | null; w: string; h: string; sb: string; lmin: string; lmax: string; isNew: boolean }
/** Shots with at least one photo taken on the rig. */
const usedBy = (shots: Shot[], presetId: string) => shots.filter((s) => s.photos.some((p) => p.preset_id === presetId)).length;
const num = (s: string) => { const v = Number(String(s).replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };

function autoName(d: Draft): string {
  const cam = CAMERAS.find((c) => c.id === d.cameraId);
  const f = findFormat(d.cameraId, d.formatId);
  const base = cam && f ? `${cam.name.replace("Blackmagic ", "")} ${f.name.split(" ")[0]}` : "Custom";
  const sb = num(d.sb);
  return sb && sb !== 1 ? `${base} + ×${sb}` : base;
}

/** Rigs table plus a create/edit form mirroring the phone's rig editor. */
export function Rigs({ presets, shots, onChange }: Props) {
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patch = (x: Partial<Draft>) => setD((cur) => (cur ? { ...cur, ...x } : cur));

  const startNew = () => { const f = CAMERAS[0].formats[0]; setD({ id: crypto.randomUUID(), name: "", cameraId: CAMERAS[0].id, formatId: f.id, w: String(f.widthMm), h: String(f.heightMm), sb: "1", lmin: "", lmax: "", isNew: true }); };
  const startEdit = (p: Preset) => setD({
    id: p.id, name: p.name, isNew: false,
    cameraId: p.camera_id && findFormat(p.camera_id, p.format_id) ? p.camera_id : CUSTOM_CAMERA_ID,
    formatId: p.format_id, w: String(p.sensor_width_mm), h: String(p.sensor_height_mm), sb: String(p.speedbooster_factor),
    lmin: p.lens_min_mm == null ? "" : String(p.lens_min_mm), lmax: p.lens_max_mm == null ? "" : String(p.lens_max_mm),
  });
  const pickCamera = (cameraId: string) => {
    if (cameraId === CUSTOM_CAMERA_ID) { patch({ cameraId, formatId: null }); return; }
    const f = CAMERAS.find((c) => c.id === cameraId)?.formats[0];
    patch({ cameraId, formatId: f?.id ?? null, w: f ? String(f.widthMm) : "", h: f ? String(f.heightMm) : "" });
  };
  const pickFormat = (formatId: string) => { if (!d) return; const f = findFormat(d.cameraId, formatId); if (f) patch({ formatId, w: String(f.widthMm), h: String(f.heightMm) }); };

  async function save(e: Event) {
    e.preventDefault();
    if (!d) return;
    const w = num(d.w), h = num(d.h), sb = num(d.sb);
    if (!w || !h || !sb) { setError("Sensor width/height and speedbooster factor are required."); return; }
    const lmin = d.lmin.trim() ? num(d.lmin) : null, lmax = d.lmax.trim() ? num(d.lmax) : null;
    if ((lmin === null) !== (lmax === null)) { setError("Enter both ends of the lens range, or neither."); return; }
    if (lmin !== null && lmax !== null && lmin >= lmax) { setError("Lens range: min must be smaller than max."); return; }
    const custom = d.cameraId === CUSTOM_CAMERA_ID;
    try {
      const saved = await putPreset({ id: d.id, name: d.name.trim() || autoName(d), camera_id: custom ? null : d.cameraId, format_id: custom ? null : d.formatId, sensor_width_mm: w, sensor_height_mm: h, speedbooster_factor: sb, lens_min_mm: lmin, lens_max_mm: lmax });
      const rest = (presets ?? []).filter((p) => p.id !== saved.id);
      onChange([...rest, saved].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      setD(null); setError(null);
    } catch (err) { setError((err as Error).message); }
  }
  async function remove(p: Preset) {
    const used = usedBy(shots, p.id);
    if (!confirm(`Delete rig "${p.name}"?${used ? ` ${used} shot(s) reference it; they keep their framing snapshot.` : ""} The phone drops it on next launch.`)) return;
    try { await deletePreset(p.id); onChange((presets ?? []).filter((x) => x.id !== p.id)); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  const cam = d ? CAMERAS.find((c) => c.id === d.cameraId) : undefined;
  return (
    <div class="page">
      {!presets ? <Loading /> : (
        <table class="table">
          <thead><tr><th>Name</th><th>Camera / format</th><th>Sensor area</th><th>Speedbooster</th><th>Lens range</th><th>Shots</th><th></th></tr></thead>
          <tbody>
            {presets.map((p) => (
              <tr key={p.id}>
                <td class="name">{p.name}</td>
                <td class="meta">{p.camera_id && p.format_id ? `${p.camera_id} / ${p.format_id}` : "custom"}</td>
                <td>{p.sensor_width_mm} × {p.sensor_height_mm} mm</td>
                <td>{p.speedbooster_factor === 1 ? "none" : `×${p.speedbooster_factor}`}</td>
                <td>{p.lens_min_mm != null && p.lens_max_mm != null ? `${p.lens_min_mm}–${p.lens_max_mm} mm` : "any"}</td>
                <td>{usedBy(shots, p.id)}</td>
                <td class="actions"><button class="f-btn f-btn--secondary f-btn--sm" onClick={() => startEdit(p)}>Edit</button><button class="f-btn f-btn--danger f-btn--sm" onClick={() => void remove(p)}>Delete</button></td>
              </tr>
            ))}
            {presets.length === 0 && <tr><td colSpan={7} class="meta">No rigs yet.</td></tr>}
          </tbody>
        </table>
      )}
      {!d ? <p><button class="f-btn" onClick={startNew}><Icon name="plus" />New rig</button></p> : (
        <form class="rig-form" onSubmit={save}>
          <h3>{d.isNew ? "New rig" : "Edit rig"}</h3>
          <label>Camera body
            <div class="f-chips">
              {CAMERAS.map((c) => <Chip key={c.id} selected={d.cameraId === c.id} onClick={() => pickCamera(c.id)}>{c.name}</Chip>)}
              <Chip selected={d.cameraId === CUSTOM_CAMERA_ID} onClick={() => pickCamera(CUSTOM_CAMERA_ID)}>Custom sensor</Chip>
            </div>
          </label>
          {cam ? (
            <label>Recording format (active sensor area)
              <div class="f-chips">{cam.formats.map((f) => <Chip key={f.id} selected={d.formatId === f.id} onClick={() => pickFormat(f.id)}>{f.name}</Chip>)}</div>
              <span class="meta">{d.w} × {d.h} mm{findFormat(d.cameraId, d.formatId)?.windowed ? " · windowed crop of the sensor" : ""}</span>
            </label>
          ) : (
            <div class="row2">
              <label>Sensor width (mm)<input value={d.w} onInput={(e) => patch({ w: (e.target as HTMLInputElement).value })} /></label>
              <label>Sensor height (mm)<input value={d.h} onInput={(e) => patch({ h: (e.target as HTMLInputElement).value })} /></label>
            </div>
          )}
          <label>Speedbooster / focal reducer
            <div class="f-chips">{SPEEDBOOSTER_PRESETS.map((f) => <Chip key={f} selected={num(d.sb) === f} onClick={() => patch({ sb: String(f) })}>{f === 1 ? "none" : `×${f}`}</Chip>)}</div>
            <input value={d.sb} onInput={(e) => patch({ sb: (e.target as HTMLInputElement).value })} placeholder="custom factor, e.g. 0.71" />
          </label>
          <div class="row2">
            <label>Lens range min (mm, optional)<input value={d.lmin} onInput={(e) => patch({ lmin: (e.target as HTMLInputElement).value })} placeholder="e.g. 18" /></label>
            <label>Lens range max (mm)<input value={d.lmax} onInput={(e) => patch({ lmax: (e.target as HTMLInputElement).value })} placeholder="e.g. 35" /></label>
          </div>
          <label>Name (optional)<input value={d.name} onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} placeholder={autoName(d)} /></label>
          {error && <ErrorLine>{error}</ErrorLine>}
          <div class="form-actions">
            <button type="submit" class="f-btn">Save rig</button>
            <button type="button" class="f-btn f-btn--secondary" onClick={() => { setD(null); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}
      <p class="meta">The server copy is the source of truth; the phone pulls it on every launch.</p>
    </div>
  );
}
