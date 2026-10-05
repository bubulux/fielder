/** Overlays from the design system (overlays.css): the confirm/prompt dialog, hosted once in App. */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "./core";

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
