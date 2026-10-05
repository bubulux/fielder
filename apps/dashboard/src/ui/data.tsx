/** Data badges from the design system (data.css): review state and sequence markers. */
import { STATE_ICONS, label, type ShotState } from "@fielder/vocab";
import { cx, Icon } from "./core";

/** Review state: colour + icon + label (icon-only on thumbnails, then it carries a title). */
export function StateMarker({ state, iconOnly, lg }: { state: ShotState; iconOnly?: boolean; lg?: boolean }) {
  return (
    <span class={cx("f-state", `f-state--${state}`, iconOnly && "f-state--icon", lg && "f-state--lg")} title={label(state)} aria-label={iconOnly ? label(state) : undefined}>
      <Icon name={STATE_ICONS[state]} />{!iconOnly && label(state)}
    </span>
  );
}

/** "SEQ · n": solid, never translucent over a photo. */
export function SeqBadge({ count, lg, small }: { count: number; lg?: boolean; small?: boolean }) {
  return <span class={cx("f-seq", lg && "f-seq--lg")} style={small ? { height: "20px", padding: "0 6px", fontSize: "11px" } : undefined} title={`${count} photos in this shot`}>{!small && <Icon name="layers-triple-outline" />}SEQ · {count}</span>;
}
