/** Same-origin API; the Access session cookie is sent automatically. */
import type { FilterGroup } from "@fielder/vocab";
export type ShotState = "unreviewed" | "approved" | "archived";

export interface Shot {
  id: string;
  timestamp: string;
  lat: number;
  lon: number;
  preset_id: string | null;
  preset_name: string | null;
  lens_mm: number;
  image_url: string;
  extra_metadata: Record<string, unknown> | null;
  created_at: string;
  name: string | null;
  light: string | null;
  weather: string | null;
  int_ext: string | null;
  location_id: string | null;
  location_name: string | null;
  district: string | null;
  state: ShotState;
  extra: Record<string, string>;
}
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
  district: string;
  created_at: string;
  updated_at: string | null;
  shot_count: number;
  approved_count: number;
}
export interface SavedView { id: string; name: string; filter: FilterGroup; created_at: string; updated_at: string | null }
export interface ShotTags { name: string; light: string; weather: string; int_ext: string; location_id: string; extra: Record<string, string> }

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

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

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

export const fetchPresets = () => get<{ presets: Preset[] }>("/api/presets").then((r) => r.presets);
export const putPreset = (p: Omit<Preset, "created_at" | "updated_at">) =>
  send<{ preset: Preset }>("PUT", `/api/presets/${p.id}`, {
    name: p.name, camera_id: p.camera_id, format_id: p.format_id, sensor_width_mm: p.sensor_width_mm, sensor_height_mm: p.sensor_height_mm,
    speedbooster_factor: p.speedbooster_factor, lens_min_mm: p.lens_min_mm, lens_max_mm: p.lens_max_mm,
  }).then((r) => r.preset);
export const deletePreset = (id: string) => send<{ deleted: string }>("DELETE", `/api/presets/${id}`).then(() => undefined);

export const deleteShot = (id: string) => send<{ deleted: string }>("DELETE", `/api/shots/${id}`).then(() => undefined);
export const patchShot = (id: string, patch: Partial<ShotTags> & { state?: ShotState }) => send<{ shot: Shot }>("PATCH", `/api/shots/${id}`, patch).then((r) => r.shot);

export const fetchLocations = () => get<{ locations: Location[] }>("/api/locations").then((r) => r.locations);
/** Upsert; a 409 carries body.existing_id when another location already has the name. */
export const putLocation = (l: { id: string; name: string; district: string }) =>
  send<{ location: Location }>("PUT", `/api/locations/${l.id}`, { name: l.name, district: l.district }).then((r) => r.location);
export const deleteLocation = (id: string) => send<{ deleted: string }>("DELETE", `/api/locations/${id}`).then(() => undefined);

export const fetchViews = () => get<{ views: SavedView[] }>("/api/views").then((r) => r.views);
export const putView = (v: { id: string; name: string; filter: FilterGroup }) => send<{ view: SavedView }>("PUT", `/api/views/${v.id}`, { name: v.name, filter: v.filter }).then((r) => r.view);
export const deleteView = (id: string) => send<{ deleted: string }>("DELETE", `/api/views/${id}`).then(() => undefined);
