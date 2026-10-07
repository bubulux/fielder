import { validatePresentation } from "@fielder/vocab";
import { assertNumber, assertString, assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";
import { assertProjectExists } from "./projects.ts";

/**
 * Timelines (issue #12, part 2): a project's rough cuts out of scouted photos. Dashboard only.
 * Client-owned ids; PUT replaces the whole timeline like a shooting day. Clips whose photo left the
 * project (or was deleted) are dropped silently; an overlay that does not belong to the clip's photo
 * is nulled. The phone never reads these.
 */

interface TimelineRow { id: string; project_id: string; name: string; notes: string | null; created_at: string; updated_at: string | null }
interface ClipRow { id: string; timeline_id: string; position: number; photo_id: string; shot_id: string; overlay_id: string | null; presentation: string; duration_ms: number; notes: string | null }

const MAX_CLIPS = 500;
const MIN_MS = 100, MAX_MS = 3_600_000;

const clipToApi = (c: ClipRow) => ({ id: c.id, photo_id: c.photo_id, shot_id: c.shot_id, overlay_id: c.overlay_id, presentation: JSON.parse(c.presentation) as unknown, duration_ms: c.duration_ms, notes: c.notes });

async function withClips(env: Ctx["env"], rows: TimelineRow[]) {
  if (rows.length === 0) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.*, ph.shot_id FROM timeline_clips c JOIN photos ph ON ph.id = c.photo_id
     WHERE c.timeline_id IN (SELECT value FROM json_each(?1)) ORDER BY c.timeline_id, c.position`,
  ).bind(JSON.stringify(rows.map((t) => t.id))).all<ClipRow>();
  return rows.map((t) => ({ ...t, clips: results.filter((c) => c.timeline_id === t.id).map(clipToApi) }));
}

/** How many timelines (of any project) hold a photo of this shot; for the delete confirmation. */
export async function timelineCountOfShot(env: Ctx["env"], shotId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT count(DISTINCT c.timeline_id) AS n FROM timeline_clips c JOIN photos ph ON ph.id = c.photo_id WHERE ph.shot_id = ?1").bind(shotId).first<{ n: number }>();
  return row?.n ?? 0;
}

export function registerTimelineRoutes(r: Router<Ctx>) {
  r.on("GET", "/api/timelines", async ({ env, url }) => {
    const project = url.searchParams.get("project_id");
    const stmt = project
      ? env.DB.prepare("SELECT * FROM timelines WHERE project_id = ?1 ORDER BY created_at").bind(assertUuid(project, "project_id"))
      : env.DB.prepare("SELECT * FROM timelines ORDER BY created_at");
    const { results } = await stmt.all<TimelineRow>();
    return json({ timelines: await withClips(env, results) });
  });

  r.on("GET", "/api/timelines/:id", async ({ env }, { id }) => {
    const row = await env.DB.prepare("SELECT * FROM timelines WHERE id = ?1").bind(assertUuid(id, "id")).first<TimelineRow>();
    if (!row) throw new HttpError(404, "timeline not found");
    return json({ timeline: (await withClips(env, [row]))[0] });
  });

  /** JSON { project_id, name, notes?, clips: [{ id, photo_id, overlay_id?, presentation, duration_ms, notes? }] } — the whole timeline. */
  r.on("PUT", "/api/timelines/:id", async ({ env, request }, { id }) => {
    const tid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    const projectId = assertUuid(b.project_id, "project_id");
    const name = assertString(b.name, "name", 120);
    const opt = (v: unknown, f: string, max: number) => (v === undefined || v === null || v === "" ? null : assertString(v, f, max));
    const notes = opt(b.notes, "notes", 4000);
    if (!Array.isArray(b.clips)) throw new HttpError(400, "clips must be an array");
    if (b.clips.length > MAX_CLIPS) throw new HttpError(413, `at most ${MAX_CLIPS} clips per timeline`);
    let clips = b.clips.map((c, i) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const perr = validatePresentation(o.presentation);
      if (perr) throw new HttpError(400, `clips[${i}].presentation: ${perr}`);
      return {
        id: assertUuid(o.id, `clips[${i}].id`),
        photo_id: assertUuid(o.photo_id, `clips[${i}].photo_id`),
        overlay_id: o.overlay_id === undefined || o.overlay_id === null ? null : assertUuid(o.overlay_id, `clips[${i}].overlay_id`),
        presentation: JSON.stringify(o.presentation),
        duration_ms: Math.round(assertNumber(o.duration_ms, `clips[${i}].duration_ms`, { min: MIN_MS, max: MAX_MS })),
        notes: opt(o.notes, `clips[${i}].notes`, 1000),
      };
    });
    if (new Set(clips.map((c) => c.id)).size !== clips.length) throw new HttpError(400, "a clip id is listed twice");
    await assertProjectExists(env, projectId);
    if (clips.length) {
      // Photos deleted or moved out of the project meanwhile are dropped; an overlay of another photo is nulled.
      const photoIds = JSON.stringify([...new Set(clips.map((c) => c.photo_id))]);
      const ok = new Set((await env.DB.prepare("SELECT ph.id FROM photos ph JOIN shots s ON s.id = ph.shot_id WHERE s.project_id = ?1 AND ph.id IN (SELECT value FROM json_each(?2))")
        .bind(projectId, photoIds).all<{ id: string }>()).results.map((x) => x.id));
      clips = clips.filter((c) => ok.has(c.photo_id));
      const overlayIds = [...new Set(clips.map((c) => c.overlay_id).filter((x): x is string => !!x))];
      if (overlayIds.length) {
        const owned = new Map((await env.DB.prepare("SELECT id, photo_id FROM overlays WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(overlayIds)).all<{ id: string; photo_id: string }>()).results.map((o) => [o.id, o.photo_id]));
        for (const c of clips) if (c.overlay_id && owned.get(c.overlay_id) !== c.photo_id) c.overlay_id = null;
      }
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO timelines (id, project_id, name, notes, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET project_id = ?2, name = ?3, notes = ?4, updated_at = ?5`,
      ).bind(tid, projectId, name, notes, now),
      env.DB.prepare("DELETE FROM timeline_clips WHERE timeline_id = ?1").bind(tid),
      ...clips.map((c, i) => env.DB.prepare("INSERT INTO timeline_clips (id, timeline_id, position, photo_id, overlay_id, presentation, duration_ms, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
        .bind(c.id, tid, i, c.photo_id, c.overlay_id, c.presentation, c.duration_ms, c.notes)),
    ]);
    const row = await env.DB.prepare("SELECT * FROM timelines WHERE id = ?1").bind(tid).first<TimelineRow>();
    return json({ timeline: (await withClips(env, [row!]))[0] });
  });

  r.on("DELETE", "/api/timelines/:id", async ({ env }, { id }) => {
    const tid = assertUuid(id, "id");
    const res = await env.DB.prepare("DELETE FROM timelines WHERE id = ?1").bind(tid).run();
    if (!res.meta.changes) throw new HttpError(404, "timeline not found");
    return json({ deleted: tid });
  });
}
