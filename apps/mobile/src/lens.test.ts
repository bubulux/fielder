import { test } from "node:test";
import assert from "node:assert/strict";
import { clampToRange, lensList, stepLens } from "./lens.ts";

test("lens list without a range is the full preset list", () => {
  assert.deepEqual(lensList(null), [12, 14, 16, 18, 20, 24, 28, 35, 40, 50, 58, 85, 105, 135]);
});

test("lens list inside a range keeps presets and adds the endpoints", () => {
  assert.deepEqual(lensList({ min: 18, max: 35 }), [18, 20, 24, 28, 35]);
  assert.deepEqual(lensList({ min: 24, max: 70 }), [24, 28, 35, 40, 50, 58, 70]);
  assert.deepEqual(lensList({ min: 200, max: 400 }), [200, 400]);
});

test("clamp keeps a lens inside the rig range", () => {
  assert.equal(clampToRange(50, { min: 18, max: 35 }), 35);
  assert.equal(clampToRange(12, { min: 18, max: 35 }), 18);
  assert.equal(clampToRange(24, { min: 18, max: 35 }), 24);
  assert.equal(clampToRange(500, null), 500);
});

test("stepping stops at the ends and snaps custom values to neighbours", () => {
  const list = lensList({ min: 18, max: 35 });
  assert.equal(stepLens(list, 35, 1), 35);
  assert.equal(stepLens(list, 18, -1), 18);
  assert.equal(stepLens(list, 22, 1), 24);
  assert.equal(stepLens(list, 22, -1), 20);
});
