import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLight, shootableWindows, sunElevation } from "./daylight.ts";

const BERLIN = { lat: 52.52, lon: 13.405 };
const minutesApart = (a: Date | null, iso: string) => Math.abs((a?.getTime() ?? NaN) - Date.parse(iso)) / 60_000;

test("sun elevation at Berlin summer solstice noon is about 61°", () => {
  const e = sunElevation(new Date("2026-06-21T11:08:00Z"), BERLIN.lat, BERLIN.lon);
  assert.ok(Math.abs(e - 60.9) < 0.3, `got ${e}`);
});

test("Berlin sunrise/sunset on the summer solstice (published 04:43 / 21:33 CEST)", () => {
  const d = dayLight(new Date("2026-06-21T00:00:00Z"), BERLIN.lat, BERLIN.lon);
  assert.ok(minutesApart(d.sunrise, "2026-06-21T02:43:00Z") < 3, `sunrise ${d.sunrise?.toISOString()}`);
  assert.ok(minutesApart(d.sunset, "2026-06-21T19:33:00Z") < 3, `sunset ${d.sunset?.toISOString()}`);
});

test("Berlin winter solstice sunrise/sunset (published 08:15 / 15:54 CET)", () => {
  const d = dayLight(new Date("2026-12-21T00:00:00Z"), BERLIN.lat, BERLIN.lon);
  assert.ok(minutesApart(d.sunrise, "2026-12-21T07:15:00Z") < 3, `sunrise ${d.sunrise?.toISOString()}`);
  assert.ok(minutesApart(d.sunset, "2026-12-21T14:54:00Z") < 3, `sunset ${d.sunset?.toISOString()}`);
});

test("phases run night, dawn, day, dusk, night and cover the whole day", () => {
  const d = dayLight(new Date("2026-09-27T00:00:00Z"), BERLIN.lat, BERLIN.lon);
  assert.deepEqual(d.phases.map((p) => p.phase), ["night", "dawn", "day", "dusk", "night"]);
  assert.equal(d.phases[0].start.toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(d.phases.at(-1)!.end.toISOString(), "2026-09-28T00:00:00.000Z");
  const dusk = d.phases[3];
  const mins = (dusk.end.getTime() - dusk.start.getTime()) / 60_000;
  assert.ok(mins > 50 && mins < 90, `dusk lasts ${mins} min`);
});

test("shootable windows: phases unite, no light requirement means all day", () => {
  const d = dayLight(new Date("2026-09-27T00:00:00Z"), BERLIN.lat, BERLIN.lon);
  const duskNight = shootableWindows(d, ["dusk", "night"]);
  assert.equal(duskNight.length, 2); // morning night, then dusk+evening night merged
  assert.equal(duskNight[1].start.getTime(), d.phases[3].start.getTime());
  assert.equal(duskNight[1].end.toISOString(), "2026-09-28T00:00:00.000Z");
  const any = shootableWindows(d, []);
  assert.equal(any.length, 1);
});
