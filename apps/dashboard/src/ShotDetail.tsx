import { useEffect, useState } from "preact/hooks";
import { extraLabel, label, lightLabel } from "@fielder/vocab";
import { deleteShot, patchShot, type Location, type Project, type Shot, type ShotState } from "./api";
import { coords, cover, fovLabel, photoCountLabel, placeLabel, rigDescription, shotTitle, stateColor, when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";
import { TagsForm } from "./TagsForm";

export function Badge({ shot }: { shot: Shot }) {
  return <span class="badge" style={{ color: stateColor(shot), borderColor: stateColor(shot) }}>{shot.state}</span>;
}

interface Props {
  shot: Shot;
  initialMode: MaskMode;
  projects: Project[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
  onShowOnMap: (s: Shot) => void;
  onClose: () => void;
  /** The list the shot was opened from, for prev/next. */
  list: Shot[];
  onNavigate: (s: Shot) => void;
}

export function ShotDetail({ shot, initialMode, projects, locations, onLocations, onUpdated, onDeleted, onShowOnMap, onClose, list, onNavigate }: Props) {
  const [mode, setMode] = useState<MaskMode>(initialMode);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const photo = cover(shot);
  const index = list.findIndex((s) => s.id === shot.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); onNavigate(prev); }
      else if (e.key === "ArrowRight" && next) { e.preventDefault(); onNavigate(next); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onNavigate, onClose]);

  async function setState(state: ShotState) {
    setBusy(true);
    try { onUpdated(await patchShot(shot.id, { state })); } catch (e) { alert(`Update failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function moveTo(projectId: string) {
    setBusy(true);
    try { onUpdated(await patchShot(shot.id, { project_id: projectId })); } catch (e) { alert(`Move failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Delete this shot from ${when(shot.captured_at)}? This removes ${shot.photos.length > 1 ? `all ${shot.photos.length} images` : "the image"} and the metadata permanently. Archiving keeps it.`)) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  return (
    <div class="detail-backdrop" onClick={onClose}>
      <div class="detail" onClick={(e) => e.stopPropagation()}>
        <div class="stage">
          <Framed photo={photo} mode={mode} maxHeight="88vh" />
          <button class="nav left" title="Previous (←)" disabled={!prev} onClick={() => prev && onNavigate(prev)}>‹</button>
          <button class="nav right" title="Next (→)" disabled={!next} onClick={() => next && onNavigate(next)}>›</button>
          {index >= 0 && list.length > 1 && <span class="counter">{index + 1} / {list.length}</span>}
        </div>
        <div class="side">
          <div class="side-top">
            <div>
              <h2>{shotTitle(shot)} <Badge shot={shot} /></h2>
              <div class="meta">{[when(shot.captured_at), photoCountLabel(shot)].filter(Boolean).join(" · ")}</div>
            </div>
            <ModeSwitch value={mode} onChange={setMode} />
          </div>
          {editing ? (
            <TagsForm
              initial={{ name: shot.name ?? "", light: shot.light, artificial: shot.artificial, weather: shot.weather ?? "", int_ext: shot.int_ext ?? "", location_id: shot.location_id ?? "", extra: shot.extra }}
              locations={locations}
              onLocations={onLocations}
              submitLabel="Save"
              onSubmit={async (tags) => { onUpdated(await patchShot(shot.id, tags)); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div class="facts">
                <section>
                  <h3>Scouting</h3>
                  <dl>
                    <dt>Project</dt><dd>
                      <select class="inline-select" value={shot.project_id} disabled={busy} onChange={(e) => void moveTo((e.target as HTMLSelectElement).value)}>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </dd>
                    <dt>Location</dt><dd>{placeLabel(shot) || "—"}</dd>
                    <dt>Int/Ext</dt><dd>{label(shot.int_ext) || "—"}</dd>
                    <dt>Light</dt><dd>{lightLabel(shot.light, shot.artificial) || "—"}</dd>
                    <dt>Weather</dt><dd>{label(shot.weather) || "—"}</dd>
                    <dt>Extra</dt><dd>{extraLabel(shot.extra) || "—"}</dd>
                  </dl>
                </section>
                <section>
                  <h3>Camera</h3>
                  <dl>
                    <dt>Rig</dt><dd>{photo.preset_name ?? "deleted / unsynced"}</dd>
                    <dt>Format</dt><dd>{rigDescription(photo) || "—"}</dd>
                    <dt>Lens</dt><dd>{photo.lens_mm} mm</dd>
                    <dt>FOV</dt><dd>{fovLabel(photo) || "n/a"}</dd>
                    <dt>Position</dt><dd><a href={`https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lon}#map=17/${photo.lat}/${photo.lon}`} target="_blank" rel="noreferrer">{coords(photo)}</a>{photo.gps_accuracy_m != null && <span class="meta"> ±{Math.round(photo.gps_accuracy_m)} m</span>}</dd>
                  </dl>
                </section>
              </div>
              <div class="btn-row">
                {shot.state !== "approved" && <button class="btn primary" disabled={busy} onClick={() => void setState("approved")}>Approve</button>}
                {shot.state !== "archived" && <button class="btn" disabled={busy} onClick={() => void setState("archived")}>Archive</button>}
                {shot.state !== "unreviewed" && <button class="btn" disabled={busy} onClick={() => void setState("unreviewed")}>Back to review</button>}
                <button class="btn" onClick={() => setEditing(true)}>Edit tags</button>
              </div>
              <details><summary class="meta">Raw metadata · {shot.id}</summary><pre>{JSON.stringify({ framing: photo.framing, device: photo.device }, null, 2)}</pre></details>
              <div class="btn-row footer">
                <button class="btn" onClick={() => void downloadCrop(photo)} title="Download the photo cropped to the rig frame">Download crop</button>
                <a class="btn" href={photo.image_url} download target="_blank" rel="noreferrer">Original</a>
                <button class="btn" onClick={() => onShowOnMap(shot)}>Show on map</button>
                <span style="flex:1" />
                <button class="btn danger" onClick={() => void remove()}>Delete</button>
                <button class="btn" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
