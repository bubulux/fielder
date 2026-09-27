import { Directory, File, Paths } from "expo-file-system";
import { api, ApiError } from "./api";
import { log } from "./log";
import { syncLocations, syncProjects } from "./namedSync";
import { store } from "./storage";
import type { PendingUpload, ShotMetadata } from "./types";

const dir = new Directory(Paths.document, "pending-photos");
/** Photos per request; the server caps one upload at 60. */
const UPLOAD_CHUNK = 12;
/** Rejections (4xx) after which a shot stops being retried automatically; it is kept, never deleted. */
const MAX_REJECTIONS = 3;

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true });
}

const deleteFiles = (uris: string[]) => {
  for (const uri of uris) { try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* best effort */ } }
};

/**
 * Copy the temp captures (photo id -> temp file URI) into app storage and enqueue the shot.
 * Throws if a photo cannot be stored (nothing is queued then, and partial copies are removed).
 */
export function enqueue(metadata: ShotMetadata, tempUris: Record<string, string>): PendingUpload {
  ensureDir();
  const files: Record<string, string> = {};
  try {
    for (const p of metadata.photos) {
      const dest = new File(dir, `${p.id}.jpg`);
      // copy() is async in this SDK; the caller deletes the temp file right after, so the copy must be complete here.
      new File(tempUris[p.id]).copySync(dest, { overwrite: true });
      if (!dest.exists) throw new Error("could not store the photo for upload");
      files[p.id] = dest.uri;
    }
  } catch (err) {
    deleteFiles(Object.values(files));
    throw err;
  }
  const entry: PendingUpload = { metadata, files, attempts: 0 };
  store.savePending([...store.loadPending(), entry]);
  log("info", "queued", { shot: metadata.id, photos: metadata.photos.length, project: metadata.project_id });
  return entry;
}

function remove(entry: PendingUpload) {
  store.savePending(store.loadPending().filter((p) => p.metadata.id !== entry.metadata.id));
  deleteFiles(Object.values(entry.files));
}

/** Throw away a queued shot on purpose (Setup → Uploads), photos included. */
export function discardPending(shotId: string) {
  const entry = store.loadPending().find((p) => p.metadata.id === shotId);
  if (entry) { log("warn", "upload discarded by user", { shot: shotId, error: entry.lastError }); remove(entry); notify(); }
}

/** Point queued shots at the server's id where a locally created location/project clashed by name. */
function remapPending(field: "location_id" | "project_id", remap: Record<string, string>) {
  if (Object.keys(remap).length === 0) return;
  store.savePending(store.loadPending().map((p) => {
    const to = p.metadata[field] ? remap[p.metadata[field]] : undefined;
    return to ? { ...p, metadata: { ...p.metadata, [field]: to } } : p;
  }));
}

/**
 * Store the server list, but keep entries created on the phone while the sync ran (they were not
 * part of this round and are pushed next time).
 */
function mergeServerList<T extends { id: string; synced: boolean }>(server: T[], localNow: T[], remap: Record<string, string>): T[] {
  const late = localNow.filter((l) => !l.synced && !server.some((s) => s.id === l.id) && !remap[l.id]);
  return [...server, ...late];
}

export interface FlushResult { uploaded: number; remaining: number; lastError?: string }

const listeners = new Set<() => void>();
/** Called after every flush (projects, locations or the active project may have changed in storage). */
export function onFlushed(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function notify() { for (const cb of listeners) cb(); }

let flushing: Promise<FlushResult> | null = null;

/**
 * Upload everything in the queue, oldest first. Safe to call repeatedly. Shots the server
 * rejected MAX_REJECTIONS times are skipped unless `includeStuck` (the manual retry).
 */
export function flush(opts: { includeStuck?: boolean } = {}): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    let uploaded = 0;
    let lastError: string | undefined;
    // Projects and locations first, so a shot never arrives before what it references.
    const projects = await syncProjects(store.loadProjects());
    if (projects) {
      store.saveProjects(mergeServerList(projects.items, store.loadProjects(), projects.remap));
      remapPending("project_id", projects.remap);
      const active = store.loadActiveProjectId();
      if (active && projects.remap[active]) store.saveActiveProjectId(projects.remap[active]);
    }
    try { store.saveFields(await api.listFields()); } catch { /* offline: keep the cached definitions */ }
    const locations = await syncLocations(store.loadLocations());
    if (locations) {
      store.saveLocations(mergeServerList(locations.items, store.loadLocations(), locations.remap));
      remapPending("location_id", locations.remap);
    }
    for (const queued of store.loadPending()) {
      let entry = queued;
      if (entry.stuck && !opts.includeStuck) continue;
      const missing = entry.metadata.photos.filter((p) => !entry.files[p.id] || !new File(entry.files[p.id]).exists);
      if (missing.length) {
        // Upload what is left rather than losing the whole shot for one missing file.
        log("error", "queued photos missing on disk", { shot: entry.metadata.id, missing: missing.length });
        lastError = `${missing.length} photo(s) of a queued shot were missing on the phone`;
        if (missing.length === entry.metadata.photos.length) { remove(entry); continue; }
        entry = { ...entry, metadata: { ...entry.metadata, photos: entry.metadata.photos.filter((p) => !missing.includes(p)) } };
        store.savePending(store.loadPending().map((p) => (p.metadata.id === entry.metadata.id ? entry : p)));
      }
      try {
        // Big sequences go in parts; the server adds missing photos to the existing shot.
        for (let i = 0; i < entry.metadata.photos.length; i += UPLOAD_CHUNK) {
          await api.uploadShot({ ...entry.metadata, photos: entry.metadata.photos.slice(i, i + UPLOAD_CHUNK) }, entry.files);
        }
        log("info", "upload ok", { shot: entry.metadata.id, photos: entry.metadata.photos.length });
        remove(entry);
        uploaded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        log("warn", "upload failed", { shot: entry.metadata.id, attempts: entry.attempts + 1, error: msg });
        // 4xx other than 401/403/408/429 means the payload itself is rejected; retrying won't help by itself.
        const rejected = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 403, 408, 429].includes(err.status);
        const q = store.loadPending();
        const i = q.findIndex((p) => p.metadata.id === entry.metadata.id);
        if (i >= 0) {
          const attempts = q[i].attempts + 1;
          q[i] = { ...q[i], attempts, lastError: msg, stuck: rejected && attempts >= MAX_REJECTIONS };
          store.savePending(q);
        }
        if (!rejected) break; // network/auth problem: stop and try again later
      }
    }
    return { uploaded, remaining: store.loadPending().length, lastError };
  })().finally(() => { flushing = null; notify(); });
  return flushing;
}
