import { useEffect, useState } from "react";
import { api } from "./api";
import { log } from "./log";
import { syncPresets } from "./presetSync";
import { store } from "./storage";
import type { Preset } from "./types";

/**
 * Rigs (presets) and the one in use, shared by the Shoot tab, its Rig sheet, Setup → Rigs and the
 * Rig editor. Kept in storage so they work offline; the server list wins after a sync.
 */
let rigs: Preset[] = store.loadPresets();
let activeId: string | null = store.loadActivePresetId();
const listeners = new Set<() => void>();

function commit(next: Preset[], nextActive: string | null) {
  rigs = next;
  activeId = nextActive && next.some((p) => p.id === nextActive) ? nextActive : next[0]?.id ?? null;
  store.savePresets(rigs);
  store.saveActivePresetId(activeId);
  for (const cb of listeners) cb();
}

export interface Rigs { rigs: Preset[]; activeId: string | null; active: Preset | null }
const snapshot = (): Rigs => ({ rigs, activeId, active: rigs.find((p) => p.id === activeId) ?? rigs[0] ?? null });

export function useRigs(): Rigs {
  const [v, setV] = useState(snapshot);
  useEffect(() => { const cb = () => setV(snapshot()); listeners.add(cb); cb(); return () => { listeners.delete(cb); }; }, []);
  return v;
}

export const getRigs = snapshot;
/** Shoot with this rig from now on. */
export const pickRig = (id: string) => commit(rigs, id);

/** Save locally first (usable at once, also offline), then push; an unsynced rig is pushed again by the next sync. */
export async function saveRig(p: Preset, use = true) {
  const next = rigs.some((x) => x.id === p.id) ? rigs.map((x) => (x.id === p.id ? { ...p, synced: false } : x)) : [...rigs, { ...p, synced: false }];
  commit(next, use ? p.id : activeId);
  try {
    await api.putPreset(p);
    commit(rigs.map((x) => (x.id === p.id ? { ...x, synced: true } : x)), activeId);
  } catch (err) {
    log("warn", "rig sync failed; retried on the next sync", { rig: p.id, error: err });
  }
}

export async function deleteRig(id: string) {
  commit(rigs.filter((x) => x.id !== id), activeId === id ? null : activeId);
  try { await api.deletePreset(id); } catch (err) { log("warn", "rig delete failed", { rig: id, error: err }); }
}

/** Push offline edits, then take the server list. No-op when unreachable. */
export async function syncRigs() {
  const server = await syncPresets(rigs);
  if (server) commit(server, activeId);
}
