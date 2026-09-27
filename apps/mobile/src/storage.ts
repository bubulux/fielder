import { useEffect, useState } from "react";
import Storage from "expo-sqlite/kv-store";
import { DEFAULT_SETTINGS } from "./defaults";
import type { FieldDef, FieldDefinition } from "@fielder/vocab";
import type { CaptureDraft, LocationEntry, PendingUpload, Preset, ProjectEntry, Settings } from "./types";

export { DEFAULT_SETTINGS };

const KEYS = {
  settings: "settings.v1",
  presets: "presets.v1",
  activePresetId: "activePresetId.v1",
  lensMm: "lensMm.v1",
  // v2: shot + photos model (2026-09 rework); v1 entries are not migrated.
  pending: "pendingUploads.v2",
  locations: "locations.v2",
  projects: "projects.v1",
  activeProjectId: "activeProjectId.v1",
  sequence: "sequence.v1",
  captureDraft: "captureDraft.v1",
  fields: "fields.v1",
} as const;


function read<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}
function readArray<T>(key: string): T[] {
  try {
    const raw = Storage.getItemSync(key);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function write(key: string, value: unknown) {
  Storage.setItemSync(key, JSON.stringify(value));
}

const pendingListeners = new Set<(count: number) => void>();
/** Called with the queue length whenever the upload queue changes. Returns the unsubscribe function. */
export function onPendingChange(cb: (count: number) => void): () => void {
  pendingListeners.add(cb);
  return () => { pendingListeners.delete(cb); };
}

export const store = {
  loadSettings: (): Settings => read(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (s: Settings) => write(KEYS.settings, s),

  loadPresets: (): Preset[] =>
    readArray<Preset>(KEYS.presets).map((p) => ({ ...p, cameraId: p.cameraId ?? null, formatId: p.formatId ?? null, lensMinMm: p.lensMinMm ?? null, lensMaxMm: p.lensMaxMm ?? null })),
  savePresets: (p: Preset[]) => write(KEYS.presets, p),

  loadActivePresetId: (): string | null => Storage.getItemSync(KEYS.activePresetId),
  saveActivePresetId: (id: string | null) =>
    id ? Storage.setItemSync(KEYS.activePresetId, id) : Storage.removeItemSync(KEYS.activePresetId),

  loadLensMm: (): number => Number(Storage.getItemSync(KEYS.lensMm) ?? 35) || 35,
  saveLensMm: (mm: number) => Storage.setItemSync(KEYS.lensMm, String(mm)),

  loadPending: (): PendingUpload[] => readArray<PendingUpload>(KEYS.pending),
  savePending: (q: PendingUpload[]) => { write(KEYS.pending, q); for (const cb of pendingListeners) cb(q.length); },

  loadLocations: (): LocationEntry[] => readArray<LocationEntry>(KEYS.locations),
  saveLocations: (l: LocationEntry[]) => write(KEYS.locations, l),

  loadProjects: (): ProjectEntry[] => readArray<ProjectEntry>(KEYS.projects),
  saveProjects: (p: ProjectEntry[]) => write(KEYS.projects, p),

  /** The sequence being shot (survives an app restart), or null. */
  loadSequence: (): CaptureDraft | null => { try { const raw = Storage.getItemSync(KEYS.sequence); return raw ? (JSON.parse(raw) as CaptureDraft) : null; } catch { return null; } },
  saveSequence: (d: CaptureDraft | null) => (d ? write(KEYS.sequence, d) : Storage.removeItemSync(KEYS.sequence)),
  /** A capture or finished sequence waiting in the tag form (reopens after an app restart), or null. */
  loadCaptureDraft: (): CaptureDraft | null => { try { const raw = Storage.getItemSync(KEYS.captureDraft); return raw ? (JSON.parse(raw) as CaptureDraft) : null; } catch { return null; } },
  saveCaptureDraft: (d: CaptureDraft | null) => (d ? write(KEYS.captureDraft, d) : Storage.removeItemSync(KEYS.captureDraft)),

  loadFields: (): FieldDefinition[] => readArray<FieldDefinition>(KEYS.fields),
  saveFields: (f: FieldDefinition[]) => write(KEYS.fields, f),
  /** Extra-field definitions a project uses, in its order (cached, works offline). */
  fieldsForProject: (projectId: string | null | undefined): FieldDef[] => {
    const ids = readArray<ProjectEntry>(KEYS.projects).find((p) => p.id === projectId)?.fieldIds ?? [];
    const all = readArray<FieldDefinition>(KEYS.fields);
    return ids.map((id) => all.find((f) => f.id === id)?.definition).filter((d): d is FieldDef => !!d);
  },

  loadActiveProjectId: (): string | null => Storage.getItemSync(KEYS.activeProjectId),
  saveActiveProjectId: (id: string | null) =>
    id ? Storage.setItemSync(KEYS.activeProjectId, id) : Storage.removeItemSync(KEYS.activeProjectId),
};

/** Queue length that re-renders when uploads are added or finish. */
export function usePendingCount(): number {
  const [n, setN] = useState(() => store.loadPending().length);
  useEffect(() => onPendingChange(setN), []);
  return n;
}
