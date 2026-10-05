/** Form controls from the design system (forms.css): select, chips, light chips. The combobox lives in Combobox.tsx. */
import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { LIGHT, PHASE_ICONS, label } from "@fielder/vocab";
import { cx, Icon } from "./core";

export interface SelectOption { value: string; label: string; /** Heading shown above the first option of a group. */ group?: string }

/**
 * A single choice in the design-system look (a native <select> list can't be styled). The
 * trigger is an f-pick; the list an f-menu below it. Keys on the trigger: ↓/Enter/Space open,
 * ↑/↓/Home/End move, Enter picks, Esc closes, a letter jumps to the next match. While open,
 * page shortcuts pause (data-overlay).
 */
export function Select({ value, options, onChange, label: aria, prefix, icon, width }: { value: string; options: readonly SelectOption[]; onChange: (v: string) => void; label: string; /** Bold word before the value ("Rig"). */ prefix?: string; icon?: string; width?: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const sel = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    setHi(sel);
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector(".is-hi")?.scrollIntoView({ block: "nearest" }); }, [hi, open]);
  const pick = (i: number) => { const o = options[i]; if (o) onChange(o.value); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    let used = true;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") setOpen(true); else used = false;
    } else if (k === "ArrowDown") setHi((h) => Math.min(options.length - 1, h + 1));
    else if (k === "ArrowUp") setHi((h) => Math.max(0, h - 1));
    else if (k === "Home") setHi(0);
    else if (k === "End") setHi(options.length - 1);
    else if (k === "Enter" || k === " ") pick(hi);
    else if (k === "Escape" || k === "Tab") { setOpen(false); used = k === "Escape"; }
    else if (k.length === 1 && /\S/.test(k)) {
      const from = open ? hi : sel;
      const order = [...options.slice(from + 1), ...options.slice(0, from + 1)];
      const hit = order.find((o) => o.label.toLowerCase().startsWith(k.toLowerCase()));
      if (hit) setHi(options.indexOf(hit)); else used = false;
    } else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };
  return (
    <div ref={box} class="f-select" style={{ width }}>
      <button type="button" class="f-pick" style={{ width: "100%" }} aria-haspopup="listbox" aria-expanded={open} aria-label={`${aria}: ${current?.label ?? ""}`}
        onClick={() => setOpen(!open)} onKeyDown={onKey}>
        {icon && <Icon name={icon} />}{prefix && <b>{prefix}</b>}<span>{current?.label ?? ""}</span><Icon name="chevron-down" />
      </button>
      {open && (
        <div ref={list} class="f-menu f-select__list" role="listbox" aria-label={aria} data-overlay>
          {options.map((o, i) => (
            <Fragment key={o.value}>
              {o.group && o.group !== options[i - 1]?.group && <span class="f-menu__label">{o.group}</span>}
              <button type="button" role="option" aria-selected={i === sel} tabIndex={-1} class={cx("f-menu__item", i === sel && "is-sel", i === hi && "is-hi")}
                onMouseEnter={() => setHi(i)} onClick={() => pick(i)}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>{i === sel && <Icon name="check" />}
              </button>
            </Fragment>
          ))}
        </div>
      )}
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
