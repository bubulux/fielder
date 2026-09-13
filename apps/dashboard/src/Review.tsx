import { useMemo, useState } from "preact/hooks";
import { deleteShot, patchShot, type Shot, type ShotState } from "./api";
import { placeLabel, rigLabel, shotTitle, tagsLabel, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";
import { Badge } from "./ShotDetail";

interface Props {
  shots: Shot[];
  mask: MaskMode;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
  onOpen: (s: Shot, list: Shot[]) => void;
}

/** Unreviewed shots one at a time, oldest first. */
export function Review({ shots, mask, onUpdated, onDeleted, onOpen }: Props) {
  const [mode, setMode] = useState<MaskMode>(mask);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const queue = useMemo(() => shots.filter((s) => s.state === "unreviewed").sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [shots]);
  const current = queue.find((s) => !skipped.includes(s.id)) ?? queue[0];

  async function setState(shot: Shot, state: ShotState) {
    setBusy(true);
    try { onUpdated(await patchShot(shot.id, { state })); } catch (e) { alert(`Update failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function remove(shot: Shot) {
    if (!confirm("Delete this shot permanently? Archiving keeps it.")) return;
    try { await deleteShot(shot.id); onDeleted(shot.id); } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
  }

  if (!current) return <div class="status">Nothing to review.</div>;
  return (
    <div class="review">
      <div class="review-head"><strong>{queue.length} to review</strong><ModeSwitch value={mode} onChange={setMode} /></div>
      <div class="review-body">
        <Framed shot={current} mode={mode} className="review-img" />
        <div class="side">
          <div>
            <div style="font-weight:600;font-size:16px">{shotTitle(current)} <Badge shot={current} /></div>
            <div>{placeLabel(current) || "no location"}</div>
            <div class="meta">{tagsLabel(current) || "no tags"}</div>
            <div class="meta">{rigLabel(current)} · {when(current.timestamp)}</div>
          </div>
          <div class="actions wrap" style="justify-content:flex-start">
            <button class="btn primary" disabled={busy} onClick={() => void setState(current, "approved")}>Approve</button>
            <button class="btn" disabled={busy} onClick={() => void setState(current, "archived")}>Archive</button>
            <button class="btn" onClick={() => onOpen(current, queue)}>Details / edit</button>
            {queue.length > 1 && <button class="btn" onClick={() => setSkipped((s) => [...s, current.id])}>Skip</button>}
            <button class="btn danger" onClick={() => void remove(current)}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
