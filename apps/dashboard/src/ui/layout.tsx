/**
 * The dashboard shell's building blocks (dashboard.css, the rework's additions to the design
 * system): toolbars above a page and side panels next to it.
 */
import type { ComponentChildren, JSX } from "preact";
import { cx, Icon } from "./core";

/** Page toolbar; `sub` is the second, quieter row (state switch, result count). */
export function Toolbar({ sub, children }: { sub?: boolean; children: ComponentChildren }) {
  return <div class={cx("f-toolbar", sub && "f-toolbar--sub")}>{children}</div>;
}

/** Page title inside a Toolbar: optional icon, the ellipsised title, an optional count, then extras (e.g. an "Edited" badge). */
export function ToolbarTitle({ icon, count, after, children }: { icon?: string; count?: number; after?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="f-toolbar__title">
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {count !== undefined && <span class="meta num" style={{ fontSize: "var(--text-body)" }}>{count}</span>}
      {after}
    </div>
  );
}

/** Pushes the following toolbar items to the right. */
export const ToolbarSpacer = () => <span class="f-toolbar__sp" />;

/** Side panel: `left` for list panels before the content, otherwise an inspector-style panel on the right. */
export function Panel({ left, width, label, style, children }: { left?: boolean; width?: string; label?: string; style?: JSX.CSSProperties; children: ComponentChildren }) {
  const s = width ? { "--panel-w": width, ...(style as object) } : style;
  return <aside class={cx("f-panel", left && "f-panel--left")} style={s as JSX.CSSProperties} aria-label={label}>{children}</aside>;
}

/** Panel heading: the title, then actions (a key hint, a button, a close button). */
export function PanelHead({ title, titleStyle, children }: { title: ComponentChildren; titleStyle?: JSX.CSSProperties; children?: ComponentChildren }) {
  return <div class="f-panel__head"><span class="f-panel__title" style={titleStyle}>{title}</span>{children}</div>;
}

/** Scrolling panel content; `flush` drops the padding for edge-to-edge row lists. */
export function PanelBody({ flush, style, children, ...rest }: { flush?: boolean; style?: JSX.CSSProperties; children: ComponentChildren } & Pick<JSX.HTMLAttributes<HTMLDivElement>, "role" | "aria-label">) {
  return <div class={cx("f-panel__body", flush && "f-panel__body--flush")} style={style} {...rest}>{children}</div>;
}

/** Pinned actions at the bottom of a panel. */
export const PanelFoot = ({ children }: { children: ComponentChildren }) => <div class="f-panel__foot">{children}</div>;
