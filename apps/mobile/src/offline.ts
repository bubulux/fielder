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

/** Remove a day's offline copy; photos still used by another offline day or project stay. */
export function removeOfflineDay(id: string) {
  const all = readAll();
  const gone = all[id];
  if (!gone) return;
  delete all[id];
  writeAll(all);
  deleteUnused(gone.shots);
}

/** Delete the local photos of these shots unless an offline day or project still uses them. */
function deleteUnused(shots: Shot[]) {
  const keep = new Set([...Object.values(readAll()), ...Object.values(readProjects())].flatMap((d) => d.shots.flatMap((s) => s.photos.map((p) => p.id))));
  for (const s of shots) for (const p of s.photos) {
    if (keep.has(p.id)) continue;
    try { const f = photoFile(p.id); if (f.exists) f.delete(); } catch { /* best effort */ }
  }
}

// ---------- Whole projects ----------

/**
 * A project kept on the phone: every shot with its metadata and photos, so Shots and Review work
 * without a connection. Refreshed in the background whenever the project's shots load online
 * (only new photos are downloaded).
 */
export interface OfflineProject { projectId: string; projectName: string; shots: Shot[]; savedAt: string; bytes: number }

const PROJECTS_KEY = "offlineProjects.v1";
function readProjects(): Record<string, OfflineProject> {
  try { const raw = Storage.getItemSync(PROJECTS_KEY); return raw ? (JSON.parse(raw) as Record<string, OfflineProject>) : {}; } catch { return {}; }
}
const writeProjects = (v: Record<string, OfflineProject>) => Storage.setItemSync(PROJECTS_KEY, JSON.stringify(v));
export const offlineProject = (projectId: string | null): OfflineProject | null => (projectId ? readProjects()[projectId] ?? null : null);

/** Download progress of a project copy, for the Offline screen. */
export interface ProjectProgress { projectId: string; done: number; total: number }
let progress: ProjectProgress | null = null;
const progressListeners = new Set<() => void>();
export const projectProgress = () => progress;
export function onProjectProgress(cb: () => void): () => void { progressListeners.add(cb); return () => { progressListeners.delete(cb); }; }
const setProgress = (p: ProjectProgress | null) => { progress = p; for (const cb of progressListeners) cb(); };

let running: Promise<OfflineProject> | null = null;

/**
 * Store a project's shots and download the photos not on the phone yet. Photos of shots that left
 * the project are deleted (unless an offline day uses them). One copy runs at a time.
 */
export function saveProjectOffline(projectId: string, projectName: string, shots: Shot[]): Promise<OfflineProject> {
  if (running) return running;
  running = (async () => {
    if (!dir.exists) dir.create({ intermediates: true });
    const photos = shots.flatMap((s) => s.photos);
    const missing = photos.filter((p) => !photoFile(p.id).exists);
    setProgress({ projectId, done: 0, total: missing.length });
    let done = 0;
    for (const p of missing) {
      await File.downloadFileAsync(imageUri(p), photoFile(p.id), { headers: imageHeaders(), idempotent: true });
      setProgress({ projectId, done: ++done, total: missing.length });
    }
    let bytes = 0;
    for (const p of photos) { try { bytes += photoFile(p.id).size ?? 0; } catch { /* size unknown */ } }
    const before = readProjects()[projectId];
    const entry: OfflineProject = { projectId, projectName, shots, savedAt: new Date().toISOString(), bytes };
    writeProjects({ ...readProjects(), [projectId]: entry });
    if (before) deleteUnused(before.shots.filter((s) => !shots.some((x) => x.id === s.id)));
    log("info", "project saved offline", { project: projectId, shots: shots.length, downloaded: missing.length });
    return entry;
  })().finally(() => { running = null; setProgress(null); });
  return running;
}

/** Stop keeping a project on the phone; photos an offline day still uses stay. */
export function removeOfflineProject(projectId: string) {
  const all = readProjects();
  const gone = all[projectId];
  if (!gone) return;
  delete all[projectId];
  writeProjects(all);
  deleteUnused(gone.shots);
}
