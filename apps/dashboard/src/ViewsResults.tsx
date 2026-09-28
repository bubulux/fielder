import { useState } from "preact/hooks";
import type { Shot } from "./api";
import type { MaskMode } from "./Framed";
import { MapView } from "./MapView";
import { ShotCard } from "./ShotCard";
import { Empty, Seg } from "./ui";

export function FilterBuilderResults({ shots, total, mask, onOpen }: { shots: Shot[]; total: number; mask: MaskMode; onOpen: (s: Shot, list: Shot[]) => void }) {
  const [show, setShow] = useState<"grid" | "map">("grid");
  return (
    <div class="results">
      <div class="results-head">
        <strong class="num">{shots.length} of {total} shots</strong>
        <Seg label="Show results as" value={show} onChange={setShow} options={[{ id: "grid", icon: "view-grid-outline", label: "Grid" }, { id: "map", icon: "map-outline", label: "Map" }]} />
      </div>
      {show === "map" ? (
        <div class="results-map"><MapView shots={shots} onOpen={(s) => onOpen(s, shots)} mask={mask} /></div>
      ) : shots.length === 0 ? <Empty icon="filter-remove-outline" title="No shots match" /> : (
        <div class="gallery results-grid">
          {shots.map((s) => <ShotCard key={s.id} shot={s} mask={mask} onClick={() => onOpen(s, shots)} />)}
        </div>
      )}
    </div>
  );
}
