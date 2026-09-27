import { label, FILTER_FIELDS, filterField, isGroup, OP_LABELS, OPS_BY_KIND, type FilterGroup, type FilterOp, type FilterRule } from "@fielder/vocab";
import type { Location, Preset, Project } from "./api";

interface Ctx { projects: Project[]; locations: Location[]; presets: Preset[] }

const needsValue = (op: FilterOp) => op !== "empty" && op !== "not_empty";
const isList = (op: FilterOp) => op === "in" || op === "not_in";
const isPair = (op: FilterOp) => op === "between";

function options(fieldId: string, ctx: Ctx): { value: string; label: string }[] {
  const f = filterField(fieldId);
  if (!f) return [];
  if (f.kind === "ref") return (f.ref === "location" ? ctx.locations : f.ref === "project" ? ctx.projects : ctx.presets).map((x) => ({ value: x.id, label: x.name }));
  return (f.options ?? []).map((v) => ({ value: v, label: label(v) }));
}

function defaultRule(): FilterRule { return { field: "state", op: "is", value: "approved" }; }

function RuleRow({ rule, ctx, onChange, onRemove }: { rule: FilterRule; ctx: Ctx; onChange: (r: FilterRule) => void; onRemove: () => void }) {
  const f = filterField(rule.field) ?? FILTER_FIELDS[0];
  const ops = OPS_BY_KIND[f.kind];
  const setField = (id: string) => { const nf = filterField(id)!; const op = OPS_BY_KIND[nf.kind][0]; onChange({ field: id, op, value: undefined }); };
  const setOp = (op: FilterOp) => onChange({ ...rule, op, value: isList(op) ? (Array.isArray(rule.value) ? rule.value : []) : isPair(op) ? ["", ""] : Array.isArray(rule.value) ? undefined : rule.value });
  const opts = options(f.id, ctx);
  const pair = Array.isArray(rule.value) && rule.value.length === 2 ? rule.value.map(String) : ["", ""];

  let valueEditor = null;
  if (needsValue(rule.op)) {
    if ((f.kind === "enum" || f.kind === "set" || f.kind === "ref") && isList(rule.op)) {
      const sel = Array.isArray(rule.value) ? rule.value.map(String) : [];
      valueEditor = (
        <div class="chips small">
          {opts.map((o) => (
            <button type="button" key={o.value} class={`chip ${sel.includes(o.value) ? "active" : ""}`}
              onClick={() => onChange({ ...rule, value: sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value] })}>{o.label}</button>
          ))}
        </div>
      );
    } else if (f.kind === "enum" || f.kind === "ref") {
      valueEditor = (
        <select value={String(rule.value ?? "")} onChange={(e) => onChange({ ...rule, value: (e.target as HTMLSelectElement).value })}>
          <option value="">— choose —</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
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
      </select>
      <select value={rule.op} onChange={(e) => setOp((e.target as HTMLSelectElement).value as FilterOp)}>
        {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </select>
      <div class="value">{valueEditor}</div>
      <button type="button" class="btn icon" title="Remove rule" onClick={onRemove}>✕</button>
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
        <div class="seg">
          <button type="button" class={group.match === "all" ? "active" : ""} onClick={() => onChange({ ...group, match: "all" })}>all</button>
          <button type="button" class={group.match === "any" ? "active" : ""} onClick={() => onChange({ ...group, match: "any" })}>any</button>
        </div>
        <span class="meta">of the following</span>
        <span style="flex:1" />
        <button type="button" class="btn" onClick={() => onChange({ ...group, rules: [...group.rules, defaultRule()] })}>＋ Rule</button>
        {depth < 3 && <button type="button" class="btn" onClick={() => onChange({ ...group, rules: [...group.rules, { match: group.match === "all" ? "any" : "all", rules: [defaultRule()] }] })}>＋ Group</button>}
        {onRemove && <button type="button" class="btn icon" title="Remove group" onClick={onRemove}>✕</button>}
      </div>
      {group.rules.length === 0 && <div class="meta" style="padding:4px 0 8px">No rules: matches every shot.</div>}
      {group.rules.map((r, i) => isGroup(r)
        ? <GroupEditor key={i} group={r} ctx={ctx} depth={depth + 1} onChange={(g) => setRule(i, g)} onRemove={() => removeRule(i)} />
        : <RuleRow key={i} rule={r} ctx={ctx} onChange={(x) => setRule(i, x)} onRemove={() => removeRule(i)} />)}
    </div>
  );
}
