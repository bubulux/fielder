import type { ComponentChildren } from "preact";
import { LIGHT, PHASE_ICONS, STATE_ICONS, label, type ShotState } from "@fielder/vocab";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/** Material Design Icons glyph (webfont loaded in index.html). Decorative unless `label` is given. */
export function Icon({ name, label: aria, size }: { name: string; label?: string; size?: number }) {
  return <i class={`mdi mdi-${name}`} style={size ? { fontSize: `${size}px` } : undefined} role={aria ? "img" : undefined} aria-label={aria} aria-hidden={aria ? undefined : true} />;
}

export interface SegOption<T extends string> { id: T; label?: ComponentChildren; icon?: string; title?: string }

/** Segmented switch (a pill): exactly one option is on; selected = accent fill + bold. */
export function Seg<T extends string>({ options, value, onChange, label: aria, lg }: { options: readonly SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; lg?: boolean }) {
  return (
    <div class={cx("f-seg", lg && "f-seg--lg")} role="radiogroup" aria-label={aria} title={aria}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} title={o.title} class="f-seg__opt" onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select pill. Selected = accent fill + bold + leading check, so it never relies on colour. */
export function Chip({ selected, icon, onClick, children, disabled, title }: { selected?: boolean; icon?: string; onClick?: () => void; children: ComponentChildren; disabled?: boolean; title?: string }) {
  return (
    <button type="button" class="f-chip" aria-pressed={!!selected} disabled={disabled} title={title} onClick={onClick}>
      {selected && <Icon name="check" />}{icon && <Icon name={icon} />}{children}
    </button>
  );
}

/** Light phases (any subset) plus the separate Artificial flag. */
export function LightChips({ light, artificial, onChange }: { light: readonly string[]; artificial: boolean; onChange: (light: string[], artificial: boolean) => void }) {
  return (
    <div class="f-chips" role="group" aria-label="Light">
      {LIGHT.map((p) => (
        <Chip key={p} icon={PHASE_ICONS[p]} selected={light.includes(p)} onClick={() => onChange(LIGHT.filter((x) => (x === p ? !light.includes(x) : light.includes(x))), artificial)}>{label(p)}</Chip>
      ))}
      <span class="chip-divider" />
      <Chip icon={PHASE_ICONS.artificial} selected={artificial} onClick={() => onChange([...light], !artificial)}>Artificial</Chip>
    </div>
  );
}

/** Review state: colour + icon + label (icon-only on thumbnails, then it carries a title). */
export function StateMarker({ state, iconOnly, lg }: { state: ShotState; iconOnly?: boolean; lg?: boolean }) {
  return (
    <span class={cx("f-state", `f-state--${state}`, iconOnly && "f-state--icon", lg && "f-state--lg")} title={label(state)} aria-label={iconOnly ? label(state) : undefined}>
      <Icon name={STATE_ICONS[state]} />{!iconOnly && label(state)}
    </span>
  );
}

/** "SEQ · n": solid, never translucent over a photo. */
export function SeqBadge({ count, lg }: { count: number; lg?: boolean }) {
  return <span class={cx("f-seq", lg && "f-seq--lg")} title={`${count} photos in this shot`}><Icon name="layers-triple" />SEQ · {count}</span>;
}

/** Centred empty/loading/error message for a whole panel. */
export function Empty({ icon = "image-off-outline", title, children }: { icon?: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="f-empty">
      <div class="f-empty__icon"><Icon name={icon} /></div>
      <div class="f-empty__title">{title}</div>
      {children && <div class="f-empty__body">{children}</div>}
    </div>
  );
}

export function Loading({ children = "Loading…" }: { children?: ComponentChildren }) {
  return <div class="status"><span class="f-loading"><span class="f-spinner" />{children}</span></div>;
}

/** Inline error line: red, with an icon, never colour alone. */
export function ErrorLine({ children }: { children: ComponentChildren }) {
  return <div class="f-field__error" role="alert"><Icon name="alert-circle" />{children}</div>;
}
