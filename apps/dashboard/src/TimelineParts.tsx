import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { PRESENTATION_MODES, type Presentation } from "@fielder/vocab";
import { copyOverlay, copySketch, deleteTimeline, putTimeline, type Overlay, type Photo, type Shot, type Sketch, type Timeline, type TimelineClip } from "./api";
import { frameModeLabel, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { invalidateTimelines } from "./Inspector";
import { FramingSelect, presentationFrame, rootPresentation } from "./FramingSelect";
import { Button, confirmDialog, cx, EmptyNote, Field, Icon, IconButton, Input, Kbd, Panel, PanelBody, PanelHead, Seg, Select, Spinner, toast, type SaveState } from "./ui";

/**
 * The pieces a timeline is edited with, shared by the Timeline page and the Review workspace
 * (issue #31): resolving clips, playback, the strip (with drag and drop), the preview and the
 * clip panel. A clip without a photo is a placeholder holding the spot for a shot to come.
 */

export const DEFAULT_MS = 3000;
/** The right drawer (clip panel, shot browser) shares one remembered width. */
export const DRAWER_RESIZE = { key: "timelineDrawer", min: 300, max: 720 };
export const STEP_MS = 500;
const PX_PER_S = 44;
const MIN_CLIP_PX = 64;
/** "1:02.5" */
export const clock = (ms: number) => { const s = ms / 1000; const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`; };
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * A clip with what it points at; photo clips of deleted shots/photos are skipped (the server drops
 * them on the next save). `ownOverlays` / `ownSketch` are what the clip made inline (issue #31).
 */
export type ResolvedClip =
  | { kind: "photo"; clip: TimelineClip; pres: Presentation; shot: Shot; photo: Photo; overlay: Overlay | null; ownOverlays: Overlay[]; ownSketch: Sketch | null; index: number; startMs: number }
  | { kind: "sketch"; clip: TimelineClip; sketch: Sketch; index: number; startMs: number }
  | { kind: "placeholder"; clip: TimelineClip; index: number; startMs: number };

export function resolveClips(t: Timeline, byId: Map<string, Shot>): ResolvedClip[] {
  const out: ResolvedClip[] = [];
  const own = (clipId: string) => t.overlays.filter((o) => o.clip_id === clipId);
  const sketches = new Map<string, Sketch>([...[...byId.values()].flatMap((s) => s.sketches), ...t.sketches].map((k) => [k.id, k]));
  let at = 0;
  t.clips.forEach((clip, index) => {
    if (clip.photo_id === null) {
      const sketch = clip.sketch_id ? sketches.get(clip.sketch_id) : undefined;
      out.push(sketch ? { kind: "sketch", clip, sketch, index, startMs: at } : { kind: "placeholder", clip, index, startMs: at });
      at += clip.duration_ms;
      return;
    }
    const shot = clip.shot_id ? byId.get(clip.shot_id) : undefined;
    const photo = shot?.photos.find((p) => p.id === clip.photo_id);
    if (!shot || !photo || !clip.presentation) return;
    const ownOverlays = own(clip.id);
    const overlay = shot.overlays.find((o) => o.id === clip.overlay_id) ?? ownOverlays.find((o) => o.id === clip.overlay_id) ?? null;
    out.push({ kind: "photo", clip, pres: clip.presentation, shot, photo, overlay, ownOverlays, ownSketch: t.sketches.find((k) => k.clip_id === clip.id) ?? null, index, startMs: at });
    at += clip.duration_ms;
  });
  return out;
}
/** A clip's own re-frame (issue #31): no saved framing, but a placed frame (re-framed inline). */
export const ownReframe = (pres: Presentation) => !pres.framing_id && pres.frame?.x !== undefined;
/** Default presentation of a photo: the view's frame mode and the rig it was shot with. */
export const defaultPresentation = (photo: Photo, mode: MaskMode): Presentation => ({ mode, ...rootPresentation(photo) });
/** The clips a shot contributes when added: one per photo, each at the default hold time. */
export const clipsOfShot = (s: Shot, mode: MaskMode): TimelineClip[] =>
  s.photos.map((p): TimelineClip => ({ id: crypto.randomUUID(), photo_id: p.id, shot_id: s.id, overlay_id: null, presentation: defaultPresentation(p, mode), duration_ms: DEFAULT_MS, notes: null, title: null, sketch_id: null }));
export const newPlaceholder = (title: string): TimelineClip =>
  ({ id: crypto.randomUUID(), photo_id: null, shot_id: null, overlay_id: null, presentation: null, duration_ms: DEFAULT_MS, notes: null, title, sketch_id: null });

export const clipLabel = (c: ResolvedClip): string => (c.kind === "photo" ? shotTitle(c.shot) : c.kind === "sketch" ? c.sketch.name : c.clip.title ?? "Placeholder");

/**
 * Copy a clip for Duplicate: a new id, and its own overlay or sketch copied server-side so the two
 * clips do not share a drawing. Shot overlays and sketches are shared (they are references).
 */
export async function copyClip(t: Timeline, clip: TimelineClip): Promise<TimelineClip> {
  const copy: TimelineClip = { ...clip, id: crypto.randomUUID() };
  const owner = { timeline_id: t.id, clip_id: copy.id };
  if (clip.overlay_id && t.overlays.some((o) => o.id === clip.overlay_id)) copy.overlay_id = (await copyOverlay(clip.overlay_id, crypto.randomUUID(), owner)).id;
  if (clip.sketch_id && t.sketches.some((k) => k.id === clip.sketch_id)) copy.sketch_id = (await copySketch(clip.sketch_id, crypto.randomUUID(), owner)).id;
  return copy;
}

/**
 * Duplicate a timeline with its clips' own overlays and sketches: the copy is saved first (its clips
 * can only own drawings once it exists), then the drawings are copied, then the clips point at them.
 */
export async function duplicateTimeline(t: Timeline): Promise<Timeline> {
  const ids = new Map(t.clips.map((c) => [c.id, crypto.randomUUID()]));
  const ownOverlay = new Set(t.overlays.map((o) => o.id)), ownSketch = new Set(t.sketches.map((k) => k.id));
  const base: Timeline = { ...t, id: crypto.randomUUID(), name: `${t.name} (copy)`, overlays: [], sketches: [], created_at: "", updated_at: null, clips: [] };
  const stripped = t.clips.map((c) => ({ ...c, id: ids.get(c.id)!, overlay_id: c.overlay_id && ownOverlay.has(c.overlay_id) ? null : c.overlay_id, sketch_id: c.sketch_id && ownSketch.has(c.sketch_id) ? null : c.sketch_id }));
  await putTimeline({ ...base, clips: stripped });
  const clips = await Promise.all(t.clips.map(async (c, i) => {
    const owner = { timeline_id: base.id, clip_id: ids.get(c.id)! };
    const next = { ...stripped[i] };
    if (c.overlay_id && ownOverlay.has(c.overlay_id)) next.overlay_id = (await copyOverlay(c.overlay_id, crypto.randomUUID(), owner)).id;
    if (c.sketch_id && ownSketch.has(c.sketch_id)) next.sketch_id = (await copySketch(c.sketch_id, crypto.randomUUID(), owner)).id;
    return next;
  }));
  return putTimeline({ ...base, clips });
}

// ---------- The project's timelines with autosave (600 ms debounce, flush on leave) ----------

export interface TimelineStore {
  list: Timeline[] | null;
  setList: (f: (cur: Timeline[] | null) => Timeline[] | null) => void;
  error: string | null;
  save: SaveState;
  change: (t: Timeline) => void;
  create: (projectId: string) => Promise<Timeline | null>;
  remove: (t: Timeline) => Promise<boolean>;
  retry: () => void;
  /** Send a pending change now (a promotion needs the clip on the server). */
  saveNow: (id: string) => Promise<void>;
  /** Take the server's copy (after a promotion changed it there). */
  replace: (t: Timeline) => void;
}

export function useTimelineStore(load: (set: (t: Timeline[]) => void, fail: (e: Error) => void) => void, deps: unknown[]): TimelineStore {
  const [list, setListState] = useState<Timeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; t: Timeline }>());
  useEffect(() => { setListState(null); load(setListState, (e) => setError(e.message)); }, deps);
  const setList = (f: (cur: Timeline[] | null) => Timeline[] | null) => setListState(f);
  const flush = (t: Timeline): Promise<void> => {
    pending.current.delete(t.id);
    setSave("saving");
    return putTimeline(t).then((saved) => {
      invalidateTimelines(t.project_id);
      // The server may have dropped clips of deleted photos; take its list.
      setListState((cur) => (cur ?? []).map((x) => (x.id === saved.id && !pending.current.has(saved.id) ? saved : x)));
      if (pending.current.size === 0) setSave("saved");
    }).catch((e: Error) => { setSave("error"); setError(e.message); pending.current.set(t.id, { t, timer: setTimeout(() => {}, 0) }); });
  };
  useEffect(() => () => { for (const { timer, t } of pending.current.values()) { clearTimeout(timer); void putTimeline(t).catch(() => {}); } pending.current.clear(); }, []);
  const retry = () => { for (const { t } of [...pending.current.values()]) flush(t); };
  const change = (t: Timeline) => {
    setListState((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)));
    setSave("dirty");
    const prev = pending.current.get(t.id);
    if (prev) clearTimeout(prev.timer);
    pending.current.set(t.id, { t, timer: setTimeout(() => flush(t), 600) });
  };
  const create = async (projectId: string): Promise<Timeline | null> => {
    const n = (list?.length ?? 0) + 1;
    const t: Timeline = { id: crypto.randomUUID(), project_id: projectId, name: `Cut ${n}`, notes: null, lock_mode: null, clips: [], overlays: [], sketches: [], created_at: "", updated_at: null };
    try { const saved = await putTimeline(t); invalidateTimelines(projectId); setListState((cur) => [...(cur ?? []), saved]); return saved; } catch (e) { toast(`Could not create the timeline: ${(e as Error).message}`, "danger"); return null; }
  };
  const remove = async (t: Timeline): Promise<boolean> => {
    const ok = await confirmDialog({ title: `Delete “${t.name}”?`, body: `The timeline and its ${t.clips.length} clip${t.clips.length === 1 ? "" : "s"} are deleted. The shots stay.`, confirmLabel: "Delete timeline", danger: true });
    if (!ok) return false;
    try { await deleteTimeline(t.id); invalidateTimelines(t.project_id); setListState((cur) => (cur ?? []).filter((x) => x.id !== t.id)); return true; } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); return false; }
  };
  const saveNow = async (id: string) => { const p = pending.current.get(id); if (!p) return; clearTimeout(p.timer); await flush(p.t); };
  const replace = (t: Timeline) => setListState((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)));
  return { list, setList, error, save, change, create, remove, retry, saveNow, replace };
}

// ---------- Playback: 100 ms ticks; the next clip starts when the hold time is up, the end stops ----------

export interface Cut {
  cur: ResolvedClip | null;
  sel: string | null;
  select: (id: string | null) => void;
  /** Scrubbing: jump into a clip at `ms`; playback (if running) continues from there. */
  seek: (id: string, ms: number) => void;
  step: (d: number) => void;
  toggle: () => void;
  playing: boolean;
  elapsed: number;
  playheadMs: number;
}

export function useCut(clips: ResolvedClip[]): Cut {
  const [sel, setSel] = useState<string | null>(clips[0]?.clip.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // within the selected clip
  const selIdx = clips.findIndex((c) => c.clip.id === sel);
  const cur = selIdx >= 0 ? clips[selIdx] : clips[0] ?? null;
  useEffect(() => { if (cur && cur.clip.id !== sel) setSel(cur.clip.id); }, [cur?.clip.id]);
  useEffect(() => {
    if (!playing || !cur) return;
    const id = setInterval(() => setElapsed((e) => e + 100), 100);
    return () => clearInterval(id);
  }, [playing, cur?.clip.id]);
  useEffect(() => {
    if (!playing || !cur) return;
    if (elapsed >= cur.clip.duration_ms) {
      const next = clips[clips.indexOf(cur) + 1];
      if (next) { setSel(next.clip.id); setElapsed(0); } else { setPlaying(false); setElapsed(cur.clip.duration_ms); }
    }
  }, [elapsed]);
  const select = (id: string | null) => { setSel(id); setElapsed(0); };
  const seek = (id: string, ms: number) => { setSel(id); setElapsed(Math.max(0, ms)); };
  const step = (d: number) => { if (!cur) return; const n = clips[Math.max(0, Math.min(clips.length - 1, clips.indexOf(cur) + d))]; if (n) select(n.clip.id); };
  const toggle = () => { if (!cur) return; if (!playing && cur === clips.at(-1) && elapsed >= cur.clip.duration_ms) { select(clips[0].clip.id); } setPlaying(!playing); };
  const playheadMs = cur ? cur.startMs + Math.min(elapsed, cur.clip.duration_ms) : 0;
  return { cur, sel, select, seek, step, toggle, playing, elapsed, playheadMs };
}

/** A sketch clip on stage: its render on the white canvas, letterboxed like a photo. */
export function SketchView({ sketch }: { sketch: Sketch }) {
  return (
    <div class="tl-sketch-view" style={{ aspectRatio: String(sketch.aspect), width: `min(100%, calc(${STAGE_H} * ${sketch.aspect}))` }}>
      {sketch.render_url ? <img src={sketch.render_url} alt="" /> : <span class="meta"><Icon name="floor-plan" /> Empty sketch</span>}
    </div>
  );
}

/** The timeline's presentation lock: per clip, or one mode forced on every clip. */
export function LockSelect({ value, onChange }: { value: MaskMode | null; onChange: (m: MaskMode | null) => void }) {
  return (
    <Select label="Presentation" icon={value ? "lock-outline" : "lock-open-variant-outline"} width="190px"
      value={value ?? ""} onChange={(v) => onChange((v || null) as MaskMode | null)}
      options={[{ value: "", label: "Per clip" }, ...PRESENTATION_MODES.map((m) => ({ value: m, label: `Lock: ${frameModeLabel(m)}`, group: "Locked for all clips" }))]} />
  );
}

// ---------- Preview + transport ----------

/** The stage keeps one height whatever is on it (shot, placeholder, an inline editor): clips letterbox into it. */
export const STAGE_H = "var(--tl-stage-h)";

const STAGE_MIN = 200;
const loadStageH = (): number | null => { try { const v = Number(localStorage.getItem("timelineStageH")); return v >= STAGE_MIN ? v : null; } catch { return null; } };

/**
 * The stage height: the default fills the window (`--tl-stage-h` in CSS); dragging the grip under
 * the stage sets a height of its own, remembered per browser; double-click goes back to the default.
 */
function useStageHeight() {
  const [px, setPx] = useState<number | null>(loadStageH);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const save = (v: number | null) => { try { if (v === null) localStorage.removeItem("timelineStageH"); else localStorage.setItem("timelineStageH", String(v)); } catch { /* a preference */ } };
  const grip = (
    <div class="tl-stage__grip" role="separator" aria-orientation="horizontal" aria-label="Resize the stage" title="Drag to resize the stage · double-click resets"
      onPointerDown={(e) => { const stage = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null; drag.current = { y: e.clientY, h: stage?.getBoundingClientRect().height ?? 400 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setPx(Math.round(Math.max(STAGE_MIN, Math.min(window.innerHeight - 160, d.h + e.clientY - d.y)))); }}
      onPointerUp={() => { if (drag.current) { drag.current = null; setPx((v) => { save(v); return v; }); } }}
      onPointerCancel={() => { drag.current = null; }}
      onDblClick={() => { setPx(null); save(null); }}><span /></div>
  );
  return { style: px !== null ? { "--tl-stage-h": `${px}px` } : undefined, grip };
}

export function CutPreview({ cut, clips, total, lock, stage, editing, children }: { cut: Cut; clips: ResolvedClip[]; total: number; lock?: MaskMode | null; /** Replaces the clip on stage (an inline editor). */ stage?: ComponentChildren; editing?: boolean; children?: ComponentChildren }) {
  const { cur } = cut;
  const height = useStageHeight();
  return (
    <div class="tl-preview" style={height.style as JSX.CSSProperties | undefined}>
      <div class={cx("tl-stage", editing && "tl-stage--edit")}>
        {stage ?? (!cur ? <div class="tl-preview__empty"><Icon name="filmstrip" /><span>Add shots to start the cut</span></div>
          : cur.kind === "photo" ? <Framed photo={cur.photo} mode={lock ?? cur.pres.mode} frame={presentationFrame(cur.photo, cur.pres)} src={cur.overlay?.render_url ?? undefined} maxHeight={STAGE_H} />
          : cur.kind === "sketch" ? <SketchView sketch={cur.sketch} />
          : (
            <div class="tl-ph-view">
              <Icon name="image-off-outline" />
              <strong>{cur.clip.title}</strong>
              {cur.clip.notes && <span class="tl-ph-view__notes">{cur.clip.notes}</span>}
              <span class="meta" style={{ color: "inherit" }}>Placeholder · drop a shot here when you have it</span>
            </div>
          ))}
      </div>
      {height.grip}
      <div class="tl-transport">
        <IconButton kind="secondary" icon="skip-previous" label="First clip (Home)" disabled={!cur} onClick={() => clips[0] && cut.select(clips[0].clip.id)} />
        <IconButton kind="secondary" icon="chevron-left" label="Previous clip (←)" disabled={!cur || clips.indexOf(cur) === 0} onClick={() => cut.step(-1)} />
        <Button icon={cut.playing ? "pause" : "play"} kbd="Space" disabled={!cur} onClick={cut.toggle} style={{ minWidth: "110px" }}>{cut.playing ? "Pause" : "Play"}</Button>
        <IconButton kind="secondary" icon="chevron-right" label="Next clip (→)" disabled={!cur || clips.indexOf(cur) === clips.length - 1} onClick={() => cut.step(1)} />
        <IconButton kind="secondary" icon="skip-next" label="Last clip (End)" disabled={!cur} onClick={() => clips.at(-1) && cut.select(clips.at(-1)!.clip.id)} />
        <span class="num tl-clock"><strong>{clock(cut.playheadMs)}</strong> / {clock(total)}</span>
        {cur && <span class="meta num">clip {clips.indexOf(cur) + 1} of {clips.length} · {secs(cur.clip.duration_ms)}</span>}
        <span class="grow" />
        {children}
      </div>
    </div>
  );
}

// ---------- The strip: proportional blocks, drag to reorder, drop shots in (issue #31) ----------

const SHOT_TYPE = "application/x-fielder-shot";
const CLIP_TYPE = "application/x-fielder-clip";
/** Mark a shot card as a drag source for the strip. */
export function shotDrag(shotId: string) {
  return { draggable: true, onDragStart: (e: DragEvent) => { e.dataTransfer?.setData(SHOT_TYPE, shotId); if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy"; } };
}
/** Where a drag over the strip would land: between clips, or filling a placeholder. */
type DropAt = { index: number } | { fill: string };

export interface StripProps {
  clips: ResolvedClip[];
  cut: Cut;
  stripRef: RefObject<HTMLDivElement>;
  lock?: MaskMode | null;
  /** The clip edited inline, marked in the strip. */
  editingId?: string | null;
  onOpen: (c: ResolvedClip) => void;
  onReorder: (clipId: string, index: number) => void;
  /** A shot dropped from the browser; absent = the strip accepts no shots (no browser beside it). */
  onDropShot?: (shotId: string, at: DropAt) => void;
  onContext?: (c: ResolvedClip, e: MouseEvent) => void;
}

export function Strip({ clips, cut, stripRef, lock, editingId, onOpen, onReorder, onDropShot, onContext }: StripProps) {
  const { sel, elapsed } = cut;
  const [drop, setDrop] = useState<DropAt | null>(null);
  useEffect(() => { stripRef.current?.querySelector(".is-sel")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }, [sel]);
  const total = clips.reduce((a, c) => a + c.clip.duration_ms, 0);
  const widthPx = (ms: number) => Math.max(MIN_CLIP_PX, (ms / 1000) * PX_PER_S);
  const totalPx = clips.reduce((a, c) => a + widthPx(c.clip.duration_ms), 0);
  const ticks = Array.from({ length: Math.floor(total / 1000) + 1 }, (_, i) => i * 1000);

  const kinds = (e: DragEvent) => {
    const t = e.dataTransfer?.types ?? [];
    return { shot: !!onDropShot && t.includes(SHOT_TYPE), clip: t.includes(CLIP_TYPE) };
  };
  /** Insertion index from the pointer; a shot over a placeholder fills it instead. */
  function target(e: DragEvent, allowFill: boolean): DropAt {
    const els = [...(stripRef.current?.querySelectorAll<HTMLElement>(".tl-clip") ?? [])];
    if (allowFill) {
      const over = (e.target as HTMLElement | null)?.closest<HTMLElement>(".tl-clip");
      if (over?.dataset.ph) return { fill: over.dataset.ph };
    }
    let index = els.length;
    for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { index = i; break; } }
    return { index };
  }
  const onDragOver = (e: DragEvent) => {
    const k = kinds(e);
    if (!k.shot && !k.clip) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = k.clip ? "move" : "copy";
    const at = target(e, k.shot);
    setDrop((cur) => (JSON.stringify(cur) === JSON.stringify(at) ? cur : at));
  };
  const onDrop = (e: DragEvent) => {
    const k = kinds(e);
    setDrop(null);
    if (!k.shot && !k.clip) return;
    e.preventDefault();
    const at = target(e, k.shot);
    const clipId = e.dataTransfer?.getData(CLIP_TYPE);
    if (k.clip && clipId) { if ("index" in at) onReorder(clipId, at.index); return; }
    const shotId = e.dataTransfer?.getData(SHOT_TYPE);
    if (shotId && onDropShot) onDropShot(shotId, at);
  };
  const dropX = drop && "index" in drop ? clips.slice(0, drop.index).reduce((a, c) => a + widthPx(c.clip.duration_ms) + 2, 0) : null;

  // Scrubbing: drag along the ruler; the preview follows (playback, if running, continues from there).
  const scrubbing = useRef(false);
  function seekFromX(clientX: number) {
    const els = [...(stripRef.current?.querySelectorAll<HTMLElement>(".tl-clip") ?? [])];
    for (let i = 0; i < els.length && i < clips.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientX < r.right || i === els.length - 1) {
        const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        cut.seek(clips[i].clip.id, Math.min(Math.round(f * clips[i].clip.duration_ms), clips[i].clip.duration_ms - 1));
        return;
      }
    }
  }
  const scrubDown = (e: PointerEvent) => { if (clips.length === 0) return; e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); scrubbing.current = true; seekFromX(e.clientX); };
  const scrubMove = (e: PointerEvent) => { if (scrubbing.current) seekFromX(e.clientX); };
  const scrubUp = () => { scrubbing.current = false; };

  return (
    <div class="tl-strip-wrap" ref={stripRef} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={(e) => { if (!stripRef.current?.contains(e.relatedTarget as Node)) setDrop(null); }}>
      {clips.length === 0 ? (
        <div class={cx("tl-empty", drop && "is-drop")}>
          <span class="meta">No clips yet. {onDropShot ? "Drag shots here, or add them from the panel." : "Add shots from the panel."} A sequence adds one clip per photo.</span>
        </div>
      ) : (
        <div class="tl-strip" style={{ width: `${totalPx}px` }} role="listbox" aria-label="Clips">
          <div class="tl-ruler" title="Drag to scrub" onPointerDown={scrubDown} onPointerMove={scrubMove} onPointerUp={scrubUp} onPointerCancel={scrubUp}>{ticks.map((ms) => { const x = clips.reduce((a, c) => a + (c.startMs + c.clip.duration_ms <= ms ? widthPx(c.clip.duration_ms) : c.startMs < ms ? widthPx(c.clip.duration_ms) * ((ms - c.startMs) / c.clip.duration_ms) : 0), 0); return <span key={ms} style={{ left: `${x}px` }}>{ms % 5000 === 0 ? clock(ms).replace(/\.0$/, "") : ""}</span>; })}</div>
          <div class="tl-clips">
            {dropX !== null && <span class="tl-dropline" style={{ left: `${dropX - 2}px` }} />}
            {clips.map((c) => (
              <button key={c.clip.id} type="button" role="option" aria-selected={c.clip.id === sel} data-ph={c.kind !== "photo" ? c.clip.id : undefined}
                class={cx("tl-clip", c.kind !== "photo" && "tl-clip--ph", c.kind === "sketch" && "tl-clip--sk", c.clip.id === sel && "is-sel", c.clip.id === editingId && "is-editing", drop && "fill" in drop && drop.fill === c.clip.id && "is-fill")}
                style={{ width: `${widthPx(c.clip.duration_ms)}px` }}
                title={`${clipLabel(c)}${c.kind === "photo" && c.overlay ? ` · ${c.overlay.name}` : ""} · ${secs(c.clip.duration_ms)}`}
                draggable onDragStart={(e) => { e.dataTransfer?.setData(CLIP_TYPE, c.clip.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => cut.select(c.clip.id)} onDblClick={() => onOpen(c)}
                onContextMenu={onContext && ((e) => { e.preventDefault(); cut.select(c.clip.id); onContext(c, e); })}>
                {c.kind === "photo"
                  ? <div class="tl-clip__thumb"><Framed photo={c.photo} mode={(lock ?? c.pres.mode) === "off" ? "off" : "fit"} frame={presentationFrame(c.photo, c.pres)} src={c.overlay?.render_url ?? undefined} /></div>
                  : c.kind === "sketch" ? <div class="tl-clip__thumb tl-clip__thumb--sk">{c.sketch.render_url ? <img src={c.sketch.render_url} alt="" /> : <Icon name="floor-plan" />}</div>
                  : <div class="tl-clip__thumb tl-clip__thumb--ph"><Icon name="image-off-outline" /></div>}
                <span class="tl-clip__name ellipsis">{c.kind === "photo" && c.overlay ? <Icon name="layers-outline" size={12} /> : null}{clipLabel(c)}{c.kind === "photo" && c.shot.photos.length > 1 ? ` · ${c.photo.ordinal + 1}` : ""}</span>
                <span class="tl-clip__dur num">{secs(c.clip.duration_ms)}</span>
                {c.clip.id === sel && cut.cur && <span class="tl-clip__head" style={{ left: `${(Math.min(elapsed, cut.cur.clip.duration_ms) / cut.cur.clip.duration_ms) * 100}%` }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Clip panel: hold time, presentation, notes — or the placeholder's title ----------

export interface ClipPanelProps {
  c: ResolvedClip;
  count: number;
  /** The timeline's locked mode: the clip's presentation controls are inert then. */
  lock?: MaskMode | null;
  durRef: RefObject<HTMLInputElement>;
  onUpdate: (p: Partial<TimelineClip>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onOpen: () => void;
  /** Inline editing (issue #31): re-frame the clip, draw its overlay, draw a sketch for a placeholder or a sketch clip. */
  onReframe?: () => void;
  onOverlay?: () => void;
  onSketch?: () => void;
  /** A photo clip that replaced a sketch clip still owns that sketch: attach it to the clip's shot. */
  onAttachSketch?: () => void;
  head?: ComponentChildren;
}

export function ClipPanel({ c, count, lock, durRef, onUpdate, onMove, onRemove, onDuplicate, onOpen, onReframe, onOverlay, onSketch, onAttachSketch, head }: ClipPanelProps) {
  const [dur, setDur] = useState((c.clip.duration_ms / 1000).toFixed(1));
  useEffect(() => setDur((c.clip.duration_ms / 1000).toFixed(1)), [c.clip.duration_ms]);
  const commitDur = (v: string) => { const n = Math.round(parseFloat(v.replace(",", ".")) * 10) * 100; if (Number.isFinite(n) && n >= 100 && n <= 3_600_000) onUpdate({ duration_ms: n }); else setDur((c.clip.duration_ms / 1000).toFixed(1)); };
  const bump = (d: number) => onUpdate({ duration_ms: Math.max(100, Math.min(3_600_000, c.clip.duration_ms + d)) });
  const i = c.index;
  const holdTime = (
    <Field label="Hold time" as="div">
      <div class="btn-row" style={{ flexWrap: "nowrap", gap: "4px" }}>
        <IconButton kind="secondary" icon="minus" label="Shorter by 0.5 s" onClick={() => bump(-STEP_MS)} />
        <Input inputRef={durRef} sm class="num" style={{ width: "72px", textAlign: "right", fontWeight: 700 }} value={dur} unit="s" inputMode="decimal" aria-label="Hold time in seconds" onInput={(e) => setDur((e.target as HTMLInputElement).value)} onBlur={() => commitDur(dur)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDur((c.clip.duration_ms / 1000).toFixed(1)); (e.target as HTMLInputElement).blur(); } }} />
        <IconButton kind="secondary" icon="plus" label="Longer by 0.5 s" onClick={() => bump(STEP_MS)} />
        <span class="meta"><Kbd>D</Kbd></span>
      </div>
    </Field>
  );
  const notes = <Field label="Notes"><textarea class="f-textarea" rows={3} placeholder={c.kind === "photo" ? "Why this shot here, what it needs…" : "What the wanted shot looks like…"} value={c.clip.notes ?? ""} onInput={(e) => onUpdate({ notes: (e.target as HTMLTextAreaElement).value || null })} /></Field>;
  const foot = (extra?: ComponentChildren) => (
    <div class="btn-row" style={{ gap: "6px" }}>
      <IconButton kind="secondary" icon="arrow-left" label="Move earlier (Alt+←)" title="Move earlier (Alt+←)" disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton kind="secondary" icon="arrow-right" label="Move later (Alt+→)" title="Move later (Alt+→)" disabled={i === count - 1} onClick={() => onMove(1)} />
      <Button kind="secondary" size="sm" icon="content-duplicate" onClick={onDuplicate}>Duplicate</Button>
      {extra}
      <span class="grow" />
      <Button kind="danger" size="sm" icon="delete-outline" kbd="Del" onClick={onRemove}>Remove</Button>
    </div>
  );
  const headMeta = head ?? <span class="meta num">clip {i + 1} of {count}</span>;

  if (c.kind !== "photo") {
    const sketch = c.kind === "sketch" ? c.sketch : null;
    return (
      <Panel label={sketch ? "Sketch clip" : "Placeholder"} width="340px" resize={DRAWER_RESIZE}>
        <PanelHead title={sketch ? "Sketch clip" : "Placeholder"}>{headMeta}</PanelHead>
        <PanelBody>
          {sketch ? (
            <div class="tl-sketch-thumb">{sketch.render_url ? <img src={sketch.render_url} alt="" /> : <Icon name="floor-plan" />}</div>
          ) : <span class="meta">Holds this spot in the cut. Drop a shot from the panel onto it to fill it; the hold time is kept.</span>}
          <Field label="Wanted shot"><Input value={c.clip.title ?? ""} maxLength={120} placeholder="e.g. Wide dusk establisher" onInput={(e) => onUpdate({ title: (e.target as HTMLInputElement).value || "Placeholder" })} /></Field>
          {onSketch && (
            <div class="btn-row">
              <Button kind={sketch ? "secondary" : "primary"} size="sm" icon="draw" kbd="C" onClick={onSketch}>{sketch ? "Edit the sketch" : "Sketch it"}</Button>
              {sketch && !sketch.clip_id && <span class="meta">A shot's sketch: editing makes a copy for this clip.</span>}
            </div>
          )}
          {sketch && <span class="meta">Dropping a shot here replaces the sketch on stage; the clip keeps the sketch, so you can attach it to that shot.</span>}
          {holdTime}
          {notes}
          {foot()}
        </PanelBody>
      </Panel>
    );
  }

  const pres = c.pres;
  const overlays = c.shot.overlays.filter((o) => o.photo_id === c.photo.id);
  const all = [...c.ownOverlays, ...overlays];
  const pickOverlay = (id: string) => {
    const o = all.find((x) => x.id === id) ?? null;
    // An overlay brings the presentation it was drawn in; "Photo" keeps the current one. A clip's own overlay keeps the clip's.
    onUpdate(o ? (o.clip_id ? { overlay_id: o.id } : { overlay_id: o.id, presentation: o.presentation }) : { overlay_id: null });
  };
  const ownFrame = ownReframe(pres);
  return (
    <Panel label="Clip" width="340px" resize={DRAWER_RESIZE}>
      <PanelHead title={shotTitle(c.shot)}>{headMeta}</PanelHead>
      <PanelBody>
        <div class="f-row__thumb" style={{ width: "100%" }}><Framed photo={c.photo} mode={lock ?? pres.mode} frame={presentationFrame(c.photo, pres)} src={c.overlay?.render_url ?? undefined} /></div>
        {c.shot.photos.length > 1 && <span class="meta">Photo {c.photo.ordinal + 1} of {c.shot.photos.length} in this sequence</span>}
        {(onReframe || onOverlay) && (
          <div class="tl-tools" role="group" aria-label="Clip tools">
            {onReframe && c.photo.source === "camera" && <Button kind="secondary" size="sm" icon="crop" kbd="R" onClick={onReframe}>Re-frame</Button>}
            {onOverlay && <Button kind="secondary" size="sm" icon="layers-outline" kbd="C" onClick={onOverlay}>{c.overlay?.clip_id ? "Edit overlay" : c.overlay ? "Overlay (copy)" : "Overlay"}</Button>}
          </div>
        )}
        {holdTime}
        <Field label="Show as" as="div">
          <Select label="Show as" width="100%" value={c.clip.overlay_id ?? ""} onChange={pickOverlay}
            options={[{ value: "", label: "Photo as is" }, ...c.ownOverlays.map((o) => ({ value: o.id, label: o.name, group: "This clip" })), ...overlays.map((o) => ({ value: o.id, label: o.name, group: "The shot's overlays" }))]} />
        </Field>
        <Field label="Presentation" as="div">
          {lock ? (
            <span class="f-field__help"><Icon name="lock-outline" size={14} /> Locked to <strong>{frameModeLabel(lock)}</strong> for the whole timeline. Unlock it in the head to set this clip's own presentation again.</span>
          ) : (
            <>
              <Seg label="Frame mode" value={pres.mode} onChange={(m) => onUpdate({ presentation: { ...pres, mode: m } })} options={PRESENTATION_MODES.map((m) => ({ id: m, label: frameModeLabel(m) }))} />
              {c.photo.source === "camera" && <div style={{ marginTop: "6px" }}><FramingSelect photo={c.photo} value={pres} onChange={(patch) => onUpdate({ presentation: { ...pres, ...patch } })} /></div>}
            </>
          )}
          <span class="f-field__help">{ownFrame ? <><Icon name="crop" size={14} /> This clip's own re-frame · {pres.label}</> : pres.label ?? "As shot"}</span>
        </Field>
        {c.ownSketch && onAttachSketch && (
          <div class="tl-kept">
            <div class="tl-sketch-thumb tl-sketch-thumb--sm">{c.ownSketch.render_url ? <img src={c.ownSketch.render_url} alt="" /> : <Icon name="floor-plan" />}</div>
            <div class="tl-kept__txt"><strong>{c.ownSketch.name}</strong><span class="meta">The sketch this spot had before the shot.</span></div>
            <Button kind="secondary" size="sm" icon="link-variant" onClick={onAttachSketch}>Attach to shot</Button>
          </div>
        )}
        {notes}
        {foot(<Button kind="secondary" size="sm" icon="image-outline" kbd="↵" onClick={onOpen}>Open shot</Button>)}
      </PanelBody>
    </Panel>
  );
}

// ---------- The project's timelines: a rail that collapses to win width (issue #31) ----------

const loadRail = () => { try { return localStorage.getItem("timelineRail") === "collapsed"; } catch { return false; } };

export function TimelineRail({ list, selectedId, onSelect, onCreate, onContext }: { list: Timeline[] | null; selectedId: string | null; onSelect: (id: string) => void; onCreate: () => void; onContext?: (t: Timeline, e: MouseEvent) => void }) {
  const [collapsed, setCollapsed] = useState(loadRail);
  const toggle = () => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem("timelineRail", v ? "collapsed" : "full"); } catch { /* a preference */ } };
  const total = (t: Timeline) => t.clips.reduce((a, c) => a + c.duration_ms, 0);
  if (collapsed) {
    return (
      <Panel left width="56px" label="Timelines">
        <div class="tl-rail">
          <IconButton icon="chevron-double-right" label="Expand the timelines" title="Expand the timelines" onClick={toggle} />
          <IconButton icon="plus" label="New timeline (⇧N)" title="New timeline (⇧N)" onClick={onCreate} />
          <span class="tl-rail__sep" />
          {(list ?? []).map((t, i) => (
            <button key={t.id} type="button" class={cx("tl-rail__it", t.id === selectedId && "is-selected")} title={`${t.name} · ${t.clips.length} clips · ${clock(total(t))}`} aria-label={t.name} aria-pressed={t.id === selectedId}
              onClick={() => onSelect(t.id)} onContextMenu={onContext && ((e) => onContext(t, e))}>{i + 1}</button>
          ))}
        </div>
      </Panel>
    );
  }
  return (
    <Panel left width="240px" label="Timelines">
      <PanelHead title="Timelines">
        <Button size="sm" icon="plus" title="New timeline (⇧N)" onClick={onCreate}>New</Button>
        <IconButton icon="chevron-double-left" label="Collapse the timelines" title="Collapse the timelines" onClick={toggle} />
      </PanelHead>
      <PanelBody flush role="listbox" aria-label="Timelines">
        {!list ? <div class="status"><Spinner /></div> : list.length === 0 ? <EmptyNote title="No timelines yet">“New” starts an empty cut.</EmptyNote> : list.map((t) => (
          <div key={t.id} role="option" aria-selected={t.id === selectedId} tabIndex={0} class={cx("f-dayitem", t.id === selectedId && "is-selected")}
            onClick={() => onSelect(t.id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(t.id); }} onContextMenu={onContext && ((e) => onContext(t, e))}>
            <span class="f-dayitem__date">{t.name}</span>
            <span class="f-dayitem__meta num">{t.clips.length} clip{t.clips.length === 1 ? "" : "s"} · {clock(total(t))}</span>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
