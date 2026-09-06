import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOverlay, previewBox } from "./framing.ts";
import { DEFAULT_SETTINGS } from "./defaults.ts";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const ff = { id: "p", name: "FF", sensorWidthMm: 36, sensorHeightMm: 24, speedboosterFactor: 1, createdAt: "", synced: true };

test("previewBox: portrait window gets a 3:4 box limited by width", () => {
  const b = previewBox({ width: 1080, height: 2400 });
  near(b.width, 1080); near(b.height, 1440);
});
test("previewBox: landscape window gets a 4:3 box limited by height", () => {
  const b = previewBox({ width: 2400, height: 1080 });
  near(b.height, 1080); near(b.width, 1440);
});
test("overlay is centred and landscape rig in portrait preview is wider than tall", () => {
  const preview = previewBox({ width: 1080, height: 2400 });
  const o = computeOverlay({ ...DEFAULT_SETTINGS, rigOrientation: "landscape" }, ff, 50, preview);
  assert.ok(o.rect.width > o.rect.height);
  near(o.rect.left + o.rect.width / 2, preview.width / 2);
  near(o.rect.top + o.rect.height / 2, preview.height / 2);
  assert.equal(o.exceedsPreview, false);
});
test("portrait rig swaps axes; very wide lens flags clipping", () => {
  const preview = previewBox({ width: 1080, height: 2400 });
  const land = computeOverlay(DEFAULT_SETTINGS, ff, 50, preview);
  const port = computeOverlay({ ...DEFAULT_SETTINGS, rigOrientation: "portrait" }, ff, 50, preview);
  assert.ok(port.rect.height > port.rect.width);
  // Rig hfov now spans the screen's vertical axis, scaled against the phone's vertical FOV.
  const rad = Math.PI / 180;
  const expected = Math.tan((land.framing.fov.horizontal / 2) * rad) / Math.tan((port.phoneFov.verticalFovDeg / 2) * rad);
  near(port.rect.height / preview.height, expected);
  const wide = computeOverlay(DEFAULT_SETTINGS, ff, 12, preview);
  assert.equal(wide.exceedsPreview, true);
  // Rig frame fills the limiting axis exactly; camera image is shrunk inside it, centred.
  near(Math.max(wide.rect.width / preview.width, wide.rect.height / preview.height), 1);
  assert.ok(wide.camera.width < preview.width && wide.camera.height < preview.height);
  near(wide.camera.left + wide.camera.width / 2, preview.width / 2);
  // Not exceeding: camera image is the whole box.
  const n = computeOverlay(DEFAULT_SETTINGS, ff, 50, preview);
  near(n.camera.width, preview.width); near(n.camera.left, 0);
});
