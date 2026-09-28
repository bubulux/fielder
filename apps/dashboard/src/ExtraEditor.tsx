import { selectOptions, type Extra, type ExtraValue, type FieldDef } from "@fielder/vocab";
import { Combobox } from "./Combobox";
import { Chip } from "./ui";

interface Props {
  defs: readonly FieldDef[];
  value: Extra;
  onChange: (v: Extra) => void;
}

/** Form for a project's extra fields; groups nest, dependent selects follow their sibling. */
export function ExtraEditor({ defs, value, onChange }: Props) {
  return (
    <div class="extra-editor">
      {defs.map((f) => (
        <Field key={f.key} def={f} value={value[f.key]} siblings={value}
          onChange={(v) => {
            const next: Extra = { ...value, [f.key]: v };
            // A changed parent invalidates dependent selects that no longer offer their value.
            for (const d of defs) if (d.optionsBy?.field === f.key && !selectOptions(d, next).includes(String(next[d.key] ?? ""))) delete next[d.key];
            onChange(next);
          }} />
      ))}
    </div>
  );
}

function Field({ def, value, siblings, onChange }: { def: FieldDef; value: ExtraValue | undefined; siblings: Extra; onChange: (v: ExtraValue) => void }) {
  const help = def.help ? <span class="meta"> · {def.help}</span> : null;
  switch (def.type) {
    case "group":
      return (
        <fieldset class="extra-group">
          <legend>{def.label}{help}</legend>
          <ExtraEditor defs={def.fields ?? []} value={value && typeof value === "object" && !Array.isArray(value) ? value : {}} onChange={onChange} />
        </fieldset>
      );
    case "text":
      return <label>{def.label}{help}<input value={typeof value === "string" ? value : ""} onInput={(e) => onChange((e.target as HTMLInputElement).value)} /></label>;
    case "number":
      return (
        <label>{def.label}{help}
          <input type="number" value={typeof value === "number" ? value : ""} onInput={(e) => { const t = (e.target as HTMLInputElement).value; onChange(t === "" ? null : Number(t)); }} />
        </label>
      );
    case "boolean":
      return (
        <div class="field">
          <span class="field-label">{def.label}{help}</span>
          <div class="f-chips">
            {([true, false] as const).map((b) => <Chip key={String(b)} selected={value === b} onClick={() => onChange(value === b ? null : b)}>{b ? "Yes" : "No"}</Chip>)}
          </div>
        </div>
      );
    case "select": {
      const opts = selectOptions(def, siblings);
      const waiting = def.optionsBy && opts.length === 0;
      if (def.multiple) {
        const sel = Array.isArray(value) ? value.map(String) : [];
        return (
          <div class="field">
            <span class="field-label">{def.label}{help}</span>
            {waiting ? <span class="meta">Choose {def.optionsBy!.field} first</span> : (
              <div class="f-chips">
                {opts.map((o) => <Chip key={o} selected={sel.includes(o)} onClick={() => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o])}>{o}</Chip>)}
              </div>
            )}
          </div>
        );
      }
      return (
        <label>{def.label}{help}
          {waiting ? <span class="meta">Choose {def.optionsBy!.field} first</span>
            : <Combobox options={opts.map((o) => ({ value: o, label: o }))} value={typeof value === "string" ? value : null} onChange={(v) => onChange(v)} placeholder="—" />}
        </label>
      );
    }
  }
}
