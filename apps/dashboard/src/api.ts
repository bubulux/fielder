/** Same-origin API; the Access session cookie is sent automatically. */
import type { Extra, FieldDef, FieldDefinition, FilterGroup } from "@fielder/vocab";
export type { FieldDefinition };
export type ShotState = "unreviewed" | "approved" | "archived";

/** One image of a shot. Rig/lens framing and GPS are per photo (a sequence can change lens). */
export interface Photo {
  id: string;
  shot_id: string;
  ordinal: number;
  timestamp: string;
  lat: number;
  lon: number;
  gps_accuracy_m: number | null;
  /** Moved by hand after capture. */
  position_corrected: boolean;
  preset_id: string | null;
  preset_name: string | null;
  lens_mm: number;
  width: number | null;
  height: number | null;
  framing: Record<string, unknown> | null;
  device: Record<string, unknown> | null;
  image_url: string;
  created_at: string;
}
/** The unit of scouting metadata: one photo, or a whole sequence. */
export interface Shot {
  id: string;
  project_id: string;
  project_name: string | null;
  location_id: string | null;
  location_name: string | null;
  name: string | null;
  int_ext: string | null;
  light: string[];
  artificial: boolean;
  weather: string | null;
  state: ShotState;
  extra: Extra;
  captured_at: string;
  created_at: string;
  updated_at: string | null;
  /** Ordered; never empty. */
  photos: Photo[];
}
export interface Project { id: string; name: string; notes: string | null; created_at: string; updated_at: string | null; shot_count: number; /** Extra-field definitions the project uses, in order. */ field_ids: string[] }
export interface Preset {
  id: string;
  name: string;
  camera_id: string | null;
  format_id: string | null;
  sensor_width_mm: number;
  sensor_height_mm: number;
  speedbooster_factor: number;
  lens_min_mm: number | null;
  lens_max_mm: number | null;
  created_at: string;
  updated_at: string | null;
}
export interface Location {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  shot_count: number;
  approved_count: number;
}
export interface SavedView { id: string; name: string; filter: FilterGroup; created_at: string; updated_at: string | null }
/** null / [] / false = not specified. */
export interface ShotTags { name: string | null; light: string[]; artificial: boolean; weather: string | null; int_ext: string | null; location_id: string | null; extra: Extra }

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown = null) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) }, credentials: "same-origin" });
  if (res.status === 401 || res.redirected) {
    // Access session expired: reload to trigger the login redirect.
    location.reload();
    throw new ApiError(401, "session expired");
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`, body);
  return body as T;
}
const get = <T,>(path: string) => request<T>(path);
const send = <T,>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/** The 409 body of an upsert whose name is taken carries the id of the row that has it. */
export const existingIdOf = (err: unknown): string | undefined =>
  err instanceof ApiError && err.status === 409 ? (err.body as { existing_id?: string } | null)?.existing_id : undefined;

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

/** Every shot of every project; the UI narrows to the active project itself so "All projects" is free. */
export async function fetchAllShots(): Promise<Shot[]> {
  const all: Shot[] = [];
  let cursor: Cursor = null;
  for (;;) {
    const q: string = cursor ? `?limit=500&before=${encodeURIComponent(cursor.before)}&before_id=${cursor.before_id}` : "?limit=500";
    const page: ShotsPage = await get<ShotsPage>(`/api/shots${q}`);
    all.push(...page.shots);
    if (!page.next) break;
    cursor = page.next;
  }
  return all;
}

export const fetchProjects = () => get<{ projects: Project[] }>("/api/projects").then((r) => r.projects);
/** Upsert; a 409 carries body.existing_id when another project already has the name. */
export const putProject = (p: { id: string; name: string; notes: string | null }) =>
  send<{ project: Project }>("PUT", `/api/projects/${p.id}`, { name: p.name, notes: p.notes }).then((r) => r.project);
export const deleteProject = (id: string) => send<{ deleted: string }>("DELETE", `/api/projects/${id}`).then(() => undefined);

export const fetchFields = () => get<{ fields: FieldDefinition[] }>("/api/fields").then((r) => r.fields);
export const putField = (id: string, definition: FieldDef) => send<{ field: FieldDefinition }>("PUT", `/api/fields/${id}`, { definition }).then((r) => r.field);
export const deleteField = (id: string) => send<{ deleted: string }>("DELETE", `/api/fields/${id}`).then(() => undefined);
/** Creates new keys, replaces existing ones; returns the full list. */
export const importFields = (fields: unknown[]) => send<{ fields: FieldDefinition[]; created: number; updated: number }>("POST", "/api/fields/import", { fields });
export const putProjectFields = (projectId: string, fieldIds: string[]) => send<{ field_ids: string[] }>("PUT", `/api/projects/${projectId}/fields`, { field_ids: fieldIds }).then((r) => r.field_ids);

/** A shooting day of a project with its planned shots in order. */
export interface DayShot { shot_id: string; planned_time: string | null; notes: string | null }
export interface ShootingDay { id: string; project_id: string; date: string; title: string | null; notes: string | null; created_at: string; updated_at: string | null; shots: DayShot[] }
export const fetchDays = (projectId: string) => get<{ days: ShootingDay[] }>(`/api/days?project_id=${projectId}`).then((r) => r.days);
export const putDay = (d: Omit<ShootingDay, "created_at" | "updated_at">) =>
  send<{ day: ShootingDay }>("PUT", `/api/days/${d.id}`, { project_id: d.project_id, date: d.date, title: d.title, notes: d.notes, shots: d.shots }).then((r) => r.day);
export const deleteDay = (id: string) => send<{ deleted: string }>("DELETE", `/api/days/${id}`).then(() => undefined);

export const fetchPresets = () => get<{ presets: Preset[] }>("/api/presets").then((r) => r.presets);
export const putPreset = (p: Omit<Preset, "created_at" | "updated_at">) =>
  send<{ preset: Preset }>("PUT", `/api/presets/${p.id}`, {
    name: p.name, camera_id: p.camera_id, format_id: p.format_id, sensor_width_mm: p.sensor_width_mm, sensor_height_mm: p.sensor_height_mm,
    speedbooster_factor: p.speedbooster_factor, lens_min_mm: p.lens_min_mm, lens_max_mm: p.lens_max_mm,
  }).then((r) => r.preset);
export const deletePreset = (id: string) => send<{ deleted: string }>("DELETE", `/api/presets/${id}`).then(() => undefined);

export const deleteShot = (id: string) => send<{ deleted: string }>("DELETE", `/api/shots/${id}`).then(() => undefined);
export const patchShot = (id: string, patch: Partial<ShotTags> & { state?: ShotState; project_id?: string }) => send<{ shot: Shot }>("PATCH", `/api/shots/${id}`, patch).then((r) => r.shot);
export type BulkSet = Partial<Omit<ShotTags, "extra">> & { state?: ShotState; project_id?: string };
/** Bulk edit: only the given fields change; `extra` is per top-level key (null clears). Sent 500 shots per request. */
export async function patchShots(ids: string[], set: BulkSet, extra: Extra = {}): Promise<Shot[]> {
  const out: Shot[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await send<{ shots: Shot[] }>("PATCH", "/api/shots", { ids: ids.slice(i, i + 500), set, extra })).shots);
  return out;
}

/** Correct a photo's position by hand; `allInShot` moves every photo of its shot. Returns the updated shot. */
export const patchPhotoPosition = (id: string, lat: number, lon: number, allInShot: boolean) =>
  send<{ shot: Shot }>("PATCH", `/api/photos/${id}`, { lat, lon, all_in_shot: allInShot }).then((r) => r.shot);

export const fetchLocations = () => get<{ locations: Location[] }>("/api/locations").then((r) => r.locations);
/** Upsert; a 409 carries body.existing_id when another location already has the name. */
export const putLocation = (l: { id: string; name: string }) =>
  send<{ location: Location }>("PUT", `/api/locations/${l.id}`, { name: l.name }).then((r) => r.location);
export const deleteLocation = (id: string) => send<{ deleted: string }>("DELETE", `/api/locations/${id}`).then(() => undefined);

export const fetchViews = () => get<{ views: SavedView[] }>("/api/views").then((r) => r.views);
export const putView = (v: { id: string; name: string; filter: FilterGroup }) => send<{ view: SavedView }>("PUT", `/api/views/${v.id}`, { name: v.name, filter: v.filter }).then((r) => r.view);
export const deleteView = (id: string) => send<{ deleted: string }>("DELETE", `/api/views/${id}`).then(() => undefined);
