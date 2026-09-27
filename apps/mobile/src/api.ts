import { File } from "expo-file-system";
import { getToken, setToken } from "./auth";
import { API_URL, isConfigured } from "./config";
import { log } from "./log";
import type { Extra, FieldDefinition } from "@fielder/vocab";
import type { LocationEntry, Preset, ProjectEntry, ShotMetadata, ShotTags } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown = null) {
    super(message);
  }
}

/** Access session token as the documented `cf-access-token` header (validated by Access at the edge). */
function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { "cf-access-token": token, ...extra } : { ...extra };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isConfigured) throw new ApiError(0, "API not configured in this build");
  if (!getToken()) throw new ApiError(401, "not signed in");
  const started = Date.now();
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: headers(init.headers as Record<string, string>) });
  } catch (err) {
    log("warn", "api network error", { method, path, ms: Date.now() - started, error: err });
    throw err;
  }
  log(res.ok ? "debug" : "warn", "api", { method, path, status: res.status, ms: Date.now() - started });
  // Without a valid session Access redirects to its login page instead of reaching the Worker.
  const html = (res.headers.get("content-type") ?? "").includes("text/html");
  if (res.status === 401 || res.status === 403 || res.redirected || html || (res.url && !res.url.startsWith(API_URL))) {
    setToken(null); // the session is gone; the app shows the login screen
    throw new ApiError(401, "session expired, please sign in again");
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

interface ServerPreset {
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
}

function fromServer(s: ServerPreset): Preset {
  return {
    id: s.id,
    name: s.name,
    cameraId: s.camera_id ?? null,
    formatId: s.format_id ?? null,
    sensorWidthMm: s.sensor_width_mm,
    sensorHeightMm: s.sensor_height_mm,
    speedboosterFactor: s.speedbooster_factor,
    lensMinMm: s.lens_min_mm ?? null,
    lensMaxMm: s.lens_max_mm ?? null,
    createdAt: s.created_at,
    synced: true,
  };
}

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
  state: "unreviewed" | "approved" | "archived";
  extra: Extra;
  captured_at: string;
  created_at: string;
  updated_at: string | null;
  /** Ordered; never empty. */
  photos: Photo[];
}

/** The photo that stands for the shot in lists, maps and filters: the first one. */
export const cover = (s: Shot): Photo => s.photos[0];

/** Locations and projects share this shape as far as the app is concerned. */
interface ServerNamed { id: string; name: string; created_at: string; field_ids?: string[] }
const namedFromServer = (l: ServerNamed): LocationEntry => ({ id: l.id, name: l.name, createdAt: l.created_at, synced: true });

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

/** Headers for <Image> requests to the API (Access session token). */
export const imageHeaders = (): Record<string, string> => headers();
export const imageUri = (photo: Photo) => `${API_URL}${photo.image_url}`;

export const api = {
  /** Every shot of one project, newest first. */
  listShots: async (projectId: string): Promise<Shot[]> => {
    const all: Shot[] = [];
    let cursor: Cursor = null;
    for (;;) {
      const q: string = `?limit=500&project_id=${projectId}${cursor ? `&before=${encodeURIComponent(cursor.before)}&before_id=${cursor.before_id}` : ""}`;
      const page: ShotsPage = await call<ShotsPage>(`/api/shots${q}`);
      all.push(...page.shots);
      if (!page.next) break;
      cursor = page.next;
    }
    return all;
  },
  /** Correct a photo's position by hand; allInShot moves every photo of its shot. */
  patchPhotoPosition: (id: string, lat: number, lon: number, allInShot: boolean) =>
    call<{ shot: Shot }>(`/api/photos/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat, lon, all_in_shot: allInShot }) }).then((r) => r.shot),
  deleteShot: (id: string) => call<{ deleted: string }>(`/api/shots/${id}`, { method: "DELETE" }),
  patchShot: (id: string, patch: Partial<ShotTags> & { state?: Shot["state"]; project_id?: string }) =>
    call<{ shot: Shot }>(`/api/shots/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => r.shot),

  listLocations: async (): Promise<LocationEntry[]> => {
    const r = await call<{ locations: ServerNamed[] }>("/api/locations");
    return r.locations.map(namedFromServer);
  },
  /** Upsert; a 409 means another location already has this name (ApiError.body.existing_id). */
  putLocation: (l: LocationEntry) =>
    call<{ location: ServerNamed }>(`/api/locations/${l.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: l.name }),
    }),

  listFields: () => call<{ fields: FieldDefinition[] }>("/api/fields").then((r) => r.fields),

  listProjects: async (): Promise<ProjectEntry[]> => {
    const r = await call<{ projects: ServerNamed[] }>("/api/projects");
    return r.projects.map((p): ProjectEntry => ({ ...namedFromServer(p), fieldIds: p.field_ids ?? [] }));
  },
  /** Upsert; a 409 means another project already has this name (ApiError.body.existing_id). */
  putProject: (p: ProjectEntry) =>
    call<{ project: ServerNamed }>(`/api/projects/${p.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: p.name }),
    }),
  deleteLocation: (id: string) => call<{ deleted: string }>(`/api/locations/${id}`, { method: "DELETE" }),

  health: () => call<{ ok: boolean; identity: string }>("/health"),

  listPresets: async (): Promise<Preset[]> => {
    const r = await call<{ presets: ServerPreset[] }>("/api/presets");
    return r.presets.map(fromServer);
  },

  putPreset: (p: Preset) =>
    call<{ preset: ServerPreset }>(`/api/presets/${p.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        camera_id: p.cameraId,
        format_id: p.formatId,
        sensor_width_mm: p.sensorWidthMm,
        sensor_height_mm: p.sensorHeightMm,
        speedbooster_factor: p.speedboosterFactor,
        lens_min_mm: p.lensMinMm,
        lens_max_mm: p.lensMaxMm,
      }),
    }),

  deletePreset: (id: string) => call<{ deleted: string }>(`/api/presets/${id}`, { method: "DELETE" }),

  /**
   * Multipart upload of a shot and its photos. `files` maps photo id -> local file:// URI of a JPEG.
   * Idempotent on the server: photos already stored are skipped, so a retry is always safe.
   */
  uploadShot: (metadata: ShotMetadata, files: Record<string, string>) => {
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    // Expo's global fetch is the WinterCG implementation: it rejects React Native's
    // {uri,name,type} descriptors but accepts an expo-file-system File directly.
    for (const p of metadata.photos) form.append(`photo.${p.id}`, new File(files[p.id]) as unknown as Blob, `${p.id}.jpg`);
    return call<{ shot: { id: string }; duplicate?: boolean }>("/api/shots", { method: "POST", body: form });
  },
};
