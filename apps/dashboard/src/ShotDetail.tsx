import { useEffect, useState } from "preact/hooks";
import type { FieldDef } from "@fielder/vocab";
import { deleteShot, type Location, type Preset, type Project, type Shot } from "./api";
import { when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";
import { RigExplorer } from "./RigExplorer";
import { Filmstrip, isTyping, ShotInfo, usePhotoKeys } from "./ShotInfo";

export { Badge } from "./ShotInfo";

interface Props {
  shot: Shot;
  /** Owned by the caller so a change sticks while stepping through the list, until the dialog closes. */
  mode: MaskMode;
  onMode: (m: MaskMode) => void;
  projects: Project[];
  presets: Preset[];
  /** Extra-field definitions of the shot's project. */
  fields: readonly FieldDef[];
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

export function ShotDetail({ shot, mode, onMode, projects, presets, fields, locations, onLocations, onUpdated, onDeleted, onShowOnMap, onClose, list, onNavigate }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [exploring, setExploring] = useState(false);
  const photo = shot.photos[Math.min(photoIndex, shot.photos.length - 1)];
  const index = list.findIndex((s) => s.id === shot.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  usePhotoKeys(shot.photos.length, photoIndex, setPhotoIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (exploring) { if (e.key === "Escape") setExploring(false); return; }
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); onNavigate(prev); }
      else if (e.key === "ArrowRight" && next) { e.preventDefault(); onNavigate(next); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onNavigate, onClose, exploring]);

  async function remove() {
    if (!confirm(`Delete this shot from ${when(shot.captured_at)}? This removes ${shot.photos.length > 1 ? `all ${shot.photos.length} images` : "the image"} and the metadata permanently. Archiving keeps it.`)) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  if (exploring) {
    return (
      <div class="detail-backdrop" onClick={() => setExploring(false)}>
        <div class="detail wide" onClick={(e) => e.stopPropagation()}>
          <RigExplorer photo={photo} presets={presets} mode={mode} onMode={onMode} onClose={() => setExploring(false)} />
        </div>
      </div>
    );
  }
  return (
    <div class="detail-backdrop" onClick={onClose}>
      <div class="detail" onClick={(e) => e.stopPropagation()}>
        <div class="stage">
          <Framed photo={photo} mode={mode} maxHeight="80vh" />
          <button class="nav left" title="Previous (←)" disabled={!prev} onClick={() => prev && onNavigate(prev)}>‹</button>
          <button class="nav right" title="Next (→)" disabled={!next} onClick={() => next && onNavigate(next)}>›</button>
          {index >= 0 && list.length > 1 && <span class="counter">{index + 1} / {list.length}</span>}
          <Filmstrip shot={shot} index={photoIndex} onPick={setPhotoIndex} />
        </div>
        <div class="side">
          <div class="side-top"><span /><ModeSwitch value={mode} onChange={onMode} /></div>
          <ShotInfo shot={shot} photo={photo} projects={projects} fields={fields} locations={locations} onLocations={onLocations} onUpdated={onUpdated} />
          <details><summary class="meta">Raw metadata · {shot.id}</summary><pre>{JSON.stringify({ framing: photo.framing, device: photo.device }, null, 2)}</pre></details>
          <div class="btn-row footer">
            <button class="btn outline" onClick={() => void downloadCrop(photo)} title="Download the photo cropped to the rig frame">Download crop</button>
            <a class="btn outline" href={photo.image_url} download target="_blank" rel="noreferrer">Original</a>
            <button class="btn outline" onClick={() => onShowOnMap(shot)}>Show on map</button>
            <button class="btn outline" onClick={() => setExploring(true)} title="Frame this photo with other rigs and lenses">Explore rigs</button>
            <span style="flex:1" />
            <button class="btn danger" onClick={() => void remove()}>Delete</button>
            <button class="btn outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
