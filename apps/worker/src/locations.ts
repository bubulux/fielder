import { BERLIN_DISTRICTS } from "@fielder/vocab";
import { assertEnum, assertString, assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";

export interface LocationRow {
  id: string;
  name: string;
  district: string;
  created_at: string;
  updated_at: string | null;
  shot_count?: number;
  approved_count?: number;
}

const LIST_SQL = `SELECT l.*, count(s.id) AS shot_count, coalesce(sum(s.state = 'approved'), 0) AS approved_count
  FROM locations l LEFT JOIN shots s ON s.location_id = l.id`;

export function registerLocationRoutes(r: Router<Ctx>) {
  r.on("GET", "/api/locations", async ({ env }) => {
    const { results } = await env.DB.prepare(`${LIST_SQL} GROUP BY l.id ORDER BY l.name COLLATE NOCASE`).all<LocationRow>();
    return json({ locations: results });
  });

  // Upsert; the client owns the id so offline-created locations can be synced later.
  // Names are unique case-insensitively: a clash with another location answers 409 + existing_id
  // so the client can adopt that location instead.
  r.on("PUT", "/api/locations/:id", async ({ env, request }, { id }) => {
    const lid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const name = assertString(b.name, "name", 80);
    const district = assertEnum(b.district, "district", BERLIN_DISTRICTS);
    const clash = await env.DB.prepare("SELECT id FROM locations WHERE name = ?1 COLLATE NOCASE AND id != ?2").bind(name, lid).first<{ id: string }>();
    if (clash) return json({ error: "a location with this name already exists", existing_id: clash.id }, 409);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO locations (id, name, district, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET name = ?2, district = ?3, updated_at = ?4`,
    ).bind(lid, name, district, now).run();
    const row = await env.DB.prepare(`${LIST_SQL} WHERE l.id = ?1 GROUP BY l.id`).bind(lid).first<LocationRow>();
    return json({ location: row });
  });

  r.on("DELETE", "/api/locations/:id", async ({ env }, { id }) => {
    const lid = assertUuid(id, "id");
    const res = await env.DB.prepare("DELETE FROM locations WHERE id = ?1").bind(lid).run();
    if (!res.meta.changes) throw new HttpError(404, "location not found");
    // shots.location_id becomes NULL via ON DELETE SET NULL; the photos stay.
    return json({ deleted: lid });
  });
}
