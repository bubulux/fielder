import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRule, type FilterableShot } from "./filter.ts";
import { cameraLabel, label } from "./vocab.ts";

test("camera label: size abbreviation, support, movements in vocabulary order", () => {
  assert.equal(cameraLabel({ shot_size: "ws", camera_support: "steadicam", movement: ["push_in", "pan"] }), "WS · Steadicam · Pan / Push in");
  assert.equal(cameraLabel({ shot_size: null, camera_support: null, movement: [] }), "");
  assert.equal(label("crane"), "Crane / jib");
});

test("movement filters as a set, position as yes/no", () => {
  const shot = { movement: ["pan", "tilt"], has_position: "no" } as unknown as FilterableShot;
  assert.equal(evaluateRule({ field: "movement", op: "in", value: ["tilt", "zoom"] }, shot), true);
  assert.equal(evaluateRule({ field: "movement", op: "not_in", value: ["orbit"] }, shot), true);
  assert.equal(evaluateRule({ field: "has_position", op: "is", value: "no" }, shot), true);
});
