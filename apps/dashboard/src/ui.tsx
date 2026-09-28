import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { LIGHT, PHASE_ICONS, STATE_ICONS, label, type ShotState } from "@fielder/vocab";

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
        <Chip key={p} icon={light.includes(p) ? undefined : PHASE_ICONS[p]} selected={light.includes(p)} onClick={() => onChange(LIGHT.filter((x) => (x === p ? !light.includes(x) : light.includes(x))), artificial)}>{label(p)}</Chip>
      ))}
      <Chip icon={artificial ? undefined : PHASE_ICONS.artificial} selected={artificial} onClick={() => onChange([...light], !artificial)}>Artificial</Chip>
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
export function SeqBadge({ count, lg, small }: { count: number; lg?: boolean; small?: boolean }) {
  return <span class={cx("f-seq", lg && "f-seq--lg")} style={small ? { height: "20px", padding: "0 6px", fontSize: "11px" } : undefined} title={`${count} photos in this shot`}>{!small && <Icon name="layers-triple-outline" />}SEQ · {count}</span>;
}

/** Centred empty/loading/error message for a whole panel. */
export function Empty({ icon = "image-off-outline", title, children, actions, tone }: { icon?: string; title: string; children?: ComponentChildren; actions?: ComponentChildren; tone?: "ok" }) {
  return (
    <div class="f-empty" style={{ flex: 1, justifyContent: "center" }}>
      <div class="f-empty__icon" style={tone === "ok" ? { borderColor: "var(--ok)", color: "var(--ok)" } : undefined}><Icon name={icon} /></div>
      <div class="f-empty__title">{title}</div>
      {children && <div class="f-empty__body">{children}</div>}
      {actions && <div class="f-empty__actions">{actions}</div>}
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

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Inline save status: Saving… / Saved / Not saved (+ Retry) / Unsaved changes. */
export function SaveStatus({ state, onRetry, savedLabel = "Saved" }: { state: SaveState; onRetry?: () => void; savedLabel?: string }) {
  if (state === "idle") return null;
  return (
    <span class={cx("f-save", state === "saving" && "f-save--saving", state === "saved" && "f-save--saved", state === "error" && "f-save--error", state === "dirty" && "f-save--dirty")} role="status">
      {state === "saving" ? <span class="f-spinner" /> : <Icon name={state === "saved" ? "check" : state === "error" ? "alert-circle" : "circle-edit-outline"} />}
      {state === "saving" ? "Saving…" : state === "saved" ? savedLabel : state === "error" ? "Not saved" : "Unsaved changes"}
      {state === "error" && onRetry && <button type="button" class="f-linkbtn" style={{ fontSize: "var(--text-caption)" }} onClick={onRetry}>Retry</button>}
    </span>
  );
}

/**
 * Saves `value` a short while after the last change and reports the state. Callers pass the
 * persisted value as `saved`, so an external change resets the state instead of re-saving it.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, { delay = 600, equal = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b), saved }: { delay?: number; equal?: (a: T, b: T) => boolean; saved: T }): [SaveState, () => void] {
  const [state, setState] = useState<SaveState>("idle");
  const latest = useRef(value);
  latest.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = () => {
    const v = latest.current;
    setState("saving");
    save(v).then(() => setState((s) => (s === "saving" ? "saved" : s))).catch(() => setState("error"));
  };
  useEffect(() => {
    if (equal(value, saved)) return;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);
  return [state, run];
}

// ---------- Confirm dialog + toasts (hosted once in App) ----------

export interface ConfirmOptions {
  title: string;
  body?: ComponentChildren;
  confirmLabel: string;
  /** Destructive confirm: danger-solid. */
  danger?: boolean;
  /** An extra safe alternative (e.g. "Archive" next to "Delete"), resolves "alt". */
  altLabel?: string;
  cancelLabel?: string;
  /** Ask for a text (prompt mode): the confirm button resolves with the trimmed text. */
  input?: { label: string; value?: string; placeholder?: string };
}
type ConfirmReq = ConfirmOptions & { resolve: (v: boolean | "alt" | string) => void };
let showConfirm: ((r: ConfirmReq) => void) | null = null;

/** In-app confirmation (replaces window.confirm): resolves true, false (cancel) or "alt". */
export const confirmDialog = (o: Omit<ConfirmOptions, "input">) => new Promise<boolean | "alt">((resolve) => (showConfirm ? showConfirm({ ...o, resolve: (v) => resolve(v === "alt" ? "alt" : !!v) }) : resolve(window.confirm(o.title))));

/** In-app text prompt: resolves the entered text, or null when cancelled or empty. */
export const promptDialog = (o: ConfirmOptions & { input: NonNullable<ConfirmOptions["input"]> }) =>
  new Promise<string | null>((resolve) => (showConfirm ? showConfirm({ ...o, resolve: (v) => resolve(typeof v === "string" && v ? v : null) }) : resolve(window.prompt(o.title, o.input.value ?? "")?.trim() || null)));

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { showConfirm = (r) => { setText(r.input?.value ?? ""); setReq(r); }; return () => { showConfirm = null; }; }, []);
  const done = (v: boolean | "alt") => { req?.resolve(v === true && req.input ? text.trim() : v); setReq(null); };
  const ok = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (req?.input) { field.current?.focus(); field.current?.select(); } else ok.current?.focus(); }, [req]);
  if (!req) return null;
  return (
    <div class="overlay" data-overlay onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } }}>
      <div class="overlay__scrim" onClick={() => done(false)} />
      <div class="f-modal" role="alertdialog" aria-modal="true" aria-label={req.title} style={{ width: "460px" }}>
        <div class="f-modal__head"><h2 class="f-modal__title">{req.title}</h2></div>
        {(req.body || req.input) && (
          <div class="f-modal__body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {req.body}
            {req.input && <label class="f-field"><span class="f-field__label">{req.input.label}</span><span class="f-input"><input ref={field} value={text} placeholder={req.input.placeholder} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); done(true); } }} /></span></label>}
          </div>
        )}
        <div class="f-modal__foot">
          <span class="f-grow" />
          <button type="button" class="f-btn f-btn--ghost" onClick={() => done(false)}>{req.cancelLabel ?? "Cancel"}<span class="f-btn__kbd">Esc</span></button>
          {req.altLabel && <button type="button" class="f-btn f-btn--archive" onClick={() => done("alt")}>{req.altLabel}</button>}
          <button type="button" ref={ok} class={cx("f-btn", req.danger && "f-btn--danger-solid")} disabled={!!req.input && !text.trim()} onClick={() => done(true)}>{req.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

interface ToastReq { id: number; text: string; kind: "ok" | "danger" | "info"; action?: { label: string; run: () => void } }
let pushToast: ((t: ToastReq) => void) | null = null;
let toastId = 0;

/** A short opaque message bottom-centre; an optional action (e.g. Undo) keeps it 4 s. */
export function toast(text: string, kind: ToastReq["kind"] = "ok", action?: ToastReq["action"]) {
  pushToast?.({ id: ++toastId, text, kind, action });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastReq[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.action ? 4000 : 2500);
    };
    return () => { pushToast = null; };
  }, []);
  if (items.length === 0) return null;
  return (
    <div class="toasts" role="status">
      {items.map((t) => (
        <div key={t.id} class={cx("f-toast", t.kind === "danger" && "f-toast--danger", t.kind === "ok" && "f-toast--ok")}>
          <Icon name={t.kind === "danger" ? "alert-circle" : t.kind === "ok" ? "check-circle" : "information-outline"} />
          <span class="f-toast__text">{t.text}</span>
          {t.action && <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => { t.action!.run(); setItems((cur) => cur.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
