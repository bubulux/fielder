import { api } from "./api";
import type { Preset } from "./types";

/**
 * Server is the source of truth for rigs. Push anything created offline first,
 * then take the server list. Returns null when the server is unreachable so the
 * caller keeps the local list.
 */
export async function syncPresets(local: Preset[]): Promise<Preset[] | null> {
  try {
    for (const p of local.filter((x) => !x.synced)) {
      await api.putPreset(p);
    }
    return await api.listPresets();
  } catch {
    return null;
  }
}
