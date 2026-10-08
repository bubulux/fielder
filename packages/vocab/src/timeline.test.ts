import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLayoutProblem, splitDuration, validateGroup } from "./timeline.ts";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test("even split adds up, remainder on the last photo", () => {
  assert.deepEqual(splitDuration(9000, 3, "even", 1.5), [3000, 3000, 3000]);
  assert.deepEqual(splitDuration(10000, 3, "even", 1.5), [3300, 3300, 3400]);
  assert.equal(sum(splitDuration(12345, 7, "even", 1)), 12300);
});

test("edges give the first and last photo more", () => {
  const p = splitDuration(10000, 4, "edges", 1.5); // shares 1.5 1 1 1.5 of 5
  assert.deepEqual(p, [3000, 2000, 2000, 3000]);
  const q = splitDuration(10000, 4, "edges", 1);
  assert.deepEqual(q, splitDuration(10000, 4, "even", 1));
  assert.deepEqual(splitDuration(6000, 2, "edges", 3), [3000, 3000]);
  assert.deepEqual(splitDuration(5000, 1, "edges", 2), [5000]);
});

test("every photo keeps at least 100 ms", () => {
  assert.deepEqual(splitDuration(200, 4, "edges", 3), [100, 100, 100, 100]);
  assert.deepEqual(splitDuration(0, 0, "even", 1), []);
});

test("group validation and layout", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(validateGroup({ id, mode: "total", total_ms: 9000, split: "edges", edge_weight: 1.5 }), null);
  assert.match(validateGroup({ id, mode: "both", total_ms: 9000, split: "even", edge_weight: 1 })!, /mode/);
  assert.match(validateGroup({ id, mode: "each", total_ms: 9000, split: "even", edge_weight: 4 })!, /edge_weight/);
  assert.equal(groupLayoutProblem([{ group_id: "g", shot_id: "s" }, { group_id: "g", shot_id: "s" }, { group_id: null, shot_id: null }]), null);
  assert.match(groupLayoutProblem([{ group_id: "g", shot_id: "s" }, { group_id: null, shot_id: "t" }, { group_id: "g", shot_id: "s" }])!, /adjacent/);
  assert.match(groupLayoutProblem([{ group_id: "g", shot_id: "s" }, { group_id: "g", shot_id: "t" }])!, /one shot/);
  assert.match(groupLayoutProblem([{ group_id: "g", shot_id: null }])!, /placeholder/);
});
