import { useEffect, useState } from "preact/hooks";
import { extraSummary, label, lightLabel, type FieldDef } from "@fielder/vocab";
import { patchShot, type Location, type Photo, type Project, type Shot, type ShotState } from "./api";
import { Combobox } from "./Combobox";
import { coords, fovLabel, photoCountLabel, placeLabel, rigDescription, shotTitle, stateColor, when } from "./format";
import { PositionEditor } from "./PositionEditor";
import { TagsForm } from "./TagsForm";

export function Badge({ shot }: { shot: Shot }) {
  return <span class="badge" style={{ color: stateColor(shot), borderColor: stateColor(shot) }}>{shot.state}</span>;
}

interface Props {
  shot: Shot;
  /** The photo on screen (sequences show one at a time); camera facts are per photo. */
  photo: Photo;
  projects: Project[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  /** Extra-field definitions of the shot's project. */
  fields: readonly FieldDef[];
  onUpdated: (s: Shot) => void;
  /** Called after a state change, e.g. so the review queue can move on. */
  onStateChanged?: (s: Shot) => void;
}

/** Title, scouting + camera facts, review-state buttons and in-place tag editing. Used by the dialog and the review page. */
export function ShotInfo({ shot, photo, projects, locations, onLocations, fields, onUpdated, onStateChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [movingPin, setMovingPin] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEditing(false); setMovingPin(false); }, [shot.id]);

  async function patch(p: Parameters<typeof patchShot>[1], what: string) {
    setBusy(true);
    try { const s = await patchShot(shot.id, p); onUpdated(s); if (p.state) onStateChanged?.(s); } catch (e) { alert(`${what} failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  const setState = (state: ShotState) => patch({ state }, "Update");

  return (
    <div class="shot-info">
      <div>
        <h2>{shotTitle(shot)} <Badge shot={shot} /></h2>
        <div class="meta">{[when(shot.captured_at), photoCountLabel(shot)].filter(Boolean).join(" · ")}</div>
      </div>
      {editing ? (
        <TagsForm
          initial={{ name: shot.name ?? "", light: shot.light, artificial: shot.artificial, weather: shot.weather, int_ext: shot.int_ext, location_id: shot.location_id, extra: shot.extra }}
          locations={locations}
          onLocations={onLocations}
          fields={fields}
          submitLabel="Save"
          onSubmit={async (tags) => { onUpdated(await patchShot(shot.id, tags)); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div class="facts">
          <section>
            <h3>Scouting</h3>
            <dl>
              <dt>Project</dt><dd>
                <Combobox options={projects.map((p) => ({ value: p.id, label: p.name }))} value={shot.project_id} clearable={false}
                  onChange={(v) => { if (v && v !== shot.project_id) void patch({ project_id: v }, "Move"); }} />
              </dd>
              <dt>Location</dt><dd>{placeLabel(shot) || "—"}</dd>
              <dt>Int/Ext</dt><dd>{label(shot.int_ext) || "—"}</dd>
              <dt>Light</dt><dd>{lightLabel(shot.light, shot.artificial) || "—"}</dd>
              <dt>Weather</dt><dd>{label(shot.weather) || "—"}</dd>
              <dt>Extra</dt><dd>{extraSummary(fields, shot.extra) || "—"}</dd>
            </dl>
          </section>
          <section>
            <h3>Camera{shot.photos.length > 1 ? ` · photo ${photo.ordinal + 1}` : ""}</h3>
            <dl>
              <dt>Rig</dt><dd>{photo.preset_name ?? (photo.framing?.preset_name as string | undefined) ?? "deleted / unsynced"}</dd>
              <dt>Format</dt><dd>{rigDescription(photo) || "—"}</dd>
              <dt>Lens</dt><dd>{photo.lens_mm} mm</dd>
              <dt>FOV</dt><dd>{fovLabel(photo) || "n/a"}</dd>
              <dt>Position</dt><dd><a href={`https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lon}#map=17/${photo.lat}/${photo.lon}`} target="_blank" rel="noreferrer">{coords(photo)}</a>{photo.position_corrected ? <span class="meta"> · corrected</span> : photo.gps_accuracy_m != null && <span class="meta"> ±{Math.round(photo.gps_accuracy_m)} m</span>}
                {" "}<button class="link" onClick={() => setMovingPin(true)}>correct</button></dd>
            </dl>
          </section>
        </div>
      )}
      {movingPin && !editing && <PositionEditor shot={shot} photo={photo} onSaved={(s) => { onUpdated(s); setMovingPin(false); }} onCancel={() => setMovingPin(false)} />}
      {!editing && (
        <div class="btn-row">
          {shot.state !== "approved" && <button class="btn approve" disabled={busy} onClick={() => void setState("approved")}>Approve</button>}
          {shot.state !== "archived" && <button class="btn archive" disabled={busy} onClick={() => void setState("archived")}>Archive</button>}
          {shot.state !== "unreviewed" && <button class="btn archive" disabled={busy} onClick={() => void setState("unreviewed")}>Back to review</button>}
          <button class="btn outline" onClick={() => setEditing(true)}>Edit details</button>
        </div>
      )}
    </div>
  );
}

/** Thumbnails of a sequence; hidden for single-photo shots. */
export function Filmstrip({ shot, index, onPick }: { shot: Shot; index: number; onPick: (i: number) => void }) {
  if (shot.photos.length < 2) return null;
  return (
    <div class="filmstrip" title="Photos in this sequence (, and . to step)">
      {shot.photos.map((p, i) => (
        <button key={p.id} class={i === index ? "active" : ""} onClick={() => onPick(i)}>
          <img src={p.image_url} alt="" loading="lazy" />
          <span>{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

/** , and . step through a sequence's photos (arrows are taken by shot navigation). */
export function usePhotoKeys(count: number, index: number, setIndex: (i: number) => void) {
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === ",") setIndex(Math.max(0, index - 1));
      else if (e.key === ".") setIndex(Math.min(count - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, index, setIndex]);
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
