import { Directory, File, Paths } from "expo-file-system";
import { api, ApiError } from "./api";
import { log } from "./log";
import { syncLocations, syncProjects } from "./namedSync";
import { store } from "./storage";
import type { PendingUpload, ShotMetadata } from "./types";

const dir = new Directory(Paths.document, "pending-photos");
/** Photos per request; the server caps one upload at 60. */
const UPLOAD_CHUNK = 12;

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true });
}

/**
 * Copy the temp captures (photo id -> temp file URI) into app storage and enqueue the shot.
 * Throws if a photo cannot be stored.
 */
export function enqueue(metadata: ShotMetadata, tempUris: Record<string, string>): PendingUpload {
  ensureDir();
  const files: Record<string, string> = {};
  for (const p of metadata.photos) {
    const dest = new File(dir, `${p.id}.jpg`);
    // copy() is async in this SDK; the caller deletes the temp file right after, so the copy must be complete here.
    new File(tempUris[p.id]).copySync(dest, { overwrite: true });
    if (!dest.exists) throw new Error("could not store the photo for upload");
    files[p.id] = dest.uri;
  }
  const entry: PendingUpload = { metadata, files, attempts: 0 };
  store.savePending([...store.loadPending(), entry]);
  log("info", "queued", { shot: metadata.id, photos: metadata.photos.length, project: metadata.project_id });
  return entry;
}

function remove(entry: PendingUpload) {
  store.savePending(store.loadPending().filter((p) => p.metadata.id !== entry.metadata.id));
  for (const uri of Object.values(entry.files)) {
    try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* best effort */ }
  }
}

/** Point queued shots at the server's id where a locally created location/project clashed by name. */
function remapPending(field: "location_id" | "project_id", remap: Record<string, string>) {
  if (Object.keys(remap).length === 0) return;
  store.savePending(store.loadPending().map((p) => {
    const to = p.metadata[field] ? remap[p.metadata[field]] : undefined;
    return to ? { ...p, metadata: { ...p.metadata, [field]: to } } : p;
  }));
}

export interface FlushResult { uploaded: number; remaining: number; lastError?: string }

let flushing: Promise<FlushResult> | null = null;

/** Upload everything in the queue, oldest first. Safe to call repeatedly. */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    let uploaded = 0;
    let lastError: string | undefined;
    // Projects and locations first, so a shot never arrives before what it references.
    const projects = await syncProjects(store.loadProjects());
    if (projects) {
      store.saveProjects(projects.items);
      remapPending("project_id", projects.remap);
      const active = store.loadActiveProjectId();
      if (active && projects.remap[active]) store.saveActiveProjectId(projects.remap[active]);
    }
    const locations = await syncLocations(store.loadLocations());
    if (locations) {
      store.saveLocations(locations.items);
      remapPending("location_id", locations.remap);
    }
    for (const entry of store.loadPending()) {
      if (entry.metadata.photos.some((p) => !entry.files[p.id] || !new File(entry.files[p.id]).exists)) {
        // A photo is gone; the server would reject the shot forever.
        log("error", "upload dropped: photo file missing", { shot: entry.metadata.id });
        remove(entry);
        lastError = "a queued shot lost a photo and was dropped";
        continue;
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
        // 4xx other than 401/403/408/429 means the payload itself is rejected; retrying won't help.
        const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 403, 408, 429].includes(err.status);
        const q = store.loadPending();
        const i = q.findIndex((p) => p.metadata.id === entry.metadata.id);
        if (i >= 0) {
          if (permanent && q[i].attempts >= 2) { remove(q[i]); continue; }
          q[i] = { ...q[i], attempts: q[i].attempts + 1, lastError: msg };
          store.savePending(q);
        }
        if (!permanent) break; // network/auth problem: stop and try again later
      }
    }
    return { uploaded, remaining: store.loadPending().length, lastError };
  })().finally(() => { flushing = null; });
  return flushing;
}
