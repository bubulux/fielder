import { test } from "node:test";
import assert from "node:assert/strict";
import { extraSummary, pruneExtra, selectOptions, validateFieldDef, validateValues, type FieldDef } from "./fields.ts";
import { evaluateFilter, extraFilterFields, type FilterableShot } from "./filter.ts";

const ubahn: FieldDef = {
  key: "ubahn", label: "U-Bahn", type: "group", fields: [
    { key: "line", label: "Line", type: "select", options: ["U1", "U4"] },
    { key: "station", label: "Station", type: "select", optionsBy: { field: "line", options: { U1: ["Kurfürstendamm"], U4: ["Nollendorfplatz", "Bayerischer Platz"] } } },
  ],
};
const notes: FieldDef = { key: "access", label: "Access", type: "text" };

test("a valid nested definition passes", () => {
  assert.equal(validateFieldDef(ubahn), null);
});

test("definition errors name the path", () => {
  assert.match(validateFieldDef({ key: "Bad", label: "x", type: "text" }) ?? "", /key must be lowercase/);
  assert.match(validateFieldDef({ ...ubahn, fields: [{ key: "s", label: "S", type: "select", optionsBy: { field: "nope", options: {} } }] }) ?? "", /ubahn\.s: optionsBy\.field "nope"/);
  assert.match(validateFieldDef({ key: "a", label: "A", type: "select" }) ?? "", /exactly one of options or optionsBy/);
  assert.match(validateFieldDef({ key: "a", label: "A", type: "text", options: ["x"] }) ?? "", /only apply to selects/);
});

test("dependent select options follow the sibling value", () => {
  const station = ubahn.fields![1];
  assert.deepEqual(selectOptions(station, { line: "U4" }), ["Nollendorfplatz", "Bayerischer Platz"]);
  assert.deepEqual(selectOptions(station, {}), []);
});

test("values are validated against the definitions", () => {
  assert.equal(validateValues([ubahn, notes], { ubahn: { line: "U4", station: "Nollendorfplatz" }, access: "key at the gate" }), null);
  assert.match(validateValues([ubahn], { ubahn: { line: "U1", station: "Nollendorfplatz" } }) ?? "", /extra\.ubahn\.station/);
  assert.match(validateValues([ubahn], { other: 1 }) ?? "", /no such field/);
});

test("prune drops empty values and groups; summary uses labels", () => {
  const pruned = pruneExtra({ ubahn: { line: "U4", station: "" }, access: "", empty: {} });
  assert.deepEqual(pruned, { ubahn: { line: "U4" } });
  assert.equal(extraSummary([ubahn], pruned), "U-Bahn › Line: U4");
});

test("filters reach nested extra values", () => {
  const extra = extraFilterFields([ubahn, notes]);
  assert.deepEqual(extra.map((f) => f.id), ["extra.ubahn.line", "extra.ubahn.station", "extra.access"]);
  const shot = { extra: { ubahn: { line: "U4", station: "Nollendorfplatz" } } } as unknown as FilterableShot;
  assert.equal(evaluateFilter({ match: "all", rules: [{ field: "extra.ubahn.station", op: "is", value: "Nollendorfplatz" }] }, shot, extra), true);
  assert.equal(evaluateFilter({ match: "all", rules: [{ field: "extra.ubahn.line", op: "is", value: "U1" }] }, shot, extra), false);
});
