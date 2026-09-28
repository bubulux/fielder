import { label, FILTER_FIELDS, filterField, isGroup, OP_LABELS, OPS_BY_KIND, type FilterField, type FilterGroup, type FilterOp, type FilterRule } from "@fielder/vocab";
import type { Location, Preset, Project } from "./api";
import { Combobox } from "./Combobox";
import { Chip, Icon, Seg } from "./ui";

interface Ctx { projects: Project[]; locations: Location[]; presets: Preset[]; /** Filterable extra fields of the current scope. */ extra: readonly FilterField[] }

const needsValue = (op: FilterOp) => op !== "empty" && op !== "not_empty";
const isList = (op: FilterOp) => op === "in" || op === "not_in";
const isPair = (op: FilterOp) => op === "between";

function options(fieldId: string, ctx: Ctx): { value: string; label: string }[] {
  const f = filterField(fieldId, ctx.extra);
  if (!f) return [];
  if (f.kind === "ref") return (f.ref === "location" ? ctx.locations : f.ref === "project" ? ctx.projects : ctx.presets).map((x) => ({ value: x.id, label: x.name }));
  return (f.options ?? []).map((v) => ({ value: v, label: f.id.startsWith("extra.") ? v : label(v) }));
}

function defaultRule(): FilterRule { return { field: "state", op: "is", value: "approved" }; }

function RuleRow({ rule, ctx, onChange, onRemove }: { rule: FilterRule; ctx: Ctx; onChange: (r: FilterRule) => void; onRemove: () => void }) {
  const f = filterField(rule.field, ctx.extra) ?? FILTER_FIELDS[0];
  const ops = OPS_BY_KIND[f.kind];
  const setField = (id: string) => { const nf = filterField(id, ctx.extra)!; const op = OPS_BY_KIND[nf.kind][0]; onChange({ field: id, op, value: undefined }); };
  const setOp = (op: FilterOp) => onChange({ ...rule, op, value: isList(op) ? (Array.isArray(rule.value) ? rule.value : []) : isPair(op) ? ["", ""] : Array.isArray(rule.value) ? undefined : rule.value });
  const opts = options(f.id, ctx);
  const pair = Array.isArray(rule.value) && rule.value.length === 2 ? rule.value.map(String) : ["", ""];

  let valueEditor = null;
  if (needsValue(rule.op)) {
    if ((f.kind === "enum" || f.kind === "set" || f.kind === "ref") && isList(rule.op)) {
      const sel = Array.isArray(rule.value) ? rule.value.map(String) : [];
      valueEditor = (
        <div class="f-chips">
          {opts.map((o) => (
            <Chip key={o.value} selected={sel.includes(o.value)}
              onClick={() => onChange({ ...rule, value: sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value] })}>{o.label}</Chip>
          ))}
        </div>
      );
    } else if (f.kind === "enum" || f.kind === "ref") {
      valueEditor = <Combobox options={opts} value={rule.value == null || rule.value === "" ? null : String(rule.value)} onChange={(v) => onChange({ ...rule, value: v ?? "" })} placeholder="— choose —" />;
    } else if (f.kind === "text") {
      valueEditor = <input value={String(rule.value ?? "")} onInput={(e) => onChange({ ...rule, value: (e.target as HTMLInputElement).value })} placeholder="text" />;
    } else if (f.kind === "number") {
      valueEditor = isPair(rule.op)
        ? <span class="pair"><input type="number" value={pair[0]} onInput={(e) => onChange({ ...rule, value: [Number((e.target as HTMLInputElement).value), Number(pair[1])] })} /> and <input type="number" value={pair[1]} onInput={(e) => onChange({ ...rule, value: [Number(pair[0]), Number((e.target as HTMLInputElement).value)] })} /></span>
        : <input type="number" value={typeof rule.value === "number" ? rule.value : ""} onInput={(e) => onChange({ ...rule, value: Number((e.target as HTMLInputElement).value) })} />;
    } else if (f.kind === "date") {
      valueEditor = isPair(rule.op)
        ? <span class="pair"><input type="date" value={pair[0]} onInput={(e) => onChange({ ...rule, value: [(e.target as HTMLInputElement).value, pair[1]] })} /> and <input type="date" value={pair[1]} onInput={(e) => onChange({ ...rule, value: [pair[0], (e.target as HTMLInputElement).value] })} /></span>
        : <input type="date" value={String(rule.value ?? "")} onInput={(e) => onChange({ ...rule, value: (e.target as HTMLInputElement).value })} />;
    }
  }
  return (
    <div class="rule">
      <select value={f.id} onChange={(e) => setField((e.target as HTMLSelectElement).value)}>
        {FILTER_FIELDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        {ctx.extra.length > 0 && <optgroup label="Extra fields">{ctx.extra.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>}
      </select>
      <select value={rule.op} onChange={(e) => setOp((e.target as HTMLSelectElement).value as FilterOp)}>
        {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </select>
      <div class="value">{valueEditor}</div>
      <button type="button" class="f-btn f-btn--ghost f-btn--icon f-btn--sm" title="Remove rule" aria-label="Remove rule" onClick={onRemove}><Icon name="close" /></button>
    </div>
  );
}

export function GroupEditor({ group, ctx, onChange, onRemove, depth = 0 }: { group: FilterGroup; ctx: Ctx; onChange: (g: FilterGroup) => void; onRemove?: () => void; depth?: number }) {
  const setRule = (i: number, r: FilterRule | FilterGroup) => onChange({ ...group, rules: group.rules.map((x, j) => (j === i ? r : x)) });
  const removeRule = (i: number) => onChange({ ...group, rules: group.rules.filter((_, j) => j !== i) });
  return (
    <div class={`group depth-${depth}`}>
      <div class="group-head">
        <span>Match</span>
        <Seg label="Match" value={group.match} onChange={(match) => onChange({ ...group, match })} options={[{ id: "all", label: "all" }, { id: "any", label: "any" }]} />
        <span class="meta">of the following</span>
        <span class="grow" />
        <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => onChange({ ...group, rules: [...group.rules, defaultRule()] })}><Icon name="plus" />Rule</button>
        {depth < 3 && <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => onChange({ ...group, rules: [...group.rules, { match: group.match === "all" ? "any" : "all", rules: [defaultRule()] }] })}><Icon name="plus" />Group</button>}
        {onRemove && <button type="button" class="f-btn f-btn--ghost f-btn--icon f-btn--sm" title="Remove group" aria-label="Remove group" onClick={onRemove}><Icon name="close" /></button>}
      </div>
      {group.rules.length === 0 && <div class="meta">No rules: matches every shot.</div>}
      {group.rules.map((r, i) => isGroup(r)
        ? <GroupEditor key={i} group={r} ctx={ctx} depth={depth + 1} onChange={(g) => setRule(i, g)} onRemove={() => removeRule(i)} />
        : <RuleRow key={i} rule={r} ctx={ctx} onChange={(x) => setRule(i, x)} onRemove={() => removeRule(i)} />)}
    </div>
  );
}
