import { useState } from "preact/hooks";
import { extraLabel, label } from "@fielder/vocab";
import { deleteShot, patchShot, type Location, type Shot, type ShotState } from "./api";
import { coords, fovLabel, placeLabel, rigDescription, shotTitle, stateColor, when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";
import { TagsForm } from "./TagsForm";

export function Badge({ shot }: { shot: Shot }) {
  return <span class="badge" style={{ color: stateColor(shot), borderColor: stateColor(shot) }}>{shot.state}</span>;
}

interface Props {
  shot: Shot;
  initialMode: MaskMode;
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
  onShowOnMap: (s: Shot) => void;
  onClose: () => void;
}

export function ShotDetail({ shot, initialMode, locations, onLocations, onUpdated, onDeleted, onShowOnMap, onClose }: Props) {
  const [mode, setMode] = useState<MaskMode>(initialMode);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setState(state: ShotState) {
    setBusy(true);
    try { onUpdated(await patchShot(shot.id, { state })); } catch (e) { alert(`Update failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Delete this shot from ${when(shot.timestamp)}? This removes the image and its metadata permanently. Archiving keeps it.`)) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  return (
    <div class="detail-backdrop" onClick={onClose}>
      <div class="detail" onClick={(e) => e.stopPropagation()}>
        <Framed shot={shot} mode={mode} />
        <div class="side">
          <div class="side-top">
            <div>
              <h2>{shotTitle(shot)} <Badge shot={shot} /></h2>
              <div class="meta">{when(shot.timestamp)}</div>
            </div>
            <ModeSwitch value={mode} onChange={setMode} />
          </div>
          {editing ? (
            <TagsForm
              initial={{ name: shot.name ?? "", light: shot.light ?? "", weather: shot.weather ?? "", int_ext: shot.int_ext ?? "", location_id: shot.location_id ?? "", extra: shot.extra ?? {} }}
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
                    <dt>Location</dt><dd>{placeLabel(shot) || "—"}</dd>
                    <dt>Int/Ext</dt><dd>{label(shot.int_ext) || "—"}</dd>
                    <dt>Light</dt><dd>{label(shot.light) || "—"}</dd>
                    <dt>Weather</dt><dd>{label(shot.weather) || "—"}</dd>
                    <dt>Extra</dt><dd>{extraLabel(shot.extra) || "—"}</dd>
                  </dl>
                </section>
                <section>
                  <h3>Camera</h3>
                  <dl>
                    <dt>Rig</dt><dd>{shot.preset_name ?? "deleted / unsynced"}</dd>
                    <dt>Format</dt><dd>{rigDescription(shot) || "—"}</dd>
                    <dt>Lens</dt><dd>{shot.lens_mm} mm</dd>
                    <dt>FOV</dt><dd>{fovLabel(shot) || "n/a"}</dd>
                    <dt>Position</dt><dd><a href={`https://www.openstreetmap.org/?mlat=${shot.lat}&mlon=${shot.lon}#map=17/${shot.lat}/${shot.lon}`} target="_blank" rel="noreferrer">{coords(shot)}</a></dd>
                  </dl>
                </section>
              </div>
              <div class="btn-row">
                {shot.state !== "approved" && <button class="btn primary" disabled={busy} onClick={() => void setState("approved")}>Approve</button>}
                {shot.state !== "archived" && <button class="btn" disabled={busy} onClick={() => void setState("archived")}>Archive</button>}
                {shot.state !== "unreviewed" && <button class="btn" disabled={busy} onClick={() => void setState("unreviewed")}>Back to review</button>}
                <button class="btn" onClick={() => setEditing(true)}>Edit tags</button>
              </div>
              {shot.extra_metadata && <details><summary class="meta">Raw metadata · {shot.id}</summary><pre>{JSON.stringify(shot.extra_metadata, null, 2)}</pre></details>}
              <div class="btn-row footer">
                <button class="btn" onClick={() => void downloadCrop(shot)} title="Download the photo cropped to the rig frame">Download crop</button>
                <a class="btn" href={shot.image_url} download target="_blank" rel="noreferrer">Original</a>
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
