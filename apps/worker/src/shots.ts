import { INT_EXT, LIGHT, SHOT_STATES, validateExtra, WEATHER } from "@fielder/vocab";
import { assertEnum, assertIsoTimestamp, assertNumber, assertString, assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";

export interface ShotRow {
  id: string;
  timestamp: string;
  lat: number;
  lon: number;
  preset_id: string | null;
  lens_mm: number;
  r2_object_key: string;
  extra_metadata: string | null;
  created_at: string;
  name: string | null;
  light: string | null;
  weather: string | null;
  int_ext: string | null;
  location_id: string | null;
  state: string;
  extra: string | null;
  preset_name?: string | null;
  location_name?: string | null;
  district?: string | null;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // "low-res reference" — generous ceiling
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/webp", "image/png"]);

function objectKey(id: string, contentType: string): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `shots/${id}.${ext}`;
}

function toApi(row: ShotRow) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    lat: row.lat,
    lon: row.lon,
    preset_id: row.preset_id,
    preset_name: row.preset_name ?? null,
    lens_mm: row.lens_mm,
    image_url: `/api/shots/${row.id}/image`,
    extra_metadata: row.extra_metadata ? (JSON.parse(row.extra_metadata) as unknown) : null,
    created_at: row.created_at,
    name: row.name ?? null,
    light: row.light ?? null,
    weather: row.weather ?? null,
    int_ext: row.int_ext ?? null,
    location_id: row.location_id ?? null,
    location_name: row.location_name ?? null,
    district: row.district ?? null,
    state: row.state ?? "unreviewed",
    extra: row.extra ? (JSON.parse(row.extra) as Record<string, string>) : {},
  };
}

const LIST_SQL = `SELECT s.*, p.name AS preset_name, l.name AS location_name, l.district AS district
  FROM shots s LEFT JOIN presets p ON p.id = s.preset_id LEFT JOIN locations l ON l.id = s.location_id`;

/**
 * Scouting tags. All optional: a missing or empty field is stored as NULL so shots can be
 * uploaded untagged and completed later (PATCH). `all` = every key present (upload);
 * otherwise only the keys given are returned (patch), where null/"" clears a field.
 */
interface Tags { name: string | null; light: string | null; weather: string | null; int_ext: string | null; location_id: string | null; extra: string }

function parseTags(m: Record<string, unknown>, all: true): Tags;
function parseTags(m: Record<string, unknown>, all: false): Partial<Tags>;
function parseTags(m: Record<string, unknown>, all: boolean): Partial<Tags> {
  const out: Partial<Tags> = {};
  const want = (k: keyof Tags) => all || m[k] !== undefined;
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  if (want("name")) out.name = blank(m.name) ? null : assertString(m.name, "name", 120);
  if (want("light")) out.light = blank(m.light) ? null : assertEnum(m.light, "light", LIGHT);
  if (want("weather")) out.weather = blank(m.weather) ? null : assertEnum(m.weather, "weather", WEATHER);
  if (want("int_ext")) out.int_ext = blank(m.int_ext) ? null : assertEnum(m.int_ext, "int_ext", INT_EXT);
  if (want("location_id")) out.location_id = blank(m.location_id) ? null : assertUuid(m.location_id, "location_id");
  if (want("extra")) {
    const extra = blank(m.extra) ? {} : m.extra;
    const err = validateExtra(extra);
    if (err) throw new HttpError(400, err);
    out.extra = JSON.stringify(extra);
  }
  return out;
}

async function assertLocationExists(env: Ctx["env"], id: string) {
  const l = await env.DB.prepare("SELECT 1 FROM locations WHERE id = ?1").bind(id).first();
  if (!l) throw new HttpError(400, "location_id does not exist");
}

export function registerShotRoutes(r: Router<Ctx>) {
  // Newest first, keyset-paginated on (timestamp, id). Pass ?before=<timestamp>&before_id=<id>.
  // Optional filters: ?state=approved&location_id=<uuid>
  r.on("GET", "/api/shots", async ({ env, url }) => {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("before_id") ?? "";
    const where: string[] = [];
    const args: unknown[] = [];
    if (before) { args.push(before, beforeId); where.push(`(s.timestamp < ?${args.length - 1} OR (s.timestamp = ?${args.length - 1} AND s.id < ?${args.length}))`); }
    const state = url.searchParams.get("state");
    if (state) { args.push(assertEnum(state, "state", SHOT_STATES)); where.push(`s.state = ?${args.length}`); }
    const loc = url.searchParams.get("location_id");
    if (loc) { args.push(assertUuid(loc, "location_id")); where.push(`s.location_id = ?${args.length}`); }
    args.push(limit);
    const stmt = env.DB.prepare(`${LIST_SQL}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY s.timestamp DESC, s.id DESC LIMIT ?${args.length}`).bind(...args);
    const { results } = await stmt.all<ShotRow>();
    const last = results.at(-1);
    return json({
      shots: results.map(toApi),
      next: results.length === limit && last ? { before: last.timestamp, before_id: last.id } : null,
    });
  });

  r.on("GET", "/api/shots/:id", async ({ env }, { id }) => {
    const sid = assertUuid(id, "id");
    const row = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(sid).first<ShotRow>();
    if (!row) throw new HttpError(404, "shot not found");
    return json({ shot: toApi(row) });
  });

  // Same-origin image delivery so the dashboard can use plain <img> tags behind Access.
  r.on("GET", "/api/shots/:id/image", async ({ env, request }, { id }) => {
    const sid = assertUuid(id, "id");
    const row = await env.DB.prepare("SELECT r2_object_key FROM shots WHERE id = ?1").bind(sid).first<{ r2_object_key: string }>();
    if (!row) throw new HttpError(404, "shot not found");
    const obj = await env.SHOTS_BUCKET.get(row.r2_object_key, {
      onlyIf: request.headers,
    });
    if (!obj) throw new HttpError(404, "image missing in storage");
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  });

  /**
   * multipart/form-data:
   *   image     file (jpeg/webp/png, <= 3 MB)
   *   metadata  JSON string:
   *     { id, timestamp, lat, lon, lens_mm, preset_id?, extra_metadata?,
   *       name?, light?, weather?, int_ext?, location_id?, extra? }   (tags are optional, NULL when absent)
   *     extra_metadata is free-form; the client puts the framing snapshot in
   *     extra_metadata.framing.
   * New shots always start in state "unreviewed".
   * Idempotent on id: re-uploading an existing id returns 200 with the stored row.
   */
  r.on("POST", "/api/shots", async ({ env, request }) => {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.startsWith("multipart/form-data")) throw new HttpError(415, "expected multipart/form-data");
    const form = await request.formData();
    const image = form.get("image");
    const metaRaw = form.get("metadata");
    if (!(image instanceof File)) throw new HttpError(400, "image file missing");
    if (typeof metaRaw !== "string") throw new HttpError(400, "metadata field missing");
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) throw new HttpError(415, `unsupported image type ${image.type || "(none)"}`);
    if (image.size === 0 || image.size > MAX_IMAGE_BYTES) throw new HttpError(413, "image empty or too large");

    let m: Record<string, unknown>;
    try { m = JSON.parse(metaRaw) as Record<string, unknown>; } catch { throw new HttpError(400, "metadata is not JSON"); }

    const id = assertUuid(m.id, "id");
    const timestamp = assertIsoTimestamp(m.timestamp, "timestamp");
    const lat = assertNumber(m.lat, "lat", { min: -90, max: 90 });
    const lon = assertNumber(m.lon, "lon", { min: -180, max: 180 });
    const lensMm = assertNumber(m.lens_mm, "lens_mm", { min: 1, max: 2000 });
    const presetId = m.preset_id == null ? null : assertUuid(m.preset_id, "preset_id");
    const extra = m.extra_metadata === undefined || m.extra_metadata === null ? null : m.extra_metadata;
    if (extra !== null && (typeof extra !== "object" || Array.isArray(extra))) throw new HttpError(400, "extra_metadata must be an object");
    const extraJson = extra === null ? null : JSON.stringify(extra);
    if (extraJson && extraJson.length > 64 * 1024) throw new HttpError(413, "extra_metadata too large");
    const tags = parseTags(m, true);

    const existing = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(id).first<ShotRow>();
    if (existing) return json({ shot: toApi(existing), duplicate: true });

    if (presetId) {
      const p = await env.DB.prepare("SELECT 1 FROM presets WHERE id = ?1").bind(presetId).first();
      if (!p) throw new HttpError(400, "preset_id does not exist");
    }
    if (tags.location_id) await assertLocationExists(env, tags.location_id);

    const key = objectKey(id, image.type);
    await env.SHOTS_BUCKET.put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: { shot_id: id, timestamp },
    });
    try {
      await env.DB.prepare(
        `INSERT INTO shots (id, timestamp, lat, lon, preset_id, lens_mm, r2_object_key, extra_metadata,
                            name, light, weather, int_ext, location_id, state, extra)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'unreviewed', ?14)`,
      ).bind(id, timestamp, lat, lon, presetId, lensMm, key, extraJson, tags.name, tags.light, tags.weather, tags.int_ext, tags.location_id, tags.extra).run();
    } catch (err) {
      await env.SHOTS_BUCKET.delete(key).catch(() => {});
      throw err;
    }

    const row = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(id).first<ShotRow>();
    return json({ shot: toApi(row!) }, 201);
  });

  /** Edit tags and/or review state. JSON body with any of name, light, weather, int_ext, location_id, state. */
  r.on("PATCH", "/api/shots/:id", async ({ env, request }, { id }) => {
    const sid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const tags = parseTags(b, false);
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const [k, v] of Object.entries(tags)) { args.push(v); sets.push(`${k} = ?${args.length}`); }
    if (b.state !== undefined) { args.push(assertEnum(b.state, "state", SHOT_STATES)); sets.push(`state = ?${args.length}`); }
    if (sets.length === 0) throw new HttpError(400, "nothing to update");
    if (tags.location_id) await assertLocationExists(env, tags.location_id);
    args.push(sid);
    const res = await env.DB.prepare(`UPDATE shots SET ${sets.join(", ")} WHERE id = ?${args.length}`).bind(...args).run();
    if (!res.meta.changes) throw new HttpError(404, "shot not found");
    const row = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(sid).first<ShotRow>();
    return json({ shot: toApi(row!) });
  });

  r.on("DELETE", "/api/shots/:id", async ({ env }, { id }) => {
    const sid = assertUuid(id, "id");
    const row = await env.DB.prepare("SELECT r2_object_key FROM shots WHERE id = ?1").bind(sid).first<{ r2_object_key: string }>();
    if (!row) throw new HttpError(404, "shot not found");
    await env.DB.prepare("DELETE FROM shots WHERE id = ?1").bind(sid).run();
    await env.SHOTS_BUCKET.delete(row.r2_object_key);
    return json({ deleted: sid });
  });
}
