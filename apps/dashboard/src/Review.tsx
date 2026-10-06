import { useEffect, useMemo, useState } from "preact/hooks";
import type { FieldDef } from "@fielder/vocab";
import type { Location, Preset, Project, Shot } from "./api";
import type { MaskMode } from "./Framed";
import type { Stage } from "./router";
import { ReviewProgress, ShotView } from "./ShotView";
import { Button, Empty, Toolbar, ToolbarTitle } from "./ui";

interface Props {
  shots: Shot[];
  scopeName: string;
  stage: Stage;
  onStage: (s: Stage) => void;
  mode: MaskMode;
  onMode: (m: MaskMode) => void;
  projects: Project[];
  presets: Preset[];
  fieldsOf: (projectId: string) => FieldDef[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
  onShowOnMap: (s: Shot) => void;
  onOpenDay: (projectId: string, dayId: string) => void;
  onBrowseApproved: () => void;
  onPlan: () => void;
}

/** Unreviewed shots one at a time, oldest first, on the shot-view layout. No skip; ←/→ move through the queue. */
export function ReviewPage(p: Props) {
  const queue = useMemo(() => p.shots.filter((s) => s.state === "unreviewed").sort((a, b) => a.captured_at.localeCompare(b.captured_at)), [p.shots]);
  // Follow the shot, not the position, so edits don't jump; when it leaves the queue the next one takes its place.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const found = queue.findIndex((s) => s.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex, queue.length - 1);
  const current = index >= 0 ? queue[index] : undefined;
  useEffect(() => { if (current && current.id !== currentId) setCurrentId(current.id); setLastIndex(Math.max(0, index)); }, [current?.id, index]);

  if (!current) {
    return (
      <>
        <Toolbar><ToolbarTitle>Review</ToolbarTitle><ReviewProgress value={1}><strong>0 left</strong></ReviewProgress></Toolbar>
        <Empty icon="check-all" tone="ok" title="Nothing to review" actions={<><Button kind="secondary" icon="check-circle" onClick={p.onBrowseApproved}>Browse approved shots</Button><Button kind="ghost" onClick={p.onPlan}>Plan a day</Button></>}>
          All {p.shots.length} shots in {p.scopeName} are reviewed. New uploads land here, oldest first.
        </Empty>
      </>
    );
  }
  return (
    <ShotView shot={current} list={queue} onNavigate={(s) => setCurrentId(s.id)} context={{ kind: "review", total: queue.length }} stage={p.stage} onStage={p.onStage}
      mode={p.mode} onMode={p.onMode} projects={p.projects} presets={p.presets} fieldsOf={p.fieldsOf} locations={p.locations} onLocations={p.onLocations}
      onUpdated={p.onUpdated} onDeleted={p.onDeleted} onShowOnMap={p.onShowOnMap} onOpenDay={p.onOpenDay} />
  );
}
