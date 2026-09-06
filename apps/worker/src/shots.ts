import { assertIsoTimestamp, assertNumber, assertUuid, HttpError, json, type Router } from "./http.ts";
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
  preset_name?: string | null;
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
  };
}

const LIST_SQL = `SELECT s.*, p.name AS preset_name
  FROM shots s LEFT JOIN presets p ON p.id = s.preset_id`;

export function registerShotRoutes(r: Router<Ctx>) {
  // Newest first, keyset-paginated on (timestamp, id). Pass ?before=<timestamp>&before_id=<id>.
  r.on("GET", "/api/shots", async ({ env, url }) => {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("before_id") ?? "";
    const stmt = before
      ? env.DB.prepare(`${LIST_SQL} WHERE (s.timestamp < ?1 OR (s.timestamp = ?1 AND s.id < ?2))
                        ORDER BY s.timestamp DESC, s.id DESC LIMIT ?3`).bind(before, beforeId, limit)
      : env.DB.prepare(`${LIST_SQL} ORDER BY s.timestamp DESC, s.id DESC LIMIT ?1`).bind(limit);
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
   *     { id, timestamp, lat, lon, lens_mm, preset_id?, extra_metadata? }
   *     extra_metadata is free-form; the client puts the framing snapshot in
   *     extra_metadata.framing. Future tags (time_of_day, weather, ...) go here too.
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

    const existing = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(id).first<ShotRow>();
    if (existing) return json({ shot: toApi(existing), duplicate: true });

    if (presetId) {
      const p = await env.DB.prepare("SELECT 1 FROM presets WHERE id = ?1").bind(presetId).first();
      if (!p) throw new HttpError(400, "preset_id does not exist");
    }

    const key = objectKey(id, image.type);
    await env.SHOTS_BUCKET.put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: { shot_id: id, timestamp },
    });
    try {
      await env.DB.prepare(
        `INSERT INTO shots (id, timestamp, lat, lon, preset_id, lens_mm, r2_object_key, extra_metadata)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(id, timestamp, lat, lon, presetId, lensMm, key, extraJson).run();
    } catch (err) {
      await env.SHOTS_BUCKET.delete(key).catch(() => {});
      throw err;
    }

    const row = await env.DB.prepare(`${LIST_SQL} WHERE s.id = ?1`).bind(id).first<ShotRow>();
    return json({ shot: toApi(row!) }, 201);
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
