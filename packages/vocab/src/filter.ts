/**
 * Shot filter model shared by the dashboard (builder + evaluation) and the Worker
 * (validation of saved views). A filter is a group of rules joined by all/any;
 * groups nest so "A and (B or C)" is expressible.
 */
import { BERLIN_DISTRICTS, EXTRA_COLLECTIONS, INT_EXT, LIGHT, SHOT_STATES, WEATHER } from "./vocab.ts";

export type FieldKind = "enum" | "ref" | "text" | "number" | "date";
export type FilterOp =
  | "is" | "is_not" | "in" | "not_in"
  | "contains" | "not_contains"
  | "eq" | "lt" | "gt" | "between"
  | "before" | "after"
  | "empty" | "not_empty";

export interface FilterRule { field: string; op: FilterOp; value?: unknown }
export interface FilterGroup { match: "all" | "any"; rules: (FilterRule | FilterGroup)[] }
export const isGroup = (r: FilterRule | FilterGroup): r is FilterGroup => "rules" in r;

export interface FilterField {
  id: string;
  label: string;
  kind: FieldKind;
  /** enum: allowed values. */
  options?: readonly string[];
  /** ref: which server list supplies the options. */
  ref?: "location" | "preset";
}

export const FILTER_FIELDS: readonly FilterField[] = [
  { id: "state", label: "State", kind: "enum", options: SHOT_STATES },
  { id: "name", label: "Name", kind: "text" },
  { id: "location_id", label: "Location", kind: "ref", ref: "location" },
  { id: "district", label: "District", kind: "enum", options: BERLIN_DISTRICTS },
  { id: "int_ext", label: "Int/Ext", kind: "enum", options: INT_EXT },
  { id: "light", label: "Light", kind: "enum", options: LIGHT },
  { id: "weather", label: "Weather", kind: "enum", options: WEATHER },
  ...EXTRA_COLLECTIONS.map((c): FilterField => ({ id: `extra.${c.id}`, label: c.name, kind: "enum", options: c.values })),
  { id: "preset_id", label: "Rig", kind: "ref", ref: "preset" },
  { id: "lens_mm", label: "Lens (mm)", kind: "number" },
  { id: "ff_eq_mm", label: "FF-equivalent (mm)", kind: "number" },
  { id: "timestamp", label: "Date", kind: "date" },
];

export const OPS_BY_KIND: Record<FieldKind, readonly FilterOp[]> = {
  enum: ["is", "is_not", "in", "not_in", "empty", "not_empty"],
  ref: ["is", "is_not", "in", "not_in", "empty", "not_empty"],
  text: ["contains", "not_contains", "is", "empty", "not_empty"],
  number: ["eq", "lt", "gt", "between", "empty", "not_empty"],
  date: ["before", "after", "between"],
};

export const OP_LABELS: Record<FilterOp, string> = {
  is: "is", is_not: "is not", in: "is one of", not_in: "is none of",
  contains: "contains", not_contains: "does not contain",
  eq: "=", lt: "<", gt: ">", between: "between",
  before: "before", after: "after",
  empty: "is empty", not_empty: "is set",
};

export const filterField = (id: string): FilterField | undefined => FILTER_FIELDS.find((f) => f.id === id);

/** The subset of a shot the evaluator needs (both clients map their Shot type to this). */
export interface FilterableShot {
  state: string;
  name: string | null;
  location_id: string | null;
  district: string | null;
  int_ext: string | null;
  light: string | null;
  weather: string | null;
  preset_id: string | null;
  lens_mm: number;
  ff_eq_mm: number | null;
  /** ISO timestamp. */
  timestamp: string;
  extra: Record<string, string> | null;
}

function fieldValue(s: FilterableShot, id: string): unknown {
  if (id.startsWith("extra.")) return s.extra?.[id.slice(6)] ?? null;
  return (s as unknown as Record<string, unknown>)[id] ?? null;
}

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

export function evaluateRule(r: FilterRule, s: FilterableShot): boolean {
  const f = filterField(r.field);
  if (!f) return true; // unknown field (older client): ignore the rule
  const v = fieldValue(s, r.field);
  if (r.op === "empty") return isBlank(v);
  if (r.op === "not_empty") return !isBlank(v);
  switch (f.kind) {
    case "enum":
    case "ref": {
      const sv = v == null ? "" : String(v);
      if (r.op === "is") return sv === String(r.value ?? "");
      if (r.op === "is_not") return sv !== String(r.value ?? "");
      const list = Array.isArray(r.value) ? r.value.map(String) : [];
      if (r.op === "in") return list.includes(sv);
      if (r.op === "not_in") return !list.includes(sv);
      return true;
    }
    case "text": {
      const sv = (v == null ? "" : String(v)).toLowerCase();
      const q = String(r.value ?? "").toLowerCase();
      if (r.op === "contains") return sv.includes(q);
      if (r.op === "not_contains") return !sv.includes(q);
      if (r.op === "is") return sv === q;
      return true;
    }
    case "number": {
      if (typeof v !== "number") return false;
      const n = Number(Array.isArray(r.value) ? NaN : r.value);
      if (r.op === "eq") return Math.abs(v - n) < 1e-9;
      if (r.op === "lt") return v < n;
      if (r.op === "gt") return v > n;
      if (r.op === "between" && Array.isArray(r.value)) { const [a, b] = r.value.map(Number); return v >= a && v <= b; }
      return true;
    }
    case "date": {
      const day = String(v ?? "").slice(0, 10);
      if (!day) return false;
      if (r.op === "before") return day < String(r.value ?? "");
      if (r.op === "after") return day > String(r.value ?? "");
      if (r.op === "between" && Array.isArray(r.value)) { const [a, b] = r.value.map(String); return day >= a && day <= b; }
      return true;
    }
  }
}

export function evaluateFilter(g: FilterGroup, s: FilterableShot): boolean {
  if (g.rules.length === 0) return true;
  const results = g.rules.map((r) => (isGroup(r) ? evaluateFilter(r, s) : evaluateRule(r, s)));
  return g.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

const MAX_DEPTH = 4;
const MAX_RULES = 60;

/** Structural validation for saved views. Returns an error message or null. */
export function validateFilter(v: unknown, depth = 0, counter = { n: 0 }): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "filter must be an object";
  const g = v as Record<string, unknown>;
  if (g.match !== "all" && g.match !== "any") return "match must be all or any";
  if (!Array.isArray(g.rules)) return "rules must be an array";
  if (depth > MAX_DEPTH) return "filter nested too deep";
  for (const r of g.rules) {
    if (++counter.n > MAX_RULES) return "too many rules";
    if (typeof r !== "object" || r === null) return "rule must be an object";
    const rr = r as Record<string, unknown>;
    if ("rules" in rr) { const err = validateFilter(rr, depth + 1, counter); if (err) return err; continue; }
    const f = typeof rr.field === "string" ? filterField(rr.field) : undefined;
    if (!f) return `unknown field ${String(rr.field)}`;
    if (!OPS_BY_KIND[f.kind].includes(rr.op as FilterOp)) return `operator ${String(rr.op)} not valid for ${f.label}`;
    if (rr.value !== undefined && typeof rr.value !== "string" && typeof rr.value !== "number" && !Array.isArray(rr.value)) return `bad value for ${f.label}`;
    if (Array.isArray(rr.value) && rr.value.length > 200) return `too many values for ${f.label}`;
  }
  return null;
}

export const emptyFilter = (): FilterGroup => ({ match: "all", rules: [] });
