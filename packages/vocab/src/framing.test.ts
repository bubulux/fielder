import { test } from "node:test";
import assert from "node:assert/strict";
import { canMove, clampCentre, referencedFrame, resize, rootFrame, validateFrame, type Framing } from "./framing.ts";
import { validatePresentation } from "./compose.ts";

const fr = (id: string, frame: Framing["frame"]): Framing => ({ id, photo_id: "p", name: id, rig_id: null, lens_mm: 35, frame, position: 0, created_at: "", updated_at: null });

test("clamp: stays on the photo, cannot move where the rig sees more", () => {
  assert.deepEqual(clampCentre({ width_fraction: 0.5, height_fraction: 0.4, x: 0.1, y: 0.95 }), { x: 0.25, y: 0.8 });
  assert.deepEqual(clampCentre({ width_fraction: 1.2, height_fraction: 0.4, x: 0.1, y: 0.3 }), { x: 0.5, y: 0.3 });
  assert.deepEqual(clampCentre({ width_fraction: 0.5, height_fraction: 0.5 }), { x: 0.5, y: 0.5 });
  assert.equal(canMove({ width_fraction: 1.1, height_fraction: 1.3 }), false);
});

test("resize keeps the centre, clamped to the new size", () => {
  assert.deepEqual(resize({ width_fraction: 0.3, height_fraction: 0.3, x: 0.2, y: 0.5 }, { width_fraction: 0.6, height_fraction: 0.3 }), { width_fraction: 0.6, height_fraction: 0.3, x: 0.3, y: 0.5 });
});

test("root frame: the root framing, else as captured (centred)", () => {
  const photo = { framing: { frame: { width_fraction: 0.6, height_fraction: 0.45 } }, framings: [fr("a", { width_fraction: 0.4, height_fraction: 0.3, x: 0.3, y: 0.6 })], root_framing_id: "a" };
  assert.deepEqual(rootFrame(photo), { width_fraction: 0.4, height_fraction: 0.3, x: 0.3, y: 0.6 });
  assert.deepEqual(rootFrame({ ...photo, root_framing_id: null }), { width_fraction: 0.6, height_fraction: 0.45, x: 0.5, y: 0.5 });
  assert.deepEqual(rootFrame({ ...photo, root_framing_id: "gone" }), { width_fraction: 0.6, height_fraction: 0.45, x: 0.5, y: 0.5 });
  assert.equal(rootFrame({ framing: null }), null);
});

test("referenced frame follows the framing, falls back to the copy", () => {
  const photo = { framings: [fr("a", { width_fraction: 0.4, height_fraction: 0.3, x: 0.7, y: 0.5 })] };
  assert.equal(referencedFrame(photo, { framing_id: "a", frame: { width_fraction: 0.5, height_fraction: 0.5 } })?.x, 0.7);
  assert.equal(referencedFrame(photo, { framing_id: "deleted", frame: { width_fraction: 0.5, height_fraction: 0.5, x: 0.3 } })?.x, 0.3);
});

test("validation: centre 0..1, framing_id in presentations", () => {
  assert.equal(validateFrame({ width_fraction: 0.5, height_fraction: 0.5, x: 0.2, y: 0.9 }), null);
  assert.match(validateFrame({ width_fraction: 0.5, height_fraction: 0.5, x: 2 })!, /x must be/);
  assert.equal(validatePresentation({ mode: "fit", frame: { width_fraction: 0.5, height_fraction: 0.5, x: 0.3 }, label: null, framing_id: "abc" }), null);
  assert.match(validatePresentation({ mode: "fit", frame: { width_fraction: 0.5, height_fraction: 0.5, y: -1 }, label: null })!, /y must be/);
});
