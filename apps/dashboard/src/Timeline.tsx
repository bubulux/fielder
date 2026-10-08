import { useMemo, useRef, useState } from "preact/hooks";
import { fetchTimelines, type Preset, type Project, type Shot, type Timeline, type TimelineClip } from "./api";
import { cover, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { useKeys } from "./keys";
import { ClipPanel, clock, CutPreview, DRAWER_RESIZE, LockSelect, TimelineRail, newPlaceholder, resolveClips, Strip, useCut, useTimelineStore, clipsOfShot, type ResolvedClip } from "./TimelineParts";
import { Banner, Button, Checkbox, cx, Empty, EmptyNote, Field, Icon, IconButton, Input, Kbd, ListRow, MenuItem, Panel, PanelBody, PanelHead, Popover, SaveStatus, Select, Spinner, Toolbar, ToolbarTitle, type SaveState } from "./ui";

/**
 * Timeline (issue #12, part 2): rough cuts of a project out of its photos. A clip is one photo,
 * optionally seen through one of its overlays, with a presentation (frame mode + rig frame) and a
 * hold time — or a placeholder holding the spot for a missing shot (issue #31). The strip is
 * proportional to time and reorders by drag; the preview plays the cut. Changes autosave.
 * The Review workspace (Review.tsx) edits the same timelines with a shot browser beside them.
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

export function TimelinePage({ project, projects, onPickProject, shots, mask, timelineId, onTimeline, onOpen }: Props) {
  const projectId = project?.id ?? null;
  const store = useTimelineStore((set, fail) => {
    if (!projectId) return;
    fetchTimelines(projectId).then((t) => { set(t); if (!timelineId || !t.some((x) => x.id === timelineId)) onTimeline(t[0]?.id ?? null); }).catch(fail);
  }, [projectId]);
  const { list, save } = store;
  const create = async () => { if (projectId) { const t = await store.create(projectId); if (t) onTimeline(t.id); } };
  const remove = async (t: Timeline) => { if (await store.remove(t)) onTimeline(null); };
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
      <TimelineRail list={list} selectedId={timelineId} onSelect={onTimeline} onCreate={() => void create()} />
      {list && list.length === 0 ? (
        <Empty icon="filmstrip" title={`No timelines in ${project.name}`} actions={<Button icon="plus" onClick={() => void create()}>New timeline</Button>}>
          Arrange photos and overlays in order, give each a hold time, and play the cut to see which shots carry the sequence.
        </Empty>
      ) : current ? (
        <Editor key={current.id} timeline={current} shots={shots} mask={mask} onChange={store.change} onDelete={() => void remove(current)} onOpen={onOpen} save={save} onRetry={store.retry} error={save === "error" ? store.error : null} />
      ) : <Empty icon="filmstrip" title="Pick a timeline" />}
    </div>
  );
}

interface EditorProps { timeline: Timeline; shots: Shot[]; mask: MaskMode; onChange: (t: Timeline) => void; onDelete: () => void; onOpen: (s: Shot, list: Shot[]) => void; save: SaveState; onRetry: () => void; error: string | null }

function Editor({ timeline: t, shots, mask, onChange, onDelete, onOpen, save, onRetry, error }: EditorProps) {
  const byId = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const clips = useMemo(() => resolveClips(t, byId), [t, byId]);
  const total = clips.reduce((a, c) => a + c.clip.duration_ms, 0);
  const cut = useCut(clips);
  const { cur } = cut;
  const [adding, setAdding] = useState(t.clips.length === 0);
  const [menu, setMenu] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const durRef = useRef<HTMLInputElement>(null);

  const setClips = (list: TimelineClip[]) => onChange({ ...t, clips: list });
  const update = (id: string, patch: Partial<TimelineClip>) => setClips(t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (c: ResolvedClip, d: number) => { const i = t.clips.indexOf(c.clip); if (i + d < 0 || i + d >= t.clips.length) return; const l = [...t.clips]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setClips(l); };
  const reorder = (clipId: string, index: number) => { const i = t.clips.findIndex((c) => c.id === clipId); if (i < 0) return; const l = [...t.clips]; const [x] = l.splice(i, 1); l.splice(i < index ? index - 1 : index, 0, x); setClips(l); };
  const removeClip = (c: ResolvedClip) => { const i = clips.indexOf(c); setClips(t.clips.filter((x) => x !== c.clip)); const n = clips[i + 1] ?? clips[i - 1]; cut.select(n?.clip.id ?? null); };
  const duplicate = (c: ResolvedClip) => { const i = t.clips.indexOf(c.clip); const copy = { ...c.clip, id: crypto.randomUUID() }; const l = [...t.clips]; l.splice(i + 1, 0, copy); setClips(l); cut.select(copy.id); };
  const addShots = (list: Shot[]) => {
    const fresh = list.flatMap((s) => clipsOfShot(s, mask));
    setClips([...t.clips, ...fresh]);
    if (!cur && fresh[0]) cut.select(fresh[0].id);
  };
  const addPlaceholder = () => { const p = newPlaceholder("Placeholder"); setClips([...t.clips, p]); cut.select(p.id); };
  const open = (c: ResolvedClip) => { if (c.kind === "photo") onOpen(c.shot, shotList); };
  const shotList = [...new Map(clips.flatMap((c) => (c.kind === "photo" ? [[c.shot.id, c.shot] as const] : []))).values()];

  useKeys({
    ArrowRight: () => cut.step(1),
    ArrowLeft: () => cut.step(-1),
    Home: () => clips[0] && cut.select(clips[0].clip.id),
    End: () => clips.at(-1) && cut.select(clips.at(-1)!.clip.id),
    " ": cut.toggle,
    "Alt+ArrowRight": () => { if (cur) move(cur, 1); },
    "Alt+ArrowLeft": () => { if (cur) move(cur, -1); },
    Delete: () => { if (cur) removeClip(cur); },
    d: () => durRef.current?.focus(),
    n: () => setAdding((a) => !a),
    p: addPlaceholder,
    Enter: () => { if (cur) open(cur); },
  });

  return (
    <>
      <div class="f-scroll tl-main">
        <div class="plan-day" style={{ gap: "14px" }}>
          {error && <Banner role="alert" icon="cloud-alert" title="Not saved" meta={`${error}. Your changes are kept here; they save on retry or on the next edit.`} action={<Button kind="secondary" size="sm" onClick={onRetry}>Retry</Button>} />}
          <div class="plan-head">
            <Field label="Name" style={{ flex: 1, minWidth: "220px" }}><Input value={t.name} maxLength={120} style={{ fontWeight: 700 }} onInput={(e) => onChange({ ...t, name: (e.target as HTMLInputElement).value || "Untitled" })} /></Field>
            <Field label="Length"><span class="f-input num" style={{ fontWeight: 700, padding: "0 10px", display: "inline-flex", alignItems: "center" }}>{clock(total)} · {clips.length} clip{clips.length === 1 ? "" : "s"}</span></Field>
            <Field label="Presentation" as="div"><LockSelect value={t.lock_mode} onChange={(m) => onChange({ ...t, lock_mode: m })} /></Field>
            <div class="plan-head__status">
              <SaveStatus state={save} onRetry={onRetry} />
              <div class="menu-anchor">
                <IconButton icon="dots-horizontal" label="Timeline menu" aria-expanded={menu} onClick={() => setMenu(!menu)} />
                {menu && <Popover right onClose={() => setMenu(false)}><MenuItem icon="delete-outline" danger onClick={() => { setMenu(false); onDelete(); }}>Delete timeline…</MenuItem></Popover>}
              </div>
            </div>
          </div>

          <CutPreview cut={cut} clips={clips} total={total} lock={t.lock_mode}>
            <Button kind="secondary" size="sm" icon="image-off-outline" kbd="P" onClick={addPlaceholder}>Placeholder</Button>
            <Button kind={adding ? "secondary" : "primary"} size="sm" icon="plus" kbd="N" aria-pressed={adding} onClick={() => setAdding(!adding)}>Add shots</Button>
          </CutPreview>

          <Strip clips={clips} cut={cut} stripRef={stripRef} lock={t.lock_mode} onOpen={open} onReorder={reorder} />
        </div>
      </div>
      {adding ? <AddPanel shots={shots} mask={mask} onAdd={addShots} onClose={() => setAdding(false)} />
        : cur && <ClipPanel key={cur.clip.id} c={cur} count={clips.length} lock={t.lock_mode} durRef={durRef} onUpdate={(p) => update(cur.clip.id, p)} onMove={(d) => move(cur, d)} onRemove={() => removeClip(cur)} onDuplicate={() => duplicate(cur)} onOpen={() => open(cur)} />}
    </>
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
    <Panel label="Add shots" width="340px" resize={DRAWER_RESIZE}>
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
