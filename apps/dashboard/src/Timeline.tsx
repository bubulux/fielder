import type { RefObject } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PRESENTATION_MODES, type Presentation } from "@fielder/vocab";
import { deleteTimeline, fetchTimelines, putTimeline, type Overlay, type Photo, type Preset, type Project, type Shot, type Timeline, type TimelineClip } from "./api";
import { cover, frameModeLabel, frameOf, rigLabel, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { invalidateTimelines } from "./Inspector";
import { useKeys } from "./keys";
import { AS_SHOT, choiceLabel, frameForChoice, Pickers, type RigChoice } from "./RigExplorer";
import { Banner, Button, Checkbox, confirmDialog, cx, Empty, EmptyNote, Field, Icon, IconButton, Input, Kbd, ListRow, MenuItem, Panel, PanelBody, PanelHead, Popover, SaveStatus, Seg, Select, Spinner, toast, Toolbar, ToolbarTitle, type SaveState } from "./ui";

/**
 * Timeline (issue #12, part 2): rough cuts of a project out of its photos. A clip is one photo,
 * optionally seen through one of its overlays, with a presentation (frame mode + rig frame) and a
 * hold time. The strip is proportional to time; the preview plays the cut. Changes autosave.
 */

interface Props {
  project: Project | null;
  projects: Project[];
  onPickProject: (id: string) => void;
  /** The project's shots. */
  shots: Shot[];
  presets: Preset[];
  mask: MaskMode;
  timelineId: string | null;
  onTimeline: (id: string | null) => void;
  onOpen: (s: Shot, list: Shot[]) => void;
}

const DEFAULT_MS = 3000;
const STEP_MS = 500;
const PX_PER_S = 44;
const MIN_CLIP_PX = 64;
/** "1:02.5" */
export const clock = (ms: number) => { const s = ms / 1000; const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`; };
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** A clip with what it points at; null when the shot or photo is gone (the server drops it on the next save). */
export interface ResolvedClip { clip: TimelineClip; shot: Shot; photo: Photo; overlay: Overlay | null; index: number; startMs: number }
export function resolveClips(t: Timeline, byId: Map<string, Shot>): ResolvedClip[] {
  const out: ResolvedClip[] = [];
  let at = 0;
  t.clips.forEach((clip, index) => {
    const shot = byId.get(clip.shot_id);
    const photo = shot?.photos.find((p) => p.id === clip.photo_id);
    if (!shot || !photo) return;
    out.push({ clip, shot, photo, overlay: shot.overlays.find((o) => o.id === clip.overlay_id) ?? null, index, startMs: at });
    at += clip.duration_ms;
  });
  return out;
}
/** Default presentation of a photo: the view's frame mode and the rig it was shot with. */
export const defaultPresentation = (photo: Photo, mode: MaskMode): Presentation => ({ mode, frame: frameOf(photo), label: rigLabel(photo), rig_id: null, lens_mm: photo.lens_mm || null });

export function TimelinePage({ project, projects, onPickProject, shots, presets, mask, timelineId, onTimeline, onOpen }: Props) {
  const [list, setList] = useState<Timeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = project?.id ?? null;
  useEffect(() => {
    if (!projectId) return;
    setList(null);
    fetchTimelines(projectId).then((t) => { setList(t); if (!timelineId || !t.some((x) => x.id === timelineId)) onTimeline(t[0]?.id ?? null); }).catch((e: Error) => setError(e.message));
  }, [projectId]);

  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; t: Timeline }>());
  const [save, setSave] = useState<SaveState>("idle");
  const flush = (t: Timeline) => {
    pending.current.delete(t.id);
    setSave("saving");
    putTimeline(t).then((saved) => {
      invalidateTimelines(t.project_id);
      // The server may have dropped clips of deleted photos; take its list.
      setList((cur) => (cur ?? []).map((x) => (x.id === saved.id && !pending.current.has(saved.id) ? saved : x)));
      if (pending.current.size === 0) setSave("saved");
    }).catch((e: Error) => { setSave("error"); setError(e.message); pending.current.set(t.id, { t, timer: setTimeout(() => {}, 0) }); });
  };
  useEffect(() => () => { for (const { timer, t } of pending.current.values()) { clearTimeout(timer); void putTimeline(t).catch(() => {}); } pending.current.clear(); }, []);
  const retry = () => { for (const { t } of [...pending.current.values()]) flush(t); };
  function change(t: Timeline) {
    setList((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)));
    setSave("dirty");
    const prev = pending.current.get(t.id);
    if (prev) clearTimeout(prev.timer);
    pending.current.set(t.id, { t, timer: setTimeout(() => flush(t), 600) });
  }
  async function create() {
    if (!projectId) return;
    const n = (list?.length ?? 0) + 1;
    const t: Timeline = { id: crypto.randomUUID(), project_id: projectId, name: `Cut ${n}`, notes: null, clips: [], created_at: "", updated_at: null };
    try { const saved = await putTimeline(t); invalidateTimelines(projectId); setList((cur) => [...(cur ?? []), saved]); onTimeline(saved.id); } catch (e) { toast(`Could not create the timeline: ${(e as Error).message}`, "danger"); }
  }
  async function remove(t: Timeline) {
    const ok = await confirmDialog({ title: `Delete “${t.name}”?`, body: `The timeline and its ${t.clips.length} clip${t.clips.length === 1 ? "" : "s"} are deleted. The shots stay.`, confirmLabel: "Delete timeline", danger: true });
    if (!ok) return;
    try { await deleteTimeline(t.id); invalidateTimelines(t.project_id); setList((cur) => (cur ?? []).filter((x) => x.id !== t.id)); onTimeline(null); } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); }
  }
  useKeys({ "Shift+N": () => void create() }, !!projectId);

  if (!project) {
    return (
      <>
        <Toolbar><ToolbarTitle>Timeline</ToolbarTitle></Toolbar>
        <Empty icon="folder-outline" title="Pick a project to cut">
          Timelines belong to one project.
          <div class="f-menu" style={{ marginTop: "12px", width: "300px", textAlign: "left" }}>
            {projects.map((p) => <MenuItem key={p.id} icon="folder-outline" count={`${p.shot_count} shots`} onClick={() => onPickProject(p.id)}>{p.name}</MenuItem>)}
          </div>
        </Empty>
      </>
    );
  }
  const current = list?.find((t) => t.id === timelineId) ?? null;
  const total = (t: Timeline) => t.clips.reduce((a, c) => a + c.duration_ms, 0);
  return (
    <div class="f-app__body">
      <Panel left width="260px" label="Timelines">
        <PanelHead title="Timelines"><Button size="sm" icon="plus" title="New timeline (⇧N)" onClick={() => void create()}>New</Button></PanelHead>
        <PanelBody flush role="listbox" aria-label="Timelines">
          {!list ? <div class="status"><Spinner /></div> : list.length === 0 ? <EmptyNote title="No timelines yet">“New” starts an empty cut.</EmptyNote> : list.map((t) => (
            <div key={t.id} role="option" aria-selected={t.id === timelineId} tabIndex={0} class={cx("f-dayitem", t.id === timelineId && "is-selected")} onClick={() => onTimeline(t.id)} onKeyDown={(e) => { if (e.key === "Enter") onTimeline(t.id); }}>
              <span class="f-dayitem__date">{t.name}</span>
              <span class="f-dayitem__meta num">{t.clips.length} clip{t.clips.length === 1 ? "" : "s"} · {clock(total(t))}</span>
            </div>
          ))}
        </PanelBody>
      </Panel>
      {list && list.length === 0 ? (
        <Empty icon="filmstrip" title={`No timelines in ${project.name}`} actions={<Button icon="plus" onClick={() => void create()}>New timeline</Button>}>
          Arrange photos and overlays in order, give each a hold time, and play the cut to see which shots carry the sequence.
        </Empty>
      ) : current ? (
        <Editor key={current.id} timeline={current} shots={shots} presets={presets} mask={mask} onChange={change} onDelete={() => void remove(current)} onOpen={onOpen} save={save} onRetry={retry} error={save === "error" ? error : null} />
      ) : <Empty icon="filmstrip" title="Pick a timeline" />}
    </div>
  );
}

interface EditorProps { timeline: Timeline; shots: Shot[]; presets: Preset[]; mask: MaskMode; onChange: (t: Timeline) => void; onDelete: () => void; onOpen: (s: Shot, list: Shot[]) => void; save: SaveState; onRetry: () => void; error: string | null }

function Editor({ timeline: t, shots, presets, mask, onChange, onDelete, onOpen, save, onRetry, error }: EditorProps) {
  const byId = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const clips = useMemo(() => resolveClips(t, byId), [t, byId]);
  const total = clips.reduce((a, c) => a + c.clip.duration_ms, 0);
  const [sel, setSel] = useState<string | null>(clips[0]?.clip.id ?? null);
  const [adding, setAdding] = useState(t.clips.length === 0);
  const [menu, setMenu] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // within the selected clip
  const stripRef = useRef<HTMLDivElement>(null);
  const durRef = useRef<HTMLInputElement>(null);
  const selIdx = clips.findIndex((c) => c.clip.id === sel);
  const cur = selIdx >= 0 ? clips[selIdx] : clips[0] ?? null;
  useEffect(() => { if (cur && cur.clip.id !== sel) setSel(cur.clip.id); }, [cur?.clip.id]);
  useEffect(() => { stripRef.current?.querySelector(".is-sel")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }, [sel]);

  // Playback: 100 ms ticks; the next clip starts when the hold time is up, the end stops.
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
  const step = (d: number) => { if (!cur) return; const n = clips[Math.max(0, Math.min(clips.length - 1, clips.indexOf(cur) + d))]; if (n) select(n.clip.id); };
  const toggle = () => { if (!cur) return; if (!playing && cur === clips.at(-1) && elapsed >= cur.clip.duration_ms) { select(clips[0].clip.id); } setPlaying(!playing); };

  const setClips = (list: TimelineClip[]) => onChange({ ...t, clips: list });
  const update = (id: string, patch: Partial<TimelineClip>) => setClips(t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (c: ResolvedClip, d: number) => { const i = t.clips.indexOf(c.clip); if (i + d < 0 || i + d >= t.clips.length) return; const l = [...t.clips]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setClips(l); };
  const removeClip = (c: ResolvedClip) => { const i = clips.indexOf(c); setClips(t.clips.filter((x) => x !== c.clip)); const n = clips[i + 1] ?? clips[i - 1]; select(n?.clip.id ?? null); };
  const duplicate = (c: ResolvedClip) => { const i = t.clips.indexOf(c.clip); const copy = { ...c.clip, id: crypto.randomUUID() }; const l = [...t.clips]; l.splice(i + 1, 0, copy); setClips(l); select(copy.id); };
  const addShots = (list: Shot[]) => {
    const fresh = list.flatMap((s) => s.photos.map((p): TimelineClip => ({ id: crypto.randomUUID(), photo_id: p.id, shot_id: s.id, overlay_id: null, presentation: defaultPresentation(p, mask), duration_ms: DEFAULT_MS, notes: null })));
    setClips([...t.clips, ...fresh]);
    if (!cur && fresh[0]) select(fresh[0].id);
  };
  const shotList = [...new Map(clips.map((c) => [c.shot.id, c.shot])).values()];

  useKeys({
    ArrowRight: () => step(1),
    ArrowLeft: () => step(-1),
    Home: () => clips[0] && select(clips[0].clip.id),
    End: () => clips.at(-1) && select(clips.at(-1)!.clip.id),
    " ": toggle,
    "Alt+ArrowRight": () => cur && move(cur, 1),
    "Alt+ArrowLeft": () => cur && move(cur, -1),
    Delete: () => cur && removeClip(cur),
    d: () => durRef.current?.focus(),
    n: () => setAdding((a) => !a),
    Enter: () => cur && onOpen(cur.shot, shotList),
  });

  const playheadMs = cur ? cur.startMs + Math.min(elapsed, cur.clip.duration_ms) : 0;
  const widthPx = (ms: number) => Math.max(MIN_CLIP_PX, (ms / 1000) * PX_PER_S);
  const totalPx = clips.reduce((a, c) => a + widthPx(c.clip.duration_ms), 0);
  const ticks = Array.from({ length: Math.floor(total / 1000) + 1 }, (_, i) => i * 1000);
  return (
    <>
      <div class="f-scroll tl-main">
        <div class="plan-day" style={{ gap: "14px" }}>
          {error && <Banner role="alert" icon="cloud-alert" title="Not saved" meta={`${error}. Your changes are kept here; they save on retry or on the next edit.`} action={<Button kind="secondary" size="sm" onClick={onRetry}>Retry</Button>} />}
          <div class="plan-head">
            <Field label="Name" style={{ flex: 1, minWidth: "220px" }}><Input value={t.name} maxLength={120} style={{ fontWeight: 700 }} onInput={(e) => onChange({ ...t, name: (e.target as HTMLInputElement).value || "Untitled" })} /></Field>
            <Field label="Length"><span class="f-input num" style={{ fontWeight: 700, padding: "0 10px", display: "inline-flex", alignItems: "center" }}>{clock(total)} · {clips.length} clip{clips.length === 1 ? "" : "s"}</span></Field>
            <div class="plan-head__status">
              <SaveStatus state={save} onRetry={onRetry} />
              <div class="menu-anchor">
                <IconButton icon="dots-horizontal" label="Timeline menu" aria-expanded={menu} onClick={() => setMenu(!menu)} />
                {menu && <Popover right onClose={() => setMenu(false)}><MenuItem icon="delete-outline" danger onClick={() => { setMenu(false); onDelete(); }}>Delete timeline…</MenuItem></Popover>}
              </div>
            </div>
          </div>

          <div class="tl-preview">
            {cur ? (
              <Framed photo={cur.photo} mode={cur.clip.presentation.mode} frame={cur.clip.presentation.frame} src={cur.overlay?.render_url ?? undefined} maxHeight="calc(100vh - 470px)" />
            ) : <div class="tl-preview__empty"><Icon name="filmstrip" /><span>Add shots to start the cut</span></div>}
            <div class="tl-transport">
              <IconButton kind="secondary" icon="skip-previous" label="First clip (Home)" disabled={!cur} onClick={() => clips[0] && select(clips[0].clip.id)} />
              <IconButton kind="secondary" icon="chevron-left" label="Previous clip (←)" disabled={!cur || clips.indexOf(cur) === 0} onClick={() => step(-1)} />
              <Button icon={playing ? "pause" : "play"} kbd="Space" disabled={!cur} onClick={toggle} style={{ minWidth: "110px" }}>{playing ? "Pause" : "Play"}</Button>
              <IconButton kind="secondary" icon="chevron-right" label="Next clip (→)" disabled={!cur || clips.indexOf(cur) === clips.length - 1} onClick={() => step(1)} />
              <IconButton kind="secondary" icon="skip-next" label="Last clip (End)" disabled={!cur} onClick={() => clips.at(-1) && select(clips.at(-1)!.clip.id)} />
              <span class="num tl-clock"><strong>{clock(playheadMs)}</strong> / {clock(total)}</span>
              {cur && <span class="meta num">clip {clips.indexOf(cur) + 1} of {clips.length} · {secs(cur.clip.duration_ms)}</span>}
              <span class="grow" />
              <Button kind={adding ? "secondary" : "primary"} size="sm" icon="plus" kbd="N" aria-pressed={adding} onClick={() => setAdding(!adding)}>Add shots</Button>
            </div>
          </div>

          <div class="tl-strip-wrap" ref={stripRef}>
            {clips.length === 0 ? <EmptyNote dashed title="No clips yet">Add shots from the panel. A sequence adds one clip per photo, each with its own hold time.</EmptyNote> : (
              <div class="tl-strip" style={{ width: `${totalPx}px` }} role="listbox" aria-label="Clips">
                <div class="tl-ruler">{ticks.map((ms) => { const x = clips.reduce((a, c) => a + (c.startMs + c.clip.duration_ms <= ms ? widthPx(c.clip.duration_ms) : c.startMs < ms ? widthPx(c.clip.duration_ms) * ((ms - c.startMs) / c.clip.duration_ms) : 0), 0); return <span key={ms} style={{ left: `${x}px` }}>{ms % 5000 === 0 ? clock(ms).replace(/\.0$/, "") : ""}</span>; })}</div>
                <div class="tl-clips">
                  {clips.map((c) => (
                    <button key={c.clip.id} type="button" role="option" aria-selected={c.clip.id === sel} class={cx("tl-clip", c.clip.id === sel && "is-sel")} style={{ width: `${widthPx(c.clip.duration_ms)}px` }} title={`${shotTitle(c.shot)}${c.overlay ? ` · ${c.overlay.name}` : ""} · ${secs(c.clip.duration_ms)}`} onClick={() => select(c.clip.id)} onDblClick={() => onOpen(c.shot, shotList)}>
                      <div class="tl-clip__thumb"><Framed photo={c.photo} mode={c.clip.presentation.mode === "off" ? "off" : "fit"} frame={c.clip.presentation.frame} src={c.overlay?.render_url ?? undefined} /></div>
                      <span class="tl-clip__name ellipsis">{c.overlay ? <Icon name="layers-outline" size={12} /> : null}{shotTitle(c.shot)}{c.shot.photos.length > 1 ? ` · ${c.photo.ordinal + 1}` : ""}</span>
                      <span class="tl-clip__dur num">{secs(c.clip.duration_ms)}</span>
                      {c.clip.id === sel && cur && <span class="tl-clip__head" style={{ left: `${(Math.min(elapsed, cur.clip.duration_ms) / cur.clip.duration_ms) * 100}%` }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {adding ? <AddPanel shots={shots} mask={mask} onAdd={addShots} onClose={() => setAdding(false)} />
        : cur && <ClipPanel key={cur.clip.id} c={cur} presets={presets} count={clips.length} durRef={durRef} onUpdate={(p) => update(cur.clip.id, p)} onMove={(d) => move(cur, d)} onRemove={() => removeClip(cur)} onDuplicate={() => duplicate(cur)} onOpen={() => onOpen(cur.shot, shotList)} />}
    </>
  );
}

function ClipPanel({ c, presets, count, durRef, onUpdate, onMove, onRemove, onDuplicate, onOpen }: { c: ResolvedClip; presets: Preset[]; count: number; durRef: RefObject<HTMLInputElement>; onUpdate: (p: Partial<TimelineClip>) => void; onMove: (d: number) => void; onRemove: () => void; onDuplicate: () => void; onOpen: () => void }) {
  const pres = c.clip.presentation;
  const [choice, setChoice] = useState<RigChoice>({ rig: pres.rig_id ?? AS_SHOT, lensMm: pres.lens_mm ?? c.photo.lens_mm });
  const [dur, setDur] = useState((c.clip.duration_ms / 1000).toFixed(1));
  useEffect(() => setDur((c.clip.duration_ms / 1000).toFixed(1)), [c.clip.duration_ms]);
  const commitDur = (v: string) => { const n = Math.round(parseFloat(v.replace(",", ".")) * 10) * 100; if (Number.isFinite(n) && n >= 100 && n <= 3_600_000) onUpdate({ duration_ms: n }); else setDur((c.clip.duration_ms / 1000).toFixed(1)); };
  const bump = (d: number) => onUpdate({ duration_ms: Math.max(100, Math.min(3_600_000, c.clip.duration_ms + d)) });
  const pickChoice = (ch: RigChoice) => {
    setChoice(ch);
    onUpdate({ presentation: { ...pres, frame: frameForChoice(c.photo, presets, ch) ?? frameOf(c.photo), label: choiceLabel(c.photo, presets, ch), rig_id: ch.rig === AS_SHOT ? null : ch.rig, lens_mm: ch.lensMm || null } });
  };
  const overlays = c.shot.overlays.filter((o) => o.photo_id === c.photo.id);
  const pickOverlay = (id: string) => {
    const o = overlays.find((x) => x.id === id) ?? null;
    // An overlay brings the presentation it was drawn in; "Photo" keeps the current one.
    onUpdate(o ? { overlay_id: o.id, presentation: o.presentation } : { overlay_id: null });
    if (o) setChoice({ rig: o.presentation.rig_id ?? AS_SHOT, lensMm: o.presentation.lens_mm ?? c.photo.lens_mm });
  };
  const i = c.index;
  return (
    <Panel label="Clip" width="340px">
      <PanelHead title={shotTitle(c.shot)}><span class="meta num">clip {i + 1} of {count}</span></PanelHead>
      <PanelBody>
        <div class="f-row__thumb" style={{ width: "100%" }}><Framed photo={c.photo} mode={pres.mode} frame={pres.frame} src={c.overlay?.render_url ?? undefined} /></div>
        {c.shot.photos.length > 1 && <span class="meta">Photo {c.photo.ordinal + 1} of {c.shot.photos.length} in this sequence</span>}
        <Field label="Hold time" as="div">
          <div class="btn-row" style={{ flexWrap: "nowrap", gap: "4px" }}>
            <IconButton kind="secondary" icon="minus" label="Shorter by 0.5 s" onClick={() => bump(-STEP_MS)} />
            <Input inputRef={durRef} sm class="num" style={{ width: "72px", textAlign: "right", fontWeight: 700 }} value={dur} unit="s" inputMode="decimal" aria-label="Hold time in seconds" onInput={(e) => setDur((e.target as HTMLInputElement).value)} onBlur={() => commitDur(dur)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDur((c.clip.duration_ms / 1000).toFixed(1)); (e.target as HTMLInputElement).blur(); } }} />
            <IconButton kind="secondary" icon="plus" label="Longer by 0.5 s" onClick={() => bump(STEP_MS)} />
            <span class="meta"><Kbd>D</Kbd></span>
          </div>
        </Field>
        <Field label="Show as" as="div">
          <Select label="Show as" width="100%" value={c.clip.overlay_id ?? ""} onChange={pickOverlay}
            options={[{ value: "", label: "Photo as is" }, ...overlays.map((o) => ({ value: o.id, label: o.name, group: "Overlays" }))]} />
          {overlays.length === 0 && <span class="f-field__help">No overlays on this photo yet. Make one in the shot view (C).</span>}
        </Field>
        <Field label="Presentation" as="div">
          <Seg label="Frame mode" value={pres.mode} onChange={(m) => onUpdate({ presentation: { ...pres, mode: m } })} options={PRESENTATION_MODES.map((m) => ({ id: m, label: frameModeLabel(m) }))} />
          {c.photo.source === "camera" && <div class="btn-row" style={{ gap: "6px", marginTop: "6px" }}><Pickers photo={c.photo} presets={presets} choice={choice} onChoice={pickChoice} /></div>}
          <span class="f-field__help">{pres.label ?? "As shot"}</span>
        </Field>
        <Field label="Notes"><textarea class="f-textarea" rows={3} placeholder="Why this shot here, what it needs…" value={c.clip.notes ?? ""} onInput={(e) => onUpdate({ notes: (e.target as HTMLTextAreaElement).value || null })} /></Field>
        <div class="btn-row" style={{ gap: "6px" }}>
          <IconButton kind="secondary" icon="arrow-left" label="Move earlier (Alt+←)" title="Move earlier (Alt+←)" disabled={i === 0} onClick={() => onMove(-1)} />
          <IconButton kind="secondary" icon="arrow-right" label="Move later (Alt+→)" title="Move later (Alt+→)" disabled={i === count - 1} onClick={() => onMove(1)} />
          <Button kind="secondary" size="sm" icon="content-duplicate" onClick={onDuplicate}>Duplicate</Button>
          <Button kind="secondary" size="sm" icon="image-outline" kbd="↵" onClick={onOpen}>Open shot</Button>
          <span class="grow" />
          <Button kind="danger" size="sm" icon="delete-outline" kbd="Del" onClick={onRemove}>Remove</Button>
        </div>
      </PanelBody>
    </Panel>
  );
}

function AddPanel({ shots, mask, onAdd, onClose }: { shots: Shot[]; mask: MaskMode; onAdd: (s: Shot[]) => void; onClose: () => void }) {
  const [location, setLocation] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(true);
  const pool = shots.filter((s) => !onlyApproved || s.state === "approved");
  const candidates = pool.filter((s) => !location || (s.location_id ?? "none") === location);
  const locations = [...new Map(shots.map((s) => [s.location_id ?? "none", s.location_name ?? "No location"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const byLocation = new Map<string, Shot[]>();
  for (const s of candidates) { const k = s.location_name ?? "No location"; byLocation.set(k, [...(byLocation.get(k) ?? []), s]); }
  useKeys({ Escape: onClose });
  return (
    <Panel label="Add shots" width="340px">
      <PanelHead title="Add shots"><Kbd>N</Kbd><IconButton icon="close" label="Close" onClick={onClose} /></PanelHead>
      <div class="panel-filters">
        <Select label="Location" icon="map-marker-outline" value={location} onChange={setLocation} options={[{ value: "", label: "All locations" }, ...locations.map(([id, name]) => ({ value: id, label: name }))]} />
        <Checkbox checked={onlyApproved} role="checkbox" aria-checked={onlyApproved} onClick={() => setOnlyApproved(!onlyApproved)}>Approved only <span class="meta">· {pool.length} shots</span></Checkbox>
      </div>
      <PanelBody style={{ gap: "14px" }}>
        <span class="meta">A shot can be added more than once. A sequence adds one clip per photo.</span>
        {candidates.length === 0 && <span class="meta">Nothing to add{onlyApproved ? ": untick “Approved only” to see every shot." : "."}</span>}
        {[...byLocation.entries()].map(([name, list]) => (
          <div key={name} class="add-group">
            <div class="add-group__head"><strong class="ellipsis">{name}</strong><span class="meta">{list.length}</span><Button kind="ghost" size="sm" onClick={() => onAdd(list)}>Add all</Button></div>
            {list.map((s) => (
              <ListRow key={s.id} class="add-row" tooltip="Add to the timeline" onClick={() => onAdd([s])}
                thumb={<div class="f-row__thumb" style={{ width: "56px" }}><Framed photo={cover(s)} mode={mask} /></div>}
                title={shotTitle(s)} meta={<>{s.photos.length > 1 ? `${s.photos.length} photos · ` : ""}{s.overlays.length ? `${s.overlays.length} overlay${s.overlays.length === 1 ? "" : "s"}` : "no overlays"}</>}
                trailing={<Icon name="plus" size={20} />} />
            ))}
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
