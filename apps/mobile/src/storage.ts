import Storage from "expo-sqlite/kv-store";
import { DEFAULT_SETTINGS } from "./defaults";
import type { PendingUpload, Preset, Settings } from "./types";

export { DEFAULT_SETTINGS };

const KEYS = {
  settings: "settings.v1",
  presets: "presets.v1",
  activePresetId: "activePresetId.v1",
  lensMm: "lensMm.v1",
  pending: "pendingUploads.v1",
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

export const store = {
  loadSettings: (): Settings => read(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (s: Settings) => write(KEYS.settings, s),

  loadPresets: (): Preset[] =>
    readArray<Preset>(KEYS.presets).map((p) => ({ ...p, cameraId: p.cameraId ?? null, formatId: p.formatId ?? null })),
  savePresets: (p: Preset[]) => write(KEYS.presets, p),

  loadActivePresetId: (): string | null => Storage.getItemSync(KEYS.activePresetId),
  saveActivePresetId: (id: string | null) =>
    id ? Storage.setItemSync(KEYS.activePresetId, id) : Storage.removeItemSync(KEYS.activePresetId),

  loadLensMm: (): number => Number(Storage.getItemSync(KEYS.lensMm) ?? 35) || 35,
  saveLensMm: (mm: number) => Storage.setItemSync(KEYS.lensMm, String(mm)),

  loadPending: (): PendingUpload[] => readArray<PendingUpload>(KEYS.pending),
  savePending: (q: PendingUpload[]) => write(KEYS.pending, q),
};
