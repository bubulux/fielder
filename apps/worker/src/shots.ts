import { INT_EXT, LIGHT, SHOT_STATES, validateExtra, WEATHER, type Extra } from "@fielder/vocab";
import { assertEnum, assertIsoTimestamp, assertNumber, assertString, assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";
import { assertProjectExists } from "./projects.ts";

interface ShotRow {
  id: string;
  project_id: string;
  location_id: string | null;
  name: string | null;
  int_ext: string | null;
  light: string;
  artificial: number;
  weather: string | null;
  state: string;
  extra: string;
  captured_at: string;
  created_at: string;
  updated_at: string | null;
  project_name: string | null;
  location_name: string | null;
}

interface PhotoRow {
  id: string;
  shot_id: string;
  ordinal: number;
  timestamp: string;
  lat: number;
  lon: number;
  gps_accuracy_m: number | null;
  position_corrected: number;
  preset_id: string | null;
  preset_name: string | null;
  lens_mm: number;
  r2_object_key: string;
  width: number | null;
  height: number | null;
  framing: string | null;
  device: string | null;
  created_at: string;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // "low-res reference" — generous ceiling
const MAX_PHOTOS_PER_UPLOAD = 60;
const MAX_JSON_BYTES = 16 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/webp", "image/png"]);

function objectKey(photoId: string, contentType: string): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `photos/${photoId}.${ext}`;
}

const parseJson = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

function photoToApi(p: PhotoRow) {
  return {
    id: p.id,
    shot_id: p.shot_id,
    ordinal: p.ordinal,
    timestamp: p.timestamp,
    lat: p.lat,
    lon: p.lon,
    gps_accuracy_m: p.gps_accuracy_m,
    position_corrected: p.position_corrected === 1,
    preset_id: p.preset_id,
    preset_name: p.preset_name ?? null,
    lens_mm: p.lens_mm,
    width: p.width,
    height: p.height,
    framing: parseJson<Record<string, unknown>>(p.framing),
    device: parseJson<Record<string, unknown>>(p.device),
    image_url: `/api/photos/${p.id}/image`,
    created_at: p.created_at,
  };
}

function shotToApi(s: ShotRow, photos: PhotoRow[]) {
  return {
    id: s.id,
    project_id: s.project_id,
    project_name: s.project_name ?? null,
    location_id: s.location_id,
    location_name: s.location_name ?? null,
    name: s.name,
    int_ext: s.int_ext,
    light: JSON.parse(s.light) as string[],
    artificial: s.artificial === 1,
    weather: s.weather,
    state: s.state,
    extra: JSON.parse(s.extra) as Extra,
    captured_at: s.captured_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
    photos: photos.map(photoToApi),
  };
}

const SHOT_SQL = `SELECT s.*, pr.name AS project_name, l.name AS location_name
  FROM shots s JOIN projects pr ON pr.id = s.project_id LEFT JOIN locations l ON l.id = s.location_id`;

/** Photos for many shots in one query (json_each keeps it to one bound parameter; D1 caps those at 100). */
async function photosFor(env: Ctx["env"], shotIds: string[]): Promise<Map<string, PhotoRow[]>> {
  const out = new Map<string, PhotoRow[]>();
  if (shotIds.length === 0) return out;
  const { results } = await env.DB.prepare(
    `SELECT ph.*, p.name AS preset_name FROM photos ph LEFT JOIN presets p ON p.id = ph.preset_id
     WHERE ph.shot_id IN (SELECT value FROM json_each(?1)) ORDER BY ph.shot_id, ph.ordinal`,
  ).bind(JSON.stringify(shotIds)).all<PhotoRow>();
  for (const p of results) out.set(p.shot_id, [...(out.get(p.shot_id) ?? []), p]);
  return out;
}

async function loadShot(env: Ctx["env"], id: string) {
  const row = await env.DB.prepare(`${SHOT_SQL} WHERE s.id = ?1`).bind(id).first<ShotRow>();
  if (!row) return null;
  return shotToApi(row, (await photosFor(env, [id])).get(id) ?? []);
}

/**
 * Scouting tags. All optional: a missing or empty field is stored as NULL (or [] / {} / false) so
 * shots can be uploaded untagged and completed later (PATCH). `all` = every key present (upload);
 * otherwise only the keys given are returned (patch), where null/"" clears a field.
 */
interface Tags { name: string | null; light: string; artificial: number; weather: string | null; int_ext: string | null; location_id: string | null; extra: string }

function parseTags(m: Record<string, unknown>, all: true): Tags;
function parseTags(m: Record<string, unknown>, all: false): Partial<Tags>;
function parseTags(m: Record<string, unknown>, all: boolean): Partial<Tags> {
  const out: Partial<Tags> = {};
  const want = (k: keyof Tags) => all || m[k] !== undefined;
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  if (want("name")) out.name = blank(m.name) ? null : assertString(m.name, "name", 120);
  if (want("light")) {
    const v = blank(m.light) ? [] : m.light;
    if (!Array.isArray(v)) throw new HttpError(400, "light must be an array");
    for (const x of v) assertEnum(x, "light", LIGHT);
    out.light = JSON.stringify(LIGHT.filter((l) => v.includes(l))); // dedupe, canonical order
  }
  if (want("artificial")) {
    if (!blank(m.artificial) && typeof m.artificial !== "boolean") throw new HttpError(400, "artificial must be a boolean");
    out.artificial = m.artificial === true ? 1 : 0;
  }
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

function optionalJson(v: unknown, field: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, `${field} must be an object`);
  const s = JSON.stringify(v);
  if (s.length > MAX_JSON_BYTES) throw new HttpError(413, `${field} too large`);
  return s;
}

interface PhotoInput {
  id: string; ordinal: number; timestamp: string; lat: number; lon: number; gps_accuracy_m: number | null;
  preset_id: string | null; lens_mm: number; width: number | null; height: number | null; framing: string | null; device: string | null;
}

function parsePhoto(v: unknown, i: number): PhotoInput {
  if (typeof v !== "object" || v === null) throw new HttpError(400, `photos[${i}] must be an object`);
  const p = v as Record<string, unknown>;
  const optNum = (x: unknown, f: string, o: { min: number; max: number }) => (x === undefined || x === null ? null : assertNumber(x, f, o));
  return {
    id: assertUuid(p.id, `photos[${i}].id`),
    ordinal: assertNumber(p.ordinal, `photos[${i}].ordinal`, { min: 0, max: 10_000 }),
    timestamp: assertIsoTimestamp(p.timestamp, `photos[${i}].timestamp`),
    lat: assertNumber(p.lat, `photos[${i}].lat`, { min: -90, max: 90 }),
    lon: assertNumber(p.lon, `photos[${i}].lon`, { min: -180, max: 180 }),
    gps_accuracy_m: optNum(p.gps_accuracy_m, `photos[${i}].gps_accuracy_m`, { min: 0, max: 100_000 }),
    preset_id: p.preset_id == null ? null : assertUuid(p.preset_id, `photos[${i}].preset_id`),
    lens_mm: assertNumber(p.lens_mm, `photos[${i}].lens_mm`, { min: 1, max: 2000 }),
    width: optNum(p.width, `photos[${i}].width`, { min: 1, max: 20_000 }),
    height: optNum(p.height, `photos[${i}].height`, { min: 1, max: 20_000 }),
    framing: optionalJson(p.framing, `photos[${i}].framing`),
    device: optionalJson(p.device, `photos[${i}].device`),
  };
}

async function assertLocationExists(env: Ctx["env"], id: string) {
  const l = await env.DB.prepare("SELECT 1 FROM locations WHERE id = ?1").bind(id).first();
  if (!l) throw new HttpError(400, "location_id does not exist");
}

export function registerShotRoutes(r: Router<Ctx>) {
  // Newest first, keyset-paginated on (captured_at, id). Pass ?before=<captured_at>&before_id=<id>.
  // Optional filters: ?project_id=<uuid>&state=approved&location_id=<uuid>
  r.on("GET", "/api/shots", async ({ env, url }) => {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("before_id") ?? "";
    const where: string[] = [];
    const args: unknown[] = [];
    if (before) { args.push(before, beforeId); where.push(`(s.captured_at < ?${args.length - 1} OR (s.captured_at = ?${args.length - 1} AND s.id < ?${args.length}))`); }
    const project = url.searchParams.get("project_id");
    if (project) { args.push(assertUuid(project, "project_id")); where.push(`s.project_id = ?${args.length}`); }
    const state = url.searchParams.get("state");
    if (state) { args.push(assertEnum(state, "state", SHOT_STATES)); where.push(`s.state = ?${args.length}`); }
    const loc = url.searchParams.get("location_id");
    if (loc) { args.push(assertUuid(loc, "location_id")); where.push(`s.location_id = ?${args.length}`); }
    args.push(limit);
    const { results } = await env.DB.prepare(`${SHOT_SQL}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY s.captured_at DESC, s.id DESC LIMIT ?${args.length}`).bind(...args).all<ShotRow>();
    const photos = await photosFor(env, results.map((s) => s.id));
    const last = results.at(-1);
    return json({
      shots: results.map((s) => shotToApi(s, photos.get(s.id) ?? [])),
      next: results.length === limit && last ? { before: last.captured_at, before_id: last.id } : null,
    });
  });

  r.on("GET", "/api/shots/:id", async ({ env }, { id }) => {
    const shot = await loadShot(env, assertUuid(id, "id"));
    if (!shot) throw new HttpError(404, "shot not found");
    return json({ shot });
  });

  // Same-origin image delivery so the dashboard can use plain <img> tags behind Access.
  r.on("GET", "/api/photos/:id/image", async ({ env, request }, { id }) => {
    const pid = assertUuid(id, "id");
    const row = await env.DB.prepare("SELECT r2_object_key FROM photos WHERE id = ?1").bind(pid).first<{ r2_object_key: string }>();
    if (!row) throw new HttpError(404, "photo not found");
    const obj = await env.SHOTS_BUCKET.get(row.r2_object_key, { onlyIf: request.headers });
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
   *   metadata        JSON string:
   *     { id, project_id, name?, location_id?, int_ext?, light?: string[], artificial?: boolean, weather?, extra?,
   *       photos: [{ id, ordinal, timestamp, lat, lon, gps_accuracy_m?, preset_id?, lens_mm, width?, height?, framing?, device? }] }
   *   photo.<photoId> one image file (jpeg/webp/png, <= 3 MB) per photo that is not stored yet
   * Creates the shot (state "unreviewed") with its photos. Idempotent: for an existing shot the
   * tags are left alone (they may have been edited since) and only photos not stored yet are added,
   * so a retried or continued upload (a sequence sent in parts) never duplicates anything.
   */
  r.on("POST", "/api/shots", async ({ env, request }) => {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.startsWith("multipart/form-data")) throw new HttpError(415, "expected multipart/form-data");
    const form = await request.formData();
    const metaRaw = form.get("metadata");
    if (typeof metaRaw !== "string") throw new HttpError(400, "metadata field missing");
    let m: Record<string, unknown>;
    try { m = JSON.parse(metaRaw) as Record<string, unknown>; } catch { throw new HttpError(400, "metadata is not JSON"); }

    const id = assertUuid(m.id, "id");
    if (!Array.isArray(m.photos) || m.photos.length === 0) throw new HttpError(400, "photos must be a non-empty array");
    if (m.photos.length > MAX_PHOTOS_PER_UPLOAD) throw new HttpError(413, `at most ${MAX_PHOTOS_PER_UPLOAD} photos per upload`);
    const photos = m.photos.map(parsePhoto);

    const existing = await env.DB.prepare("SELECT id FROM shots WHERE id = ?1").bind(id).first();
    let insertShot: D1PreparedStatement | null = null;
    if (!existing) {
      const projectId = assertUuid(m.project_id, "project_id");
      const tags = parseTags(m, true);
      await assertProjectExists(env, projectId);
      if (tags.location_id) await assertLocationExists(env, tags.location_id);
      const capturedAt = photos.map((p) => p.timestamp).sort()[0];
      insertShot = env.DB.prepare(
        `INSERT INTO shots (id, project_id, location_id, name, int_ext, light, artificial, weather, state, extra, captured_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'unreviewed', ?9, ?10)`,
      ).bind(id, projectId, tags.location_id, tags.name, tags.int_ext, tags.light, tags.artificial, tags.weather, tags.extra, capturedAt);
    }

    const stored = new Set(
      (await env.DB.prepare("SELECT id FROM photos WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(photos.map((p) => p.id))).all<{ id: string }>())
        .results.map((x) => x.id),
    );
    const fresh = photos.filter((p) => !stored.has(p.id));
    const presetIds = [...new Set(fresh.map((p) => p.preset_id).filter((x): x is string => !!x))];
    if (presetIds.length) {
      const known = await env.DB.prepare("SELECT id FROM presets WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(presetIds)).all<{ id: string }>();
      if (known.results.length !== presetIds.length) throw new HttpError(400, "preset_id does not exist");
    }
    const files = fresh.map((p) => {
      const f = form.get(`photo.${p.id}`);
      if (!(f instanceof File)) throw new HttpError(400, `image file missing for photo ${p.id}`);
      if (!ALLOWED_IMAGE_TYPES.has(f.type)) throw new HttpError(415, `unsupported image type ${f.type || "(none)"}`);
      if (f.size === 0 || f.size > MAX_IMAGE_BYTES) throw new HttpError(413, "image empty or too large");
      return { photo: p, file: f, key: objectKey(p.id, f.type) };
    });

    const written: string[] = [];
    try {
      for (const { photo, file, key } of files) {
        await env.SHOTS_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { shot_id: id, photo_id: photo.id } });
        written.push(key);
      }
      // One batch = one transaction: the shot row and its photo rows land together or not at all.
      const stmts = files.map(({ photo: p, key }) => env.DB.prepare(
        `INSERT INTO photos (id, shot_id, ordinal, timestamp, lat, lon, gps_accuracy_m, preset_id, lens_mm, r2_object_key, width, height, framing, device)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      ).bind(p.id, id, p.ordinal, p.timestamp, p.lat, p.lon, p.gps_accuracy_m, p.preset_id, p.lens_mm, key, p.width, p.height, p.framing, p.device));
      if (insertShot) stmts.unshift(insertShot);
      // A continued sequence may start earlier than what is stored (upload order is not capture order).
      stmts.push(env.DB.prepare("UPDATE shots SET captured_at = (SELECT min(timestamp) FROM photos WHERE shot_id = ?1) WHERE id = ?1").bind(id));
      await env.DB.batch(stmts);
    } catch (err) {
      await Promise.all(written.map((k) => env.SHOTS_BUCKET.delete(k).catch(() => {})));
      if (err instanceof HttpError) throw err;
      if (String(err).includes("UNIQUE constraint failed: photos.shot_id, photos.ordinal")) throw new HttpError(409, "a different photo already has this ordinal in the shot");
      throw err;
    }

    return json({ shot: await loadShot(env, id), duplicate: !!existing && fresh.length === 0 }, existing ? 200 : 201);
  });

  /** Edit tags, review state and/or project. JSON body with any of the tag fields, state, project_id. */
  r.on("PATCH", "/api/shots/:id", async ({ env, request }, { id }) => {
    const sid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const tags = parseTags(b, false);
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const [k, v] of Object.entries(tags)) { args.push(v); sets.push(`${k} = ?${args.length}`); }
    if (b.state !== undefined) { args.push(assertEnum(b.state, "state", SHOT_STATES)); sets.push(`state = ?${args.length}`); }
    if (b.project_id !== undefined) {
      const pid = assertUuid(b.project_id, "project_id");
      await assertProjectExists(env, pid);
      args.push(pid); sets.push(`project_id = ?${args.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, "nothing to update");
    if (tags.location_id) await assertLocationExists(env, tags.location_id);
    args.push(new Date().toISOString()); sets.push(`updated_at = ?${args.length}`);
    args.push(sid);
    const res = await env.DB.prepare(`UPDATE shots SET ${sets.join(", ")} WHERE id = ?${args.length}`).bind(...args).run();
    if (!res.meta.changes) throw new HttpError(404, "shot not found");
    return json({ shot: await loadShot(env, sid) });
  });

  /** Correct a position by hand: JSON { lat, lon, all_in_shot? }. all_in_shot moves every photo of the shot (a sequence taken on one spot). */
  r.on("PATCH", "/api/photos/:id", async ({ env, request }, { id }) => {
    const pid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const lat = assertNumber(b.lat, "lat", { min: -90, max: 90 });
    const lon = assertNumber(b.lon, "lon", { min: -180, max: 180 });
    const row = await env.DB.prepare("SELECT shot_id FROM photos WHERE id = ?1").bind(pid).first<{ shot_id: string }>();
    if (!row) throw new HttpError(404, "photo not found");
    await env.DB.prepare(`UPDATE photos SET lat = ?1, lon = ?2, position_corrected = 1 WHERE ${b.all_in_shot === true ? "shot_id = ?3" : "id = ?3"}`)
      .bind(lat, lon, b.all_in_shot === true ? row.shot_id : pid).run();
    return json({ shot: await loadShot(env, row.shot_id) });
  });

  r.on("DELETE", "/api/shots/:id", async ({ env }, { id }) => {
    const sid = assertUuid(id, "id");
    const { results } = await env.DB.prepare("SELECT r2_object_key FROM photos WHERE shot_id = ?1").bind(sid).all<{ r2_object_key: string }>();
    const res = await env.DB.prepare("DELETE FROM shots WHERE id = ?1").bind(sid).run(); // photos cascade
    if (!res.meta.changes) throw new HttpError(404, "shot not found");
    if (results.length) await env.SHOTS_BUCKET.delete(results.map((r) => r.r2_object_key));
    return json({ deleted: sid });
  });
}
