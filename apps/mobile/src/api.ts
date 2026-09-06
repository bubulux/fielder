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

export const api = {
  health: () => call<{ ok: boolean; identity: string }>("/health"),

  putPreset: (p: Preset) =>
    call<{ preset: unknown }>(`/api/presets/${p.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        sensor_width_mm: p.sensorWidthMm,
        sensor_height_mm: p.sensorHeightMm,
        speedbooster_factor: p.speedboosterFactor,
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
