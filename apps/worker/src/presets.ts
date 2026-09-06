import { assertNumber, assertString, assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";

export interface PresetRow {
  id: string;
  name: string;
  sensor_width_mm: number;
  sensor_height_mm: number;
  speedbooster_factor: number;
  created_at: string;
}

export function registerPresetRoutes(r: Router<Ctx>) {
  r.on("GET", "/api/presets", async ({ env }) => {
    const { results } = await env.DB.prepare("SELECT * FROM presets ORDER BY created_at DESC").all<PresetRow>();
    return json({ presets: results });
  });

  // Upsert. The client owns the id so offline-created presets can be synced later.
  r.on("PUT", "/api/presets/:id", async ({ env, request }, { id }) => {
    const pid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const name = assertString(b.name, "name", 80);
    const w = assertNumber(b.sensor_width_mm, "sensor_width_mm", { min: 1, max: 100 });
    const h = assertNumber(b.sensor_height_mm, "sensor_height_mm", { min: 1, max: 100 });
    const sb = assertNumber(b.speedbooster_factor ?? 1, "speedbooster_factor", { min: 0.3, max: 2 });

    await env.DB.prepare(
      `INSERT INTO presets (id, name, sensor_width_mm, sensor_height_mm, speedbooster_factor)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET name = ?2, sensor_width_mm = ?3, sensor_height_mm = ?4, speedbooster_factor = ?5`,
    ).bind(pid, name, w, h, sb).run();

    const row = await env.DB.prepare("SELECT * FROM presets WHERE id = ?1").bind(pid).first<PresetRow>();
    return json({ preset: row });
  });

  r.on("DELETE", "/api/presets/:id", async ({ env }, { id }) => {
    const pid = assertUuid(id, "id");
    const res = await env.DB.prepare("DELETE FROM presets WHERE id = ?1").bind(pid).run();
    if (!res.meta.changes) throw new HttpError(404, "preset not found");
    // shots.preset_id becomes NULL via ON DELETE SET NULL; the framing snapshot in
    // extra_metadata keeps the historical config.
    return json({ deleted: pid });
  });
}
