import { useEffect, useMemo, useRef, useState } from "preact/hooks";

export interface ComboOption { value: string; label: string; hint?: string }

interface Props {
  options: readonly ComboOption[];
  /** Selected value, or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Offer "Create “text”" when the typed text matches no option exactly. */
  onCreate?: (text: string) => void;
  /** Show an entry that clears the value (default true). */
  clearable?: boolean;
  autoFocus?: boolean;
  id?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Type to narrow the list, ↑/↓ to move, Enter or Tab to take the highlighted entry
 * (Tab also moves on to the next field), Esc to cancel. Matches at the start of the
 * label rank first, then matches anywhere.
 */
export function Combobox({ options, value, onChange, placeholder, onCreate, clearable = true, autoFocus, id }: Props) {
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState<string | null>(null); // null = not typing: show the selected label
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const q = norm(query ?? "");
  const matches = useMemo(() => {
    if (!q) return [...options];
    const starts = options.filter((o) => norm(o.label).startsWith(q));
    const inside = options.filter((o) => !norm(o.label).startsWith(q) && (norm(o.label).includes(q) || norm(o.hint ?? "").includes(q)));
    return [...starts, ...inside];
  }, [options, q]);
  const canCreate = !!onCreate && !!q && !options.some((o) => norm(o.label) === q);
  type Entry = { kind: "option"; option: ComboOption } | { kind: "create" } | { kind: "clear" };
  const entries: Entry[] = [
    ...matches.map((option): Entry => ({ kind: "option", option })),
    ...(canCreate ? [{ kind: "create" } as Entry] : []),
    ...(clearable && value !== null && !q ? [{ kind: "clear" } as Entry] : []),
  ];

  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { list.current?.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const close = () => { setOpen(false); setQuery(null); };
  const take = (e: Entry | undefined) => {
    if (!e) return;
    if (e.kind === "option") onChange(e.option.value);
    else if (e.kind === "clear") onChange(null);
    else onCreate?.((query ?? "").trim());
    close();
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setHi((i) => Math.min(entries.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { if (open && entries.length) { e.preventDefault(); take(entries[hi]); } }
    else if (e.key === "Tab") { if (open && q && entries.length) take(entries[hi]); else close(); } // no preventDefault: focus moves on
    else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
  }

  return (
    <div class="combo">
      <input
        id={id}
        ref={input}
        autoFocus={autoFocus}
        value={query ?? selected?.label ?? ""}
        placeholder={placeholder ?? "Type to search…"}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={close}
        onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && entries.length > 0 && (
        <ul class="combo-list" ref={list} role="listbox">
          {entries.map((e, i) => (
            <li
              key={e.kind === "option" ? e.option.value : e.kind}
              class={`${i === hi ? "hi" : ""} ${e.kind === "option" && e.option.value === value ? "sel" : ""} ${e.kind !== "option" ? "special" : ""}`}
              // mousedown, not click: runs before the input's blur closes the list
              onMouseDown={(ev) => { ev.preventDefault(); take(e); }}
              onMouseEnter={() => setHi(i)}
              role="option"
            >
              {e.kind === "option" ? <>{e.option.label}{e.option.hint && <span class="meta"> {e.option.hint}</span>}</>
                : e.kind === "create" ? <>＋ Create “{(query ?? "").trim()}”</>
                : <>— none —</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
