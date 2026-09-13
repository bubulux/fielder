import { Directory, File, Paths } from "expo-file-system";
import { api, ApiError } from "./api";
import { syncLocations } from "./locationSync";
import { store } from "./storage";
import type { PendingUpload, ShotMetadata } from "./types";

const dir = new Directory(Paths.document, "pending-shots");

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true });
}

/** Copy the temp capture into app storage and enqueue it; returns the queue entry. */
export function enqueue(metadata: ShotMetadata, tempUri: string): PendingUpload {
  ensureDir();
  const dest = new File(dir, `${metadata.id}.jpg`);
  new File(tempUri).copy(dest);
  const entry: PendingUpload = { metadata, fileUri: dest.uri, attempts: 0 };
  store.savePending([...store.loadPending(), entry]);
  return entry;
}

function remove(id: string) {
  store.savePending(store.loadPending().filter((p) => p.metadata.id !== id));
  try {
    const f = new File(dir, `${id}.jpg`);
    if (f.exists) f.delete();
  } catch { /* best effort */ }
}

export interface FlushResult { uploaded: number; remaining: number; lastError?: string }

let flushing: Promise<FlushResult> | null = null;

/** Upload everything in the queue, oldest first. Safe to call repeatedly. */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    let uploaded = 0;
    let lastError: string | undefined;
    // Locations first, so a shot never arrives before the location it references.
    const sync = await syncLocations(store.loadLocations());
    if (sync) {
      store.saveLocations(sync.locations);
      if (Object.keys(sync.remap).length) {
        store.savePending(store.loadPending().map((p) =>
          sync.remap[p.metadata.location_id] ? { ...p, metadata: { ...p.metadata, location_id: sync.remap[p.metadata.location_id] } } : p));
      }
    }
    for (const entry of store.loadPending()) {
      try {
        await api.uploadShot(entry.metadata, entry.fileUri);
        remove(entry.metadata.id);
        uploaded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        // 4xx other than 401/403/408/429 means the payload itself is rejected; retrying won't help.
        const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 403, 408, 429].includes(err.status);
        const q = store.loadPending();
        const i = q.findIndex((p) => p.metadata.id === entry.metadata.id);
        if (i >= 0) {
          if (permanent && q[i].attempts >= 2) { remove(entry.metadata.id); continue; }
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
