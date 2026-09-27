import { useState } from "preact/hooks";
import type { Shot } from "./api";
import { cover, placeLabel, rigLabel, shotTitle, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { MapView } from "./MapView";
import { Badge } from "./ShotDetail";

export function FilterBuilderResults({ shots, total, mask, onOpen }: { shots: Shot[]; total: number; mask: MaskMode; onOpen: (s: Shot, list: Shot[]) => void }) {
  const [show, setShow] = useState<"grid" | "map">("grid");
  return (
    <div class="results">
      <div class="results-head">
        <strong>{shots.length} of {total} shots</strong>
        <div class="seg">
          <button class={show === "grid" ? "active" : ""} onClick={() => setShow("grid")}>Grid</button>
          <button class={show === "map" ? "active" : ""} onClick={() => setShow("map")}>Map</button>
        </div>
      </div>
      {show === "map" ? (
        <div class="results-map"><MapView shots={shots} onOpen={(s) => onOpen(s, shots)} mask={mask} /></div>
      ) : shots.length === 0 ? <div class="status">No shots match.</div> : (
        <div class="gallery results-grid">
          {shots.map((s) => (
            <article class="card" key={s.id} onClick={() => onOpen(s, shots)}>
              <Framed photo={cover(s)} mode={mask} />
              <div class="body">
                <div class="title">{shotTitle(s)}</div>
                <div class="sub">{placeLabel(s) || rigLabel(cover(s))}</div>
                <div class="sub row"><span>{when(s.captured_at)}</span><Badge shot={s} /></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
