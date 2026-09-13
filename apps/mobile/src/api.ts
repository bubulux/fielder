import { File } from "expo-file-system";
import { API_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, isConfigured } from "./config";
import type { Preset, ShotMetadata } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET,
    ...extra,
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isConfigured) throw new ApiError(0, "API not configured in this build");
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: headers(init.headers as Record<string, string>) });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page, e.g. Access login HTML */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
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
}

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

/** Headers for <Image> requests to the API (Access service token). */
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
