import { useEffect, useState } from "react";

/**
 * Whether the server was reachable on the last API call. There is no network-state module in
 * Expo Go without a new dependency, and "the phone has a network" is not the question anyway:
 * what matters is whether the Worker answers. Set by api.ts; starts optimistic.
 */
let online = true;
const listeners = new Set<(v: boolean) => void>();

export function markOnline(v: boolean) {
  if (v === online) return;
  online = v;
  for (const cb of listeners) cb(v);
}

export const isOnline = () => online;

/**
 * Offline mode (Setup → Offline): the app makes no requests at all, so nothing waits on a dead
 * network or spends battery and data; everything queues. Counts as offline for the UI.
 */
let paused = false;
export const isOfflineMode = () => paused;
export function setOfflineMode(v: boolean) {
  paused = v;
  // Back on: optimistic until the next request says otherwise.
  markOnline(!v);
}

export function useOnline(): boolean {
  const [v, setV] = useState(online);
  useEffect(() => { setV(online); listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}
