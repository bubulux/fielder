import { File } from "expo-file-system";
import { getToken, setToken } from "./auth";
import { API_URL, isConfigured } from "./config";
import type { LocationEntry, Preset, ShotMetadata, ShotTags } from "./types";

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
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: headers(init.headers as Record<string, string>) });
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
  state: "unreviewed" | "approved" | "archived";
  extra: Record<string, string>;
}

interface ServerLocation {
  id: string;
  name: string;
  district: string;
  created_at: string;
  updated_at: string | null;
  shot_count: number;
  approved_count: number;
}
const locationFromServer = (l: ServerLocation): LocationEntry => ({ id: l.id, name: l.name, district: l.district, createdAt: l.created_at, synced: true });

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

/** Headers for <Image> requests to the API (Access session token). */
export const imageHeaders = (): Record<string, string> => headers();
export const imageUri = (shot: Shot) => `${API_URL}${shot.image_url}`;

export const api = {
  listShots: async (): Promise<Shot[]> => {
    const all: Shot[] = [];
    let cursor: Cursor = null;
    for (;;) {
      const q: string = cursor ? `?limit=500&before=${encodeURIComponent(cursor.before)}&before_id=${cursor.before_id}` : "?limit=500";
      const page: ShotsPage = await call<ShotsPage>(`/api/shots${q}`);
      all.push(...page.shots);
      if (!page.next) break;
      cursor = page.next;
    }
    return all;
  },
  deleteShot: (id: string) => call<{ deleted: string }>(`/api/shots/${id}`, { method: "DELETE" }),
  patchShot: (id: string, patch: Partial<ShotTags> & { state?: Shot["state"] }) =>
    call<{ shot: Shot }>(`/api/shots/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => r.shot),

  listLocations: async (): Promise<LocationEntry[]> => {
    const r = await call<{ locations: ServerLocation[] }>("/api/locations");
    return r.locations.map(locationFromServer);
  },
  /** Upsert; a 409 means another location already has this name (ApiError.body.existing_id). */
  putLocation: (l: LocationEntry) =>
    call<{ location: ServerLocation }>(`/api/locations/${l.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: l.name, district: l.district }),
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

  /** Multipart upload. `fileUri` must be a local file:// URI of a JPEG. */
  uploadShot: (metadata: ShotMetadata, fileUri: string) => {
    const form = new FormData();
    // Expo's global fetch is the WinterCG implementation: it rejects React Native's
    // {uri,name,type} descriptors but accepts an expo-file-system File directly.
    form.append("image", new File(fileUri) as unknown as Blob, `${metadata.id}.jpg`);
    form.append("metadata", JSON.stringify(metadata));
    return call<{ shot: { id: string }; duplicate?: boolean }>("/api/shots", { method: "POST", body: form });
  },
};
