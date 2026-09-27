import { useEffect, useState } from "preact/hooks";
import { deleteShot, type Location, type Project, type Shot } from "./api";
import { when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";
import { Filmstrip, isTyping, ShotInfo, usePhotoKeys } from "./ShotInfo";

export { Badge } from "./ShotInfo";

interface Props {
  shot: Shot;
  /** Owned by the caller so a change sticks while stepping through the list, until the dialog closes. */
  mode: MaskMode;
  onMode: (m: MaskMode) => void;
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

export function ShotDetail({ shot, mode, onMode, projects, locations, onLocations, onUpdated, onDeleted, onShowOnMap, onClose, list, onNavigate }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photo = shot.photos[Math.min(photoIndex, shot.photos.length - 1)];
  const index = list.findIndex((s) => s.id === shot.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  usePhotoKeys(shot.photos.length, photoIndex, setPhotoIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); onNavigate(prev); }
      else if (e.key === "ArrowRight" && next) { e.preventDefault(); onNavigate(next); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onNavigate, onClose]);

  async function remove() {
    if (!confirm(`Delete this shot from ${when(shot.captured_at)}? This removes ${shot.photos.length > 1 ? `all ${shot.photos.length} images` : "the image"} and the metadata permanently. Archiving keeps it.`)) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); onClose(); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
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
          <ShotInfo shot={shot} photo={photo} projects={projects} locations={locations} onLocations={onLocations} onUpdated={onUpdated} />
          <details><summary class="meta">Raw metadata · {shot.id}</summary><pre>{JSON.stringify({ framing: photo.framing, device: photo.device }, null, 2)}</pre></details>
          <div class="btn-row footer">
            <button class="btn outline" onClick={() => void downloadCrop(photo)} title="Download the photo cropped to the rig frame">Download crop</button>
            <a class="btn outline" href={photo.image_url} download target="_blank" rel="noreferrer">Original</a>
            <button class="btn outline" onClick={() => onShowOnMap(shot)}>Show on map</button>
            <span style="flex:1" />
            <button class="btn danger" onClick={() => void remove()}>Delete</button>
            <button class="btn outline" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
