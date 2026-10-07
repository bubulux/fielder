import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fetchTimelines, patchShot, type Preset, type Project, type Shot, type ShotState, type Timeline, type TimelineClip } from "./api";
import { cover, placeLabel, rigLabel, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { afterG, useKeys } from "./keys";
import { Compose, type ComposeGuard } from "./compose/Compose";
import { initialRigs, RigsStage, type RigsState } from "./RigExplorer";
import { ClipPanel, clock, clipsOfShot, CutPreview, defaultPresentation, newPlaceholder, resolveClips, shotDrag, Strip, useCut, useTimelineStore, type ResolvedClip } from "./TimelineParts";
import { Banner, Button, ContextMenu, cx, Empty, EmptyNote, Field, IconButton, Input, MenuItem, Panel, PanelBody, PanelHead, promptDialog, SaveStatus, Select, Spinner, StateMarker, toast, Toolbar, ToolbarSpacer, ToolbarTitle, useCtxMenu, type SaveState } from "./ui";

/**
 * Review as a timeline-first workspace (issue #31): the selected cut on stage, the project's shots
 * in a browser beside it. Reviewing means finding the shots that carry a sequence — drag them into
 * the strip, re-frame or compose a clip in place, approve or archive from the browser, and hold
 * spots with placeholder clips. The Timeline page edits the same timelines without the browser.
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
  onUpdated: (s: Shot) => void;
  onShowOnMap: (s: Shot) => void;
  onNewShot: () => void;
}

/** A clip's photo being re-framed or composed in place; resolved live so saves show at once. */
type Edit = { kind: "framing" | "compose"; shotId: string; photoId: string };

export function ReviewPage(p: Props) {
  const projectId = p.project?.id ?? null;
  const store = useTimelineStore((set, fail) => {
    if (!projectId) return;
    fetchTimelines(projectId).then((t) => { set(t); if (!p.timelineId || !t.some((x) => x.id === p.timelineId)) p.onTimeline(t[0]?.id ?? null); }).catch(fail);
  }, [projectId]);
  const { list, save } = store;
  const create = async () => { if (projectId) { const t = await store.create(projectId); if (t) p.onTimeline(t.id); } };
  const railMenu = useCtxMenu<Timeline>();
  useKeys({ "Shift+N": () => void create() }, !!projectId);

  async function rename(t: Timeline) {
    const name = await promptDialog({ title: "Rename timeline", input: { label: "Name", value: t.name }, confirmLabel: "Rename" });
    if (name && name !== t.name) store.change({ ...t, name });
  }
  function duplicate(t: Timeline) {
    const copy: Timeline = { ...t, id: crypto.randomUUID(), name: `${t.name} (copy)`, clips: t.clips.map((c) => ({ ...c, id: crypto.randomUUID() })), created_at: "", updated_at: null };
    store.setList((cur) => [...(cur ?? []), copy]);
    store.change(copy);
    p.onTimeline(copy.id);
  }
  const remove = async (t: Timeline) => { if (await store.remove(t)) p.onTimeline(null); };

  if (!p.project) {
    return (
      <>
        <Toolbar><ToolbarTitle>Review</ToolbarTitle></Toolbar>
        <Empty icon="folder-outline" title="Pick a project to review">
          Reviewing builds a cut, and timelines belong to one project.
          <div class="f-menu" style={{ marginTop: "12px", width: "300px", textAlign: "left" }}>
            {p.projects.map((pr) => <MenuItem key={pr.id} icon="folder-outline" count={`${pr.shot_count} shots`} onClick={() => p.onPickProject(pr.id)}>{pr.name}</MenuItem>)}
          </div>
        </Empty>
      </>
    );
  }
  const current = list?.find((t) => t.id === p.timelineId) ?? null;
  const total = (t: Timeline) => t.clips.reduce((a, c) => a + c.duration_ms, 0);
  return (
    <div class="f-app__body">
      <Panel left width="240px" label="Timelines">
        <PanelHead title="Timelines"><Button size="sm" icon="plus" title="New timeline (⇧N)" onClick={() => void create()}>New</Button></PanelHead>
        <PanelBody flush role="listbox" aria-label="Timelines">
          {!list ? <div class="status"><Spinner /></div> : list.length === 0 ? <EmptyNote title="No timelines yet">“New” starts an empty cut.</EmptyNote> : list.map((t) => (
            <div key={t.id} role="option" aria-selected={t.id === p.timelineId} tabIndex={0} class={cx("f-dayitem", t.id === p.timelineId && "is-selected")}
              onClick={() => p.onTimeline(t.id)} onKeyDown={(e) => { if (e.key === "Enter") p.onTimeline(t.id); }} onContextMenu={(e) => railMenu.openMenu(e, t)}>
              <span class="f-dayitem__date">{t.name}</span>
              <span class="f-dayitem__meta num">{t.clips.length} clip{t.clips.length === 1 ? "" : "s"} · {clock(total(t))}</span>
            </div>
          ))}
        </PanelBody>
      </Panel>
      {railMenu.menu && (
        <ContextMenu x={railMenu.menu.x} y={railMenu.menu.y} label="Timeline" onClose={railMenu.closeMenu}>
          <MenuItem icon="pencil-outline" onClick={() => void rename(railMenu.menu!.ctx)}>Rename…</MenuItem>
          <MenuItem icon="content-duplicate" onClick={() => duplicate(railMenu.menu!.ctx)}>Duplicate</MenuItem>
          <MenuItem icon="delete-outline" danger onClick={() => void remove(railMenu.menu!.ctx)}>Delete timeline…</MenuItem>
        </ContextMenu>
      )}
      {current
        ? <Workspace key={current.id} timeline={current} {...p} save={save} onChange={store.change} onRetry={store.retry} error={save === "error" ? store.error : null} onDelete={() => void remove(current)} onRename={() => void rename(current)} />
        : list && list.length === 0
          ? <><Empty icon="filmstrip" title={`No timelines in ${p.project.name}`} actions={<Button icon="plus" onClick={() => void create()}>New timeline</Button>}>Reviewing is building a cut: drag shots in, hold spots with placeholders, re-frame and compose clips in place.</Empty><Browser {...p} onAdd={null} /></>
          : <Empty icon="filmstrip" title="Pick a timeline" />}
    </div>
  );
}

interface WorkspaceProps extends Props {
  timeline: Timeline;
  save: SaveState;
  onChange: (t: Timeline) => void;
  onRetry: () => void;
  error: string | null;
  onDelete: () => void;
  onRename: () => void;
}

function Workspace(p: WorkspaceProps) {
  const { timeline: t, shots, mask } = p;
  const byId = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const clips = useMemo(() => resolveClips(t, byId), [t, byId]);
  const total = clips.reduce((a, c) => a + c.clip.duration_ms, 0);
  const cut = useCut(clips);
  const { cur } = cut;
  const [panel, setPanel] = useState<"browser" | "clip">("browser");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [rigs, setRigs] = useState<RigsState | null>(null);
  const composeGuard: ComposeGuard = useRef(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const durRef = useRef<HTMLInputElement>(null);
  const clipMenu = useCtxMenu<ResolvedClip>();

  const setClips = (list: TimelineClip[]) => p.onChange({ ...t, clips: list });
  const update = (id: string, patch: Partial<TimelineClip>) => setClips(t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (c: ResolvedClip, d: number) => { const i = t.clips.indexOf(c.clip); if (i + d < 0 || i + d >= t.clips.length) return; const l = [...t.clips]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setClips(l); };
  /** `index` counts rendered clips; map it into the stored list (dead clips are skipped in render). */
  const storedIndex = (index: number) => (index >= clips.length ? t.clips.length : t.clips.indexOf(clips[index].clip));
  const reorder = (clipId: string, index: number) => {
    const from = t.clips.findIndex((c) => c.id === clipId);
    if (from < 0) return;
    let at = storedIndex(index);
    const l = [...t.clips];
    const [x] = l.splice(from, 1);
    if (from < at) at -= 1;
    l.splice(at, 0, x);
    setClips(l);
  };
  const removeClip = (c: ResolvedClip) => { const i = clips.indexOf(c); setClips(t.clips.filter((x) => x !== c.clip)); const n = clips[i + 1] ?? clips[i - 1]; cut.select(n?.clip.id ?? null); };
  const duplicate = (c: ResolvedClip) => { const i = t.clips.indexOf(c.clip); const copy = { ...c.clip, id: crypto.randomUUID() }; const l = [...t.clips]; l.splice(i + 1, 0, copy); setClips(l); cut.select(copy.id); };
  const addPlaceholder = () => { const ph = newPlaceholder("Placeholder"); setClips([...t.clips, ph]); cut.select(ph.id); setPanel("clip"); };
  const shotList = [...new Map(clips.flatMap((c) => (c.kind === "photo" ? [[c.shot.id, c.shot] as const] : []))).values()];
  const open = (c: ResolvedClip) => { if (c.kind === "photo") p.onOpen(c.shot, shotList.length ? shotList : [c.shot]); };
  const selectClip = (id: string | null) => { cut.select(id); if (id) setPanel("clip"); };

  /** An unreviewed shot that earned a place in the cut can be approved right away. */
  const offerApprove = (s: Shot) => {
    if (s.state !== "unreviewed") return;
    toast(`${shotTitle(s)} is still unreviewed`, "info", { label: "Approve", run: () => void patchShot(s.id, { state: "approved" }).then(p.onUpdated).catch((e: Error) => toast(`Update failed: ${e.message}`, "danger")) });
  };
  const addShot = (s: Shot, index?: number) => {
    const fresh = clipsOfShot(s, mask);
    const l = [...t.clips];
    l.splice(index === undefined ? l.length : index, 0, ...fresh);
    setClips(l);
    cut.select(fresh[0].id);
    offerApprove(s);
  };
  const onDropShot = (shotId: string, at: { index: number } | { fill: string }) => {
    const s = byId.get(shotId);
    if (!s) return;
    if ("index" in at) return addShot(s, storedIndex(at.index));
    // Fill the placeholder with the shot's cover photo; its hold time and notes stay.
    const ph = t.clips.find((c) => c.id === at.fill);
    if (!ph) return;
    const photo = cover(s);
    setClips(t.clips.map((c) => (c === ph ? { ...c, photo_id: photo.id, shot_id: s.id, overlay_id: null, presentation: defaultPresentation(photo, mask), title: null } : c)));
    cut.select(ph.id);
    if (s.photos.length > 1) toast(`Sequence: the placeholder took the first photo of ${s.photos.length}`, "info");
    offerApprove(s);
  };

  // Re-frame / compose the selected clip's photo in place; the clip picks up saved framings/overlays afterwards.
  const startEdit = (kind: Edit["kind"], c: ResolvedClip) => {
    if (c.kind !== "photo") return;
    if (kind === "framing" && c.photo.source !== "camera") return;
    if (kind === "framing") setRigs(initialRigs(c.photo, p.presets));
    setEdit({ kind, shotId: c.shot.id, photoId: c.photo.id });
  };
  const endEdit = async () => {
    if (edit?.kind === "compose" && composeGuard.current && !(await composeGuard.current())) return;
    setEdit(null);
  };

  useKeys({
    ArrowRight: () => cut.step(1),
    ArrowLeft: () => cut.step(-1),
    Home: () => clips[0] && selectClip(clips[0].clip.id),
    End: () => clips.at(-1) && selectClip(clips.at(-1)!.clip.id),
    " ": cut.toggle,
    "Alt+ArrowRight": () => { if (cur) move(cur, 1); },
    "Alt+ArrowLeft": () => { if (cur) move(cur, -1); },
    Delete: () => { if (cur && panel === "clip") removeClip(cur); },
    d: () => durRef.current?.focus(),
    n: () => setPanel(panel === "browser" ? "clip" : "browser"),
    p: addPlaceholder,
    r: () => { if (afterG()) return false; if (cur) startEdit("framing", cur); },
    c: () => { if (afterG()) return false; if (cur) startEdit("compose", cur); },
    Enter: () => { if (cur) open(cur); },
  }, !edit);

  // The edited shot can vanish under us (deleted elsewhere, reload): back to the workspace then.
  useEffect(() => { if (edit && !byId.get(edit.shotId)) setEdit(null); }, [edit, byId]);

  // The stage swaps to Framing or Compose for the clip's photo; everything else waits behind it.
  if (edit) {
    const shot = byId.get(edit.shotId);
    const photo = shot?.photos.find((x) => x.id === edit.photoId) ?? shot?.photos[0];
    if (!shot || !photo) return null;
    const photoIndex = shot.photos.indexOf(photo);
    return (
      <div class="rw-edit">
        <Toolbar>
          <Button kind="secondary" size="sm" icon="arrow-left" kbd="Esc" onClick={() => void endEdit()}>Review</Button>
          <ToolbarTitle>{edit.kind === "framing" ? "Framing" : "Compose"} · {shotTitle(shot)}</ToolbarTitle>
          <ToolbarSpacer />
          <span class="meta">in “{t.name}”</span>
        </Toolbar>
        <div class="f-app__body">
          {edit.kind === "compose" ? (
            <Compose key={shot.id} shot={shot} photo={photo} photoIndex={photoIndex} onPhotoIndex={(i) => setEdit({ ...edit, photoId: shot.photos[i].id })} presets={p.presets} mode={mask} onUpdated={p.onUpdated} onBack={() => void endEdit()} guard={composeGuard} />
          ) : rigs && (
            <section class="f-stage" aria-label="Stage">
              <RigsStage shot={shot} photo={photo} presets={p.presets} mode={mask} state={rigs} onState={setRigs} onBack={() => setEdit(null)} onUpdated={p.onUpdated} />
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div class="f-scroll tl-main">
        <div class="plan-day" style={{ gap: "14px" }}>
          {p.error && <Banner role="alert" icon="cloud-alert" title="Not saved" meta={`${p.error}. Your changes are kept here; they save on retry or on the next edit.`} action={<Button kind="secondary" size="sm" onClick={p.onRetry}>Retry</Button>} />}
          <div class="plan-head">
            <Field label="Name" style={{ flex: 1, minWidth: "220px" }}><Input value={t.name} maxLength={120} style={{ fontWeight: 700 }} onInput={(e) => p.onChange({ ...t, name: (e.target as HTMLInputElement).value || "Untitled" })} /></Field>
            <Field label="Length"><span class="f-input num" style={{ fontWeight: 700, padding: "0 10px", display: "inline-flex", alignItems: "center" }}>{clock(total)} · {clips.length} clip{clips.length === 1 ? "" : "s"}</span></Field>
            <div class="plan-head__status"><SaveStatus state={p.save} onRetry={p.onRetry} /></div>
          </div>

          <CutPreview cut={cut} clips={clips} total={total} maxHeight="calc(100vh - 470px)">
            <Button kind="secondary" size="sm" icon="image-off-outline" kbd="P" onClick={addPlaceholder}>Placeholder</Button>
            <Button kind={panel === "browser" ? "secondary" : "primary"} size="sm" icon="view-grid-outline" kbd="N" aria-pressed={panel === "browser"} onClick={() => setPanel(panel === "browser" ? "clip" : "browser")}>Shots</Button>
          </CutPreview>

          <Strip clips={clips} cut={{ ...cut, select: selectClip }} stripRef={stripRef} onOpen={open} onReorder={reorder} onDropShot={onDropShot} onContext={(c, e) => clipMenu.openMenu(e, c)} />
        </div>
      </div>
      {clipMenu.menu && (() => {
        const c = clipMenu.menu.ctx;
        return (
          <ContextMenu x={clipMenu.menu.x} y={clipMenu.menu.y} label="Clip" onClose={clipMenu.closeMenu}>
            {c.kind === "photo" && c.photo.source === "camera" && <MenuItem icon="crop" onClick={() => startEdit("framing", c)}>Re-frame…</MenuItem>}
            {c.kind === "photo" && <MenuItem icon="draw" onClick={() => startEdit("compose", c)}>Compose…</MenuItem>}
            {c.kind === "photo" && <MenuItem icon="image-outline" onClick={() => open(c)}>Open shot</MenuItem>}
            <MenuItem icon="content-duplicate" onClick={() => duplicate(c)}>Duplicate</MenuItem>
            <MenuItem icon="delete-outline" danger onClick={() => removeClip(c)}>Remove</MenuItem>
          </ContextMenu>
        );
      })()}
      {panel === "clip" && cur
        ? <ClipPanel key={cur.clip.id} c={cur} count={clips.length} durRef={durRef} onUpdate={(patch) => update(cur.clip.id, patch)} onMove={(d) => move(cur, d)} onRemove={() => removeClip(cur)} onDuplicate={() => duplicate(cur)} onOpen={() => open(cur)}
            onReframe={() => startEdit("framing", cur)} onCompose={() => startEdit("compose", cur)}
            head={<><span class="meta num">clip {cur.index + 1} of {clips.length}</span><IconButton icon="view-grid-outline" label="Browse shots (N)" title="Browse shots (N)" onClick={() => setPanel("browser")} /></>} />
        : <Browser {...p} onAdd={addShot} />}
    </>
  );
}

// ---------- The shot browser: find, judge, drag in ----------

type StateFilter = "review" | "unreviewed" | "approved" | "archived" | "all";
const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: "review", label: "To review + Approved" },
  { value: "unreviewed", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All states" },
];
const inState = (s: Shot, f: StateFilter) => f === "all" || (f === "review" ? s.state !== "archived" : s.state === f);

function Browser(p: Props & { onAdd: ((s: Shot) => void) | null }) {
  const [state, setState] = useState<StateFilter>("review");
  const [location, setLocation] = useState("");
  const [q, setQ] = useState("");
  const menu = useCtxMenu<Shot>();
  const [sel, setSel] = useState<string | null>(null);
  const locations = [...new Map(p.shots.map((s) => [s.location_id ?? "none", s.location_name ?? "No location"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return p.shots
      .filter((s) => inState(s, state) && (!location || (s.location_id ?? "none") === location))
      .filter((s) => !needle || shotTitle(s).toLowerCase().includes(needle) || placeLabel(s).toLowerCase().includes(needle))
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  }, [p.shots, state, location, q]);
  const selected = list.find((s) => s.id === sel) ?? null;

  async function setShotState(s: Shot, to: ShotState) {
    if (s.state === to) return;
    const before = s.state;
    try {
      const saved = await patchShot(s.id, { state: to });
      p.onUpdated(saved);
      toast(`${to === "unreviewed" ? "Back to review" : to === "approved" ? "Approved" : "Archived"} · ${s.name?.trim() || rigLabel(cover(s))}`, "ok", { label: "Undo", run: () => void patchShot(s.id, { state: before }).then(p.onUpdated).catch((e: Error) => toast(`Undo failed: ${e.message}`, "danger")) });
    } catch (e) { toast(`Update failed: ${(e as Error).message}`, "danger"); }
  }
  useKeys({
    a: () => { if (selected) void setShotState(selected, "approved"); },
    e: () => { if (selected) void setShotState(selected, selected.state === "archived" ? "unreviewed" : "archived"); },
  }, !!selected);

  const unreviewed = p.shots.filter((s) => s.state === "unreviewed").length;
  return (
    <Panel label="Shots" width="380px">
      <PanelHead title="Shots"><span class="meta num">{unreviewed} to review</span><IconButton icon="image-plus" label="New shot" title="New shot: upload or sketch" onClick={p.onNewShot} /></PanelHead>
      <div class="panel-filters">
        <Select label="State" icon="checkbox-marked-outline" value={state} onChange={(v) => setState(v as StateFilter)} options={STATE_OPTIONS} />
        <Select label="Location" icon="map-marker-outline" value={location} onChange={setLocation} options={[{ value: "", label: "All locations" }, ...locations.map(([id, name]) => ({ value: id, label: name }))]} />
        <Input sm value={q} placeholder="Search name or location…" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      <PanelBody>
        <span class="meta">Drag a shot into the strip, or onto a placeholder to fill it. Double-click opens it.</span>
        {list.length === 0 && <EmptyNote title="No shots match">Change the state filter or the location.</EmptyNote>}
        <div class="rw-grid">
          {list.map((s) => (
            // A div, not a button: the quick actions inside are buttons of their own.
            <div key={s.id} role="button" tabIndex={0} class={cx("f-card rw-card", sel === s.id && "is-selected")} {...shotDrag(s.id)}
              onClick={() => setSel(s.id)} onDblClick={() => p.onOpen(s, list)} onContextMenu={(e) => { setSel(s.id); menu.openMenu(e, s); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setSel(s.id); } }}
              title={`${shotTitle(s)} · drag into the strip`}>
              <div class="f-card__img">
                <Framed photo={cover(s)} mode={p.mask} />
                <div class="f-card__tl"><StateMarker state={s.state} iconOnly /></div>
                <div class="rw-card__acts">
                  {s.state !== "approved" && <IconButton kind="secondary" icon="check" label="Approve (A)" title="Approve (A)" onClick={(e) => { e.stopPropagation(); void setShotState(s, "approved"); }} />}
                  {s.state !== "archived" && <IconButton kind="secondary" icon="archive-arrow-down-outline" label="Archive (E)" title="Archive (E)" onClick={(e) => { e.stopPropagation(); void setShotState(s, "archived"); }} />}
                </div>
              </div>
              <div class="f-card__body">
                <span class="f-card__title">{shotTitle(s)}</span>
                <span class="f-card__sub">{[placeLabel(s), s.photos.length > 1 ? `${s.photos.length} photos` : "", s.overlays.length ? `${s.overlays.length} overlay${s.overlays.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </PanelBody>
      {menu.menu && (() => {
        const s = menu.menu.ctx;
        return (
          <ContextMenu x={menu.menu.x} y={menu.menu.y} label="Shot" onClose={menu.closeMenu}>
            {p.onAdd && <MenuItem icon="plus" onClick={() => p.onAdd!(s)}>Add to timeline</MenuItem>}
            {s.state !== "approved" && <MenuItem icon="check" onClick={() => void setShotState(s, "approved")}>Approve</MenuItem>}
            {s.state !== "archived" && <MenuItem icon="archive-arrow-down-outline" onClick={() => void setShotState(s, "archived")}>Archive</MenuItem>}
            {s.state !== "unreviewed" && <MenuItem icon="undo-variant" onClick={() => void setShotState(s, "unreviewed")}>Back to review</MenuItem>}
            <MenuItem icon="image-outline" onClick={() => p.onOpen(s, list)}>Open shot</MenuItem>
            <MenuItem icon="map-marker-outline" onClick={() => p.onShowOnMap(s)}>Show on map</MenuItem>
          </ContextMenu>
        );
      })()}
    </Panel>
  );
}
