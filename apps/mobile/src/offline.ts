import { Directory, File, Paths } from "expo-file-system";
import Storage from "expo-sqlite/kv-store";
import { imageHeaders, imageUri, type Photo, type Shot, type ShootingDay } from "./api";
import { API_URL } from "./config";
import { log } from "./log";

/**
 * Shooting days made available offline: the day, its shots (with all metadata) and every photo
 * image are stored on the phone, so the day can be worked through without a connection.
 * New captures work offline anyway (they queue); this covers browsing the plan.
 */
export interface OfflineDay { day: ShootingDay; shots: Shot[]; projectName: string; savedAt: string }

const KEY = "offlineDays.v1";
const dir = new Directory(Paths.document, "offline-photos");

function readAll(): Record<string, OfflineDay> {
  try { const raw = Storage.getItemSync(KEY); return raw ? (JSON.parse(raw) as Record<string, OfflineDay>) : {}; } catch { return {}; }
}
const writeAll = (v: Record<string, OfflineDay>) => Storage.setItemSync(KEY, JSON.stringify(v));

export const offlineDays = (): OfflineDay[] => Object.values(readAll()).sort((a, b) => a.day.date.localeCompare(b.day.date));
export const offlineDay = (id: string): OfflineDay | null => readAll()[id] ?? null;

const photoFile = (id: string) => new File(dir, `${id}.jpg`);

/** Local copy of a photo if one was saved for an offline day, else null. */
export function offlinePhotoUri(photo: Photo): string | null {
  try { const f = photoFile(photo.id); return f.exists ? f.uri : null; } catch { return null; }
}

/** Save a day and download its photos. Reports progress as (done, total). Throws if a download fails. */
export async function saveDayOffline(day: ShootingDay, shots: Shot[], projectName: string, onProgress?: (done: number, total: number) => void): Promise<OfflineDay> {
  if (!dir.exists) dir.create({ intermediates: true });
  const planned = day.shots.map((ds) => shots.find((s) => s.id === ds.shot_id)).filter((s): s is Shot => !!s);
  const photos = planned.flatMap((s) => s.photos);
  let done = 0;
  onProgress?.(0, photos.length);
  for (const p of photos) {
    if (!photoFile(p.id).exists) await File.downloadFileAsync(imageUri(p), photoFile(p.id), { headers: imageHeaders(), idempotent: true });
    onProgress?.(++done, photos.length);
  }
  const entry: OfflineDay = { day, shots: planned, projectName, savedAt: new Date().toISOString() };
  writeAll({ ...readAll(), [day.id]: entry });
  log("info", "day saved offline", { day: day.id, shots: planned.length, photos: photos.length, api: API_URL });
  return entry;
}

/** Remove a day's offline copy; photos still used by another offline day stay. */
export function removeOfflineDay(id: string) {
  const all = readAll();
  const gone = all[id];
  if (!gone) return;
  delete all[id];
  const keep = new Set(Object.values(all).flatMap((d) => d.shots.flatMap((s) => s.photos.map((p) => p.id))));
  for (const s of gone.shots) for (const p of s.photos) {
    if (keep.has(p.id)) continue;
    try { const f = photoFile(p.id); if (f.exists) f.delete(); } catch { /* best effort */ }
  }
  writeAll(all);
}
