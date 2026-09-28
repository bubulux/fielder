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

export function useOnline(): boolean {
  const [v, setV] = useState(online);
  useEffect(() => { setV(online); listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}
