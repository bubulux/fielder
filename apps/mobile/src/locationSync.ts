import { api, ApiError } from "./api";
import type { LocationEntry } from "./types";

export interface LocationSyncResult {
  /** Authoritative server list. */
  locations: LocationEntry[];
  /** Local ids that clashed with an existing name on the server -> the id to use instead. */
  remap: Record<string, string>;
}

/**
 * Push locations created offline, then pull the server list (the server is the source of truth).
 * A name clash (409) adopts the existing location instead of failing. Returns null when offline.
 */
export async function syncLocations(local: LocationEntry[]): Promise<LocationSyncResult | null> {
  const remap: Record<string, string> = {};
  try {
    for (const l of local.filter((x) => !x.synced)) {
      try {
        await api.putLocation(l);
      } catch (err) {
        const existing = err instanceof ApiError && err.status === 409 ? (err.body as { existing_id?: unknown } | null)?.existing_id : undefined;
        if (typeof existing === "string") { remap[l.id] = existing; continue; }
        throw err;
      }
    }
    return { locations: await api.listLocations(), remap };
  } catch (err) {
    console.warn("location sync failed", err);
    return null;
  }
}

/**
 * Make sure a location exists on the server before something references it (edits, not uploads).
 * Returns the id to use: the location's own id, or the existing one on a name clash.
 */
export async function ensureLocation(l: LocationEntry): Promise<string> {
  if (l.synced) return l.id;
  try {
    await api.putLocation(l);
    return l.id;
  } catch (err) {
    const existing = err instanceof ApiError && err.status === 409 ? (err.body as { existing_id?: unknown } | null)?.existing_id : undefined;
    if (typeof existing === "string") return existing;
    throw err;
  }
}
