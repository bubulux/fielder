import { useEffect, useMemo, useState } from "preact/hooks";
import type { FieldDef } from "@fielder/vocab";
import { deleteShot, type Location, type Project, type Shot } from "./api";
import { Framed, type MaskMode } from "./Framed";
import { Filmstrip, isTyping, ShotInfo, usePhotoKeys } from "./ShotInfo";

interface Props {
  shots: Shot[];
  /** The global view mode (header switch). */
  mask: MaskMode;
  projects: Project[];
  fieldsOf: (projectId: string) => FieldDef[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
}

/** Unreviewed shots one at a time, oldest first. ←/→ step through the queue; details are edited in place. */
export function Review({ shots, mask, projects, fieldsOf, locations, onLocations, onUpdated, onDeleted }: Props) {
  const queue = useMemo(() => shots.filter((s) => s.state === "unreviewed").sort((a, b) => a.captured_at.localeCompare(b.captured_at)), [shots]);
  /** Follow the shot, not the position, so edits don't jump; fall back to the same position when it leaves the queue. */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const found = queue.findIndex((s) => s.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex, queue.length - 1);
  const current = index >= 0 ? queue[index] : undefined;
  useEffect(() => { if (current && current.id !== currentId) setCurrentId(current.id); setLastIndex(Math.max(0, index)); }, [current?.id, index]);
  useEffect(() => { setPhotoIndex(0); }, [current?.id]);

  const go = (delta: number) => { const n = queue[index + delta]; if (n) setCurrentId(n.id); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector(".detail-backdrop")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  usePhotoKeys(current?.photos.length ?? 0, photoIndex, setPhotoIndex);

  async function remove(shot: Shot) {
    if (!confirm("Delete this shot permanently? Archiving keeps it.")) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  if (!current) return <div class="status">Nothing to review.</div>;
  const photo = current.photos[Math.min(photoIndex, current.photos.length - 1)];
  return (
    <div class="review">
      <div class="review-head">
        <button class="btn outline" disabled={index === 0} onClick={() => go(-1)} title="Previous (←)">‹ Prev</button>
        <strong>{index + 1} / {queue.length} to review</strong>
        <button class="btn outline" disabled={index === queue.length - 1} onClick={() => go(1)} title="Next (→)">Next ›</button>
      </div>
      <div class="review-body">
        <div class="review-stage">
          <Framed photo={photo} mode={mask} maxHeight="72vh" />
          <Filmstrip shot={current} index={photoIndex} onPick={setPhotoIndex} />
        </div>
        <div class="side">
          <ShotInfo shot={current} photo={photo} projects={projects} fields={fieldsOf(current.project_id)} locations={locations} onLocations={onLocations} onUpdated={onUpdated} />
          <div class="btn-row"><button class="btn danger" onClick={() => void remove(current)}>Delete</button></div>
        </div>
      </div>
    </div>
  );
}
