import { validateFieldDef, type FieldDef } from "@fielder/vocab";
import { assertUuid, HttpError, json, readJson, type Router } from "./http.ts";
import type { Ctx } from "./index.ts";

interface FieldRow { id: string; key: string; definition: string; created_at: string; updated_at: string | null }
const toApi = (r: FieldRow) => ({ ...r, definition: JSON.parse(r.definition) as FieldDef });

function parseDefinition(v: unknown): FieldDef {
  const err = validateFieldDef(v);
  if (err) throw new HttpError(400, err);
  const s = JSON.stringify(v);
  if (s.length > 256 * 1024) throw new HttpError(413, "definition too large");
  return v as FieldDef;
}

/** The fields a project uses, in its order (for validating shot `extra`). */
export async function projectFieldDefs(env: Ctx["env"], projectId: string): Promise<FieldDef[]> {
  const { results } = await env.DB.prepare(
    `SELECT f.definition FROM project_fields pf JOIN field_definitions f ON f.id = pf.field_id WHERE pf.project_id = ?1 ORDER BY pf.position`,
  ).bind(projectId).all<{ definition: string }>();
  return results.map((r) => JSON.parse(r.definition) as FieldDef);
}

async function upsert(env: Ctx["env"], id: string, def: FieldDef): Promise<void> {
  const clash = await env.DB.prepare("SELECT id FROM field_definitions WHERE key = ?1 AND id != ?2").bind(def.key, id).first<{ id: string }>();
  if (clash) throw new HttpError(409, `another field already uses the key "${def.key}"`);
  await env.DB.prepare(
    `INSERT INTO field_definitions (id, key, definition, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(id) DO UPDATE SET key = ?2, definition = ?3, updated_at = ?4`,
  ).bind(id, def.key, JSON.stringify(def), new Date().toISOString()).run();
}

/** Global extra-field definitions: CRUD, bulk JSON import (e.g. written by an AI), per-project selection. */
export function registerFieldRoutes(r: Router<Ctx>) {
  r.on("GET", "/api/fields", async ({ env }) => {
    const { results } = await env.DB.prepare("SELECT * FROM field_definitions ORDER BY key").all<FieldRow>();
    return json({ fields: results.map(toApi) });
  });

  r.on("PUT", "/api/fields/:id", async ({ env, request }, { id }) => {
    const fid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    await upsert(env, fid, parseDefinition(b.definition));
    const row = await env.DB.prepare("SELECT * FROM field_definitions WHERE id = ?1").bind(fid).first<FieldRow>();
    return json({ field: toApi(row!) });
  });

  /**
   * JSON { fields: FieldDef[] }: creates new keys and replaces the definition of existing keys.
   * All definitions are validated before anything is written.
   */
  r.on("POST", "/api/fields/import", async ({ env, request }) => {
    const b = await readJson<Record<string, unknown>>(request);
    const list = Array.isArray(b.fields) ? b.fields : Array.isArray(b) ? b : null;
    if (!list || list.length === 0) throw new HttpError(400, "fields must be a non-empty array");
    if (list.length > 200) throw new HttpError(413, "at most 200 fields per import");
    const defs = list.map((d, i) => { try { return parseDefinition(d); } catch (e) { throw new HttpError(400, `fields[${i}]: ${(e as Error).message}`); } });
    const keys = new Set<string>();
    for (const d of defs) { if (keys.has(d.key)) throw new HttpError(400, `duplicate key "${d.key}" in the import`); keys.add(d.key); }
    const existing = new Map((await env.DB.prepare("SELECT id, key FROM field_definitions").all<{ id: string; key: string }>()).results.map((x) => [x.key, x.id]));
    let created = 0, updated = 0;
    for (const d of defs) {
      const id = existing.get(d.key);
      if (id) updated++; else created++;
      await upsert(env, id ?? crypto.randomUUID(), d);
    }
    const { results } = await env.DB.prepare("SELECT * FROM field_definitions ORDER BY key").all<FieldRow>();
    return json({ fields: results.map(toApi), created, updated });
  });

  // Shots keep their stored values; they just stop being shown/validated for this field.
  r.on("DELETE", "/api/fields/:id", async ({ env }, { id }) => {
    const fid = assertUuid(id, "id");
    const res = await env.DB.prepare("DELETE FROM field_definitions WHERE id = ?1").bind(fid).run();
    if (!res.meta.changes) throw new HttpError(404, "field not found");
    return json({ deleted: fid });
  });

  /** JSON { field_ids: [...] } in display order; replaces the project's selection. */
  r.on("PUT", "/api/projects/:id/fields", async ({ env, request }, { id }) => {
    const pid = assertUuid(id, "id");
    const b = await readJson<Record<string, unknown>>(request);
    if (!Array.isArray(b.field_ids)) throw new HttpError(400, "field_ids must be an array");
    const ids = b.field_ids.map((x, i) => assertUuid(x, `field_ids[${i}]`));
    const p = await env.DB.prepare("SELECT 1 FROM projects WHERE id = ?1").bind(pid).first();
    if (!p) throw new HttpError(404, "project not found");
    const stmts = [env.DB.prepare("DELETE FROM project_fields WHERE project_id = ?1").bind(pid)];
    ids.forEach((fid, i) => stmts.push(env.DB.prepare("INSERT INTO project_fields (project_id, field_id, position) VALUES (?1, ?2, ?3)").bind(pid, fid, i)));
    try { await env.DB.batch(stmts); } catch (e) { if (String(e).includes("FOREIGN KEY")) throw new HttpError(400, "unknown field id"); throw e; }
    return json({ project_id: pid, field_ids: ids });
  });
}
