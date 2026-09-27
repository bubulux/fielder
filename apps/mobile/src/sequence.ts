import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { log } from "./log";
import { store } from "./storage";
import type { CaptureDraft, DraftPhoto } from "./types";

/**
 * Sequence mode: every photo taken while it is on belongs to one shot. Photos are copied out of
 * the camera's temp files right away and the draft is persisted, so nothing is lost if the app
 * is killed mid-sequence; the badge picks up where it left off on the next launch.
 */
const dir = new Directory(Paths.document, "sequence-photos");

export function startSequence(): CaptureDraft {
  const d: CaptureDraft = { shotId: Crypto.randomUUID(), photos: [] };
  store.saveSequence(d);
  log("info", "sequence start", { shot: d.shotId });
  return d;
}

/** Adds a photo (moving its temp file into sequence storage) and returns the updated draft. */
export function addToSequence(d: CaptureDraft, photo: DraftPhoto): CaptureDraft {
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${photo.meta.id}.jpg`);
  new File(photo.uri).copySync(dest, { overwrite: true });
  try { new File(photo.uri).delete(); } catch { /* temp file */ }
  const next: CaptureDraft = { ...d, photos: [...d.photos, { ...photo, uri: dest.uri, meta: { ...photo.meta, ordinal: d.photos.length } }] };
  store.saveSequence(next);
  log("info", "sequence photo", { shot: d.shotId, n: next.photos.length });
  return next;
}

/** Deletes a draft's local files (after they were queued, or on discard). */
export function deleteDraftFiles(d: CaptureDraft) {
  for (const p of d.photos) { try { const f = new File(p.uri); if (f.exists) f.delete(); } catch { /* best effort */ } }
}
