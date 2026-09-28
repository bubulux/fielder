import type { Shot } from "./api";
import { cover, placeLabel, rigLabel, shotTitle, when } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { Icon, SeqBadge, StateMarker } from "./ui";

/** Gallery thumbnail: state marker top left, sequence badge top right, title and place below. */
export function ShotCard({ shot, mask, project, onClick }: { shot: Shot; mask: MaskMode; project?: string | null; onClick: () => void }) {
  return (
    <button type="button" class="f-card" onClick={onClick}>
      <div class="f-card__img">
        <Framed photo={cover(shot)} mode={mask} />
        <div class="f-card__tl"><StateMarker state={shot.state} iconOnly /></div>
        {shot.photos.length > 1 && <div class="f-card__tr"><SeqBadge count={shot.photos.length} /></div>}
      </div>
      <div class="f-card__body">
        <div class="f-card__title">{shotTitle(shot)}</div>
        <div class="f-card__sub">{placeLabel(shot) || rigLabel(cover(shot))}</div>
        <div class="f-card__row">
          <span class="f-card__sub num">{when(shot.captured_at)}</span>
          {project && <span class="f-ptag" title={`Project: ${project}`}><Icon name="folder-outline" />{project}</span>}
        </div>
      </div>
    </button>
  );
}
