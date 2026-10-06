import { label, lightLabel } from "@fielder/vocab";
import type { Shot } from "./api";
import { cover, placeLabel, rigLabel, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { cx, ProjectTag, SeqBadge, StateMarker } from "./ui";

/** "Place · INT · Dusk / Night", falling back to the rig for untagged shots. */
export const shotSub = (s: Shot) => [placeLabel(s) || rigLabel(cover(s)), label(s.int_ext).toUpperCase(), lightLabel(s.light, s.artificial)].filter(Boolean).join(" · ");

/** Gallery card: SEQ badge top left, state marker top right, title, place line, project tag when browsing all projects. */
export function ShotCard({ shot, mask, project, focused, onClick, onFocus }: { shot: Shot; mask: MaskMode; project?: string | null; focused?: boolean; onClick: () => void; onFocus?: () => void }) {
  return (
    <button type="button" class={cx("f-card", focused && "is-focus")} role="gridcell" tabIndex={focused ? 0 : -1} data-shot={shot.id} onClick={onClick} onFocus={onFocus}>
      <div class="f-card__img">
        <Framed photo={cover(shot)} mode={mask} />
        {shot.photos.length > 1 && <div class="f-card__tl"><SeqBadge count={shot.photos.length} /></div>}
        <div class="f-card__tr"><StateMarker state={shot.state} iconOnly /></div>
      </div>
      <div class="f-card__body">
        <span class="f-card__title">{shotTitle(shot)}</span>
        <span class="f-card__sub">{shotSub(shot)}</span>
        {project && <ProjectTag icon="folder-outline" style={{ alignSelf: "flex-start" }} title={`Project: ${project}`}>{project}</ProjectTag>}
      </div>
    </button>
  );
}
