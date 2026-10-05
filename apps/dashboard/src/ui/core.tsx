/** Base pieces every other component uses: class joining, MDI icons, the mark, key caps. */
import type { ComponentChildren } from "preact";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/** Material Design Icons glyph (webfont loaded in index.html). Decorative unless `label` is given. */
export function Icon({ name, label: aria, size }: { name: string; label?: string; size?: number }) {
  return <i class={`mdi mdi-${name}`} style={size ? { fontSize: `${size}px` } : undefined} role={aria ? "img" : undefined} aria-label={aria} aria-hidden={aria ? undefined : true} />;
}

/**
 * The Fielder mark (same geometry as the app icon): viewfinder corners in the text colour around
 * the cinema frame in the accent, so it holds up in both themes.
 */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg class="f-mark" viewBox="0 0 72 72" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M0 0H20V12H12V20H0Z M72 0V20H60V12H52V0Z M72 72H52V60H60V52H72Z M0 72V52H12V60H20V72Z" />
      <path fill="var(--accent)" d="M18 26H54V46H18Z" />
    </svg>
  );
}

export const Kbd = ({ children }: { children: ComponentChildren }) => <span class="f-kbd">{children}</span>;
