import { useEffect, useState } from "react";
import { useOnline } from "./net";
import { onPendingChange, store } from "./storage";
import { flushState, onFlushed, onFlushProgress, type FlushProgress } from "./uploads";

/** What the header sync icon, the Setup status card and the Shoot Uploads badge show. */
export type SyncState = "ok" | "pending" | "uploading" | "stuck" | "offline";

export interface Sync {
  state: SyncState;
  /** Shots in the queue (stuck ones included). */
  pending: number;
  stuck: number;
  online: boolean;
  progress: FlushProgress | null;
}

function read() {
  const q = store.loadPending();
  return { pending: q.length, stuck: q.filter((p) => p.stuck).length, ...flushState() };
}

/** Stuck beats everything (it needs a decision), then a running upload, then offline, then waiting. */
export function useSync(): Sync {
  const online = useOnline();
  const [v, setV] = useState(read);
  useEffect(() => {
    const again = () => setV(read());
    const offs = [onPendingChange(again), onFlushProgress(again), onFlushed(again)];
    return () => { for (const off of offs) off(); };
  }, []);
  const state: SyncState = v.stuck > 0 ? "stuck" : v.flushing && v.pending > 0 ? "uploading" : !online ? "offline" : v.pending > 0 ? "pending" : "ok";
  return { state, pending: v.pending, stuck: v.stuck, online, progress: v.progress };
}
