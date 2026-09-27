import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFraming, overlayRect, phoneViewFromEquivalent, phoneViewFromFrame, reframe, rotateFov } from "./fov.ts";
import { FULL_FRAME } from "./presets.ts";
import { CAMERAS, describeRig, findFormat } from "./cameras.ts";

const near = (a: number, b: number, tol = 0.05) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

const mft = findFormat("mft", "4-3")!;

test("50mm on full frame, no booster: textbook FOV", () => {
  const r = computeFraming({ sensor: FULL_FRAME, speedboosterFactor: 1 }, 50);
  near(r.fov.horizontal, 39.6);
  near(r.fov.vertical, 27.0);
  near(r.fov.diagonal, 46.8);
  near(r.sensorCropFactor, 1, 1e-9);
  near(r.fullFrameEquivalentMm, 50, 1e-9);
});

test("MFT crop factor ≈ 2.0; 0.64 booster brings 50mm to 32mm effective", () => {
  const r = computeFraming({ sensor: mft, speedboosterFactor: 0.64 }, 50);
  near(r.sensorCropFactor, 2.0, 0.02);
  near(r.effectiveFocalLengthMm, 32, 1e-6);
  near(r.effectiveCropFactor, 1.28, 0.02);
  near(r.fullFrameEquivalentMm, 64, 1);
  // Same FOV as a 32mm lens on the bare sensor.
  const bare = computeFraming({ sensor: mft, speedboosterFactor: 1 }, 32);
  near(r.fov.horizontal, bare.fov.horizontal, 1e-9);
});

test("FOV and full-frame equivalent agree with each other", () => {
  // Real-world check from the field: Pocket 4K (4K DCI) + 0.64 booster + 18mm.
  const r = computeFraming({ sensor: { widthMm: 18.96, heightMm: 10 }, speedboosterFactor: 0.64 }, 18);
  near(r.effectiveFocalLengthMm, 11.52, 1e-6);
  near(r.fov.horizontal, 78.9, 0.2);
  // The FF-equivalent lens must produce the same horizontal FOV on a sensor of the same aspect and FF diagonal.
  const ffDiag = Math.hypot(36, 24);
  const aspect = 18.96 / 10;
  const eqSensor = { widthMm: ffDiag * aspect / Math.hypot(aspect, 1), heightMm: ffDiag / Math.hypot(aspect, 1) };
  const eq = computeFraming({ sensor: eqSensor, speedboosterFactor: 1 }, r.fullFrameEquivalentMm);
  near(eq.fov.horizontal, r.fov.horizontal, 1e-9);
});

test("rejects invalid inputs", () => {
  assert.throws(() => computeFraming({ sensor: mft, speedboosterFactor: 0 }, 50), RangeError);
  assert.throws(() => computeFraming({ sensor: mft, speedboosterFactor: 1 }, -1), RangeError);
});

test("overlay: identical FOV fills the preview exactly", () => {
  const rect = overlayRect({ horizontal: 60, vertical: 45 }, { horizontalFovDeg: 60, verticalFovDeg: 45 });
  near(rect.widthFraction, 1, 1e-9);
  near(rect.heightFraction, 1, 1e-9);
  assert.equal(rect.exceedsPreview, false);
});

test("overlay: rig wider than phone is flagged", () => {
  const rect = overlayRect({ horizontal: 90, vertical: 45 }, { horizontalFovDeg: 60, verticalFovDeg: 45 });
  assert.ok(rect.widthFraction > 1);
  assert.equal(rect.exceedsPreview, true);
});

test("overlay scales with tan, not linearly in degrees", () => {
  // Rig sensor = a 4:3 sensor with the full-frame diagonal, i.e. the same geometry
  // the phone's "35mm equivalent" is defined against. Then the tangent ratio is
  // exactly focal ratio 26/50 on both axes.
  const ffDiag = Math.hypot(36, 24);
  const sensor = { widthMm: ffDiag * 0.8, heightMm: ffDiag * 0.6 };
  const phone = phoneViewFromEquivalent(26, 4 / 3);
  const rig = computeFraming({ sensor, speedboosterFactor: 1 }, 50).fov;
  const rect = overlayRect(rig, phone);
  near(rect.widthFraction, 26 / 50, 1e-9);
  near(rect.heightFraction, 26 / 50, 1e-9);
  // Sanity: 26mm equiv on 4:3 ≈ 67° horizontal.
  near(phone.horizontalFovDeg, 67.4, 0.2);
});

test("phone view: portrait preview swaps axes", () => {
  const land = phoneViewFromEquivalent(26, 4 / 3);
  const port = phoneViewFromEquivalent(26, 3 / 4);
  near(port.horizontalFovDeg, land.verticalFovDeg, 1e-9);
  near(port.verticalFovDeg, land.horizontalFovDeg, 1e-9);
  const rot = rotateFov({ horizontal: 10, vertical: 20 });
  assert.deepEqual(rot, { horizontal: 20, vertical: 10 });
});

test("phone view: 16:9 preview crops the vertical axis of a 4:3 sensor", () => {
  const p43 = phoneViewFromEquivalent(26, 4 / 3);
  const p169 = phoneViewFromEquivalent(26, 16 / 9);
  near(p169.horizontalFovDeg, p43.horizontalFovDeg, 1e-9);
  assert.ok(p169.verticalFovDeg < p43.verticalFovDeg);
});

test("camera formats: Pocket 4K DCI is 18.96 × 10, Pocket 6K UHD is a windowed crop", () => {
  const dci = findFormat("bmpcc4k", "4k-dci")!;
  near(dci.widthMm, 18.96, 0.01); near(dci.heightMm, 10, 0.01);
  const uhd6k = findFormat("bmpcc6k", "uhd")!;
  assert.equal(uhd6k.windowed, true);
  assert.ok(uhd6k.widthMm < findFormat("bmpcc6k", "6k")!.widthMm);
  assert.equal(findFormat("nope", "x"), null);
  assert.equal(describeRig("bmpcc4k", "4k-dci", 1, 1), "Blackmagic Pocket 4K · 4K DCI 4096×2160");
  assert.equal(describeRig(null, null, 20, 11), "Custom 20 × 11 mm");
  for (const c of CAMERAS) for (const f of c.formats) assert.ok(f.widthMm > f.heightMm && f.widthMm < 40, `${c.id}/${f.id}`);
});

test("reframe: the source rig lands on its own frame, a longer lens frames tighter", () => {
  const rig = { sensor: { widthMm: 23.1, heightMm: 12.99 }, speedboosterFactor: 1 };
  const frame = { widthFraction: 0.6, heightFraction: 0.45 };
  const same = reframe({ rig, lensMm: 24 }, frame, { rig, lensMm: 24 });
  near(same.widthFraction, 0.6, 1e-9);
  near(same.heightFraction, 0.45, 1e-9);
  const tele = reframe({ rig, lensMm: 24 }, frame, { rig, lensMm: 48 });
  assert.ok(tele.widthFraction < 0.31 && tele.widthFraction > 0.29, `48 mm ~ half of 24 mm width, got ${tele.widthFraction}`);
  const wide = reframe({ rig, lensMm: 24 }, frame, { rig, lensMm: 8 });
  assert.equal(wide.exceedsPreview, true);
});

test("phoneViewFromFrame inverts overlayRect", () => {
  const phone = { horizontalFovDeg: 66, verticalFovDeg: 52 };
  const rigFov = { horizontal: 40, vertical: 23 };
  const r = overlayRect(rigFov, phone);
  const back = phoneViewFromFrame(rigFov, r);
  near(back.horizontalFovDeg, 66, 1e-9);
  near(back.verticalFovDeg, 52, 1e-9);
});
