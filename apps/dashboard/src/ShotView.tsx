import { useEffect, useState } from "preact/hooks";
import { label, type FieldDef } from "@fielder/vocab";
import { deleteShot, patchShot, type Location, type Preset, type Project, type Shot, type ShotState } from "./api";
import { FRAME_MODES, rigLabel, when } from "./format";
import { downloadCrop, Framed, type MaskMode } from "./Framed";
import { Inspector } from "./Inspector";
import { afterG, useKeys } from "./keys";
import { ModeSwitch } from "./ModeSwitch";
import { PositionStage } from "./PositionEditor";
import { initialRigs, RigsStage, type RigsState } from "./RigExplorer";
import type { Stage } from "./router";
import { confirmDialog, cx, Icon, Kbd, Seg, toast } from "./ui";

export type ShotContext =
  | { kind: "shot"; line: string; onBack: () => void; backLabel: string }
  | { kind: "review"; total: number };

interface Props {
  shot: Shot;
  /** The list it was opened from (or the review queue), for ←/→ and the position. */
  list: Shot[];
  onNavigate: (s: Shot) => void;
  context: ShotContext;
  stage: Stage;
  onStage: (s: Stage) => void;
  mode: MaskMode;
  onMode: (m: MaskMode) => void;
  projects: Project[];
  presets: Preset[];
  fieldsOf: (projectId: string) => FieldDef[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onDeleted: (id: string) => void;
  onShowOnMap: (s: Shot) => void;
  onOpenDay: (projectId: string, dayId: string) => void;
}

const nextMode = (m: MaskMode) => FRAME_MODES[(FRAME_MODES.indexOf(m) + 1) % FRAME_MODES.length];

/** A shot on a large stage (Photo · Rigs · Position) with the inspector on the right. Shared by the shot view and Review. */
export function ShotView(p: Props) {
  const { shot, list, stage } = p;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [rigs, setRigs] = useState<RigsState>(() => initialRigs(shot.photos[0], p.presets));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPhotoIndex(0); }, [shot.id]);
  const photo = shot.photos[Math.min(photoIndex, shot.photos.length - 1)];
  useEffect(() => { setRigs(initialRigs(photo, p.presets)); }, [photo.id]);
  const index = list.findIndex((s) => s.id === shot.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  async function setState(state: ShotState) {
    if (busy || state === shot.state) return;
    const before = shot.state;
    setBusy(true);
    try {
      const s = await patchShot(shot.id, { state });
      p.onUpdated(s);
      toast(`${state === "unreviewed" ? "Back to review" : label(state)} · ${shot.name?.trim() || rigLabel(shot.photos[0])}`, "ok", { label: "Undo", run: () => void patchShot(shot.id, { state: before }).then(p.onUpdated).catch((e: Error) => toast(`Undo failed: ${e.message}`, "danger")) });
    } catch (e) { toast(`Update failed: ${(e as Error).message}`, "danger"); } finally { setBusy(false); }
  }
  async function remove() {
    const choice = await confirmDialog({
      title: "Delete this shot?",
      body: `Removes ${shot.photos.length > 1 ? `all ${shot.photos.length} images` : "the image"} and the metadata from the server permanently. Archive keeps them.`,
      confirmLabel: "Delete", danger: true, altLabel: shot.state === "archived" ? undefined : "Archive",
    });
    if (choice === "alt") return setState("archived");
    if (!choice) return;
    try { await deleteShot(shot.id); p.onDeleted(shot.id); toast("Shot deleted"); } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); }
  }
  const approveKey = () => { if (shot.state !== "approved") void setState("approved"); };
  const archiveKey = () => void setState(shot.state === "archived" ? "unreviewed" : "archived");

  useKeys({
    ArrowLeft: () => { if (prev) p.onNavigate(prev); },
    ArrowRight: () => { if (next) p.onNavigate(next); },
    ",": () => setPhotoIndex((i) => Math.max(0, i - 1)),
    ".": () => setPhotoIndex((i) => Math.min(shot.photos.length - 1, i + 1)),
    a: approveKey,
    e: archiveKey,
    r: () => { if (afterG()) return false; p.onStage("rigs"); },
    m: () => { if (afterG()) return false; p.onMode(nextMode(p.mode)); },
    Escape: () => { if (p.context.kind === "shot") p.context.onBack(); else return false; },
  }, stage === "photo");

  const pos = index >= 0 ? `${index + 1} of ${list.length}` : "";
  return (
    <>
      <div class="f-toolbar">
        {p.context.kind === "shot" ? (
          <>
            <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={p.context.onBack}><Icon name="arrow-left" />{p.context.backLabel}<span class="f-btn__kbd">Esc</span></button>
            <div class="toolbar-pos"><strong class="num">{pos}</strong><span class="meta">{p.context.line}</span></div>
          </>
        ) : (
          <>
            <div class="f-toolbar__title"><span>Review</span></div>
            <div class="review-progress">
              <span class="num" style={{ fontSize: "var(--text-caption)" }}><strong>{index + 1} of {p.context.total}</strong> · oldest first</span>
              <div class="f-progress" style={{ height: "6px" }}><div class="f-progress__bar" style={{ width: `${((index + 1) / Math.max(1, p.context.total)) * 100}%` }} /></div>
            </div>
          </>
        )}
        <div class="btn-row" style={{ gap: "4px" }}>
          <button type="button" class="f-btn f-btn--secondary f-btn--sm f-btn--icon" aria-label="Previous shot (←)" title="Previous (←)" disabled={!prev || stage !== "photo"} onClick={() => prev && p.onNavigate(prev)}><Icon name="chevron-left" /></button>
          <button type="button" class="f-btn f-btn--secondary f-btn--sm f-btn--icon" aria-label="Next shot (→)" title="Next (→)" disabled={!next || stage !== "photo"} onClick={() => next && p.onNavigate(next)}><Icon name="chevron-right" /></button>
        </div>
        <span class="f-toolbar__sp" />
        <Seg label="Stage" value={stage} onChange={p.onStage} options={[
          { id: "photo", icon: "image-outline", label: "Photo" },
          { id: "rigs", icon: "camera-control", label: <>Rigs <Kbd>R</Kbd></> },
          { id: "position", icon: "crosshairs-gps", label: "Position" },
        ]} />
        <ModeSwitch value={p.mode} onChange={p.onMode} />
      </div>
      <div class="f-app__body">
        <section class="f-stage" aria-label="Stage">
          {stage === "rigs" ? (
            <RigsStage photo={photo} presets={p.presets} mode={p.mode} state={rigs} onState={setRigs} onBack={() => p.onStage("photo")} />
          ) : stage === "position" ? (
            <PositionStage key={photo.id} shot={shot} photo={photo} onSaved={(s) => { p.onUpdated(s); p.onStage("photo"); toast("Position saved"); }} onCancel={() => p.onStage("photo")} onError={(m) => toast(m, "danger")} />
          ) : (
            <>
              <div class="f-stage__view">
                <Framed photo={photo} mode={p.mode} maxHeight="calc(100vh - 260px)">
                  <span class="f-framed__tag"><Icon name="camera-control" />{rigLabel(photo)}</span>
                </Framed>
                <button type="button" class="f-stage__nav f-stage__nav--prev" aria-label="Previous shot (←)" disabled={!prev} onClick={() => prev && p.onNavigate(prev)}><Icon name="chevron-left" /></button>
                <button type="button" class="f-stage__nav f-stage__nav--next" aria-label="Next shot (→)" disabled={!next} onClick={() => next && p.onNavigate(next)}><Icon name="chevron-right" /></button>
              </div>
              <div class="f-stage__foot">
                {shot.photos.length > 1 && (
                  <>
                    <div class="f-strip" role="listbox" aria-label="Photos in this shot">
                      {shot.photos.map((ph, i) => (
                        <button key={ph.id} type="button" role="option" aria-selected={i === photoIndex} class={cx("f-strip__it", i === photoIndex && "is-sel")} onClick={() => setPhotoIndex(i)}>
                          <img src={ph.image_url} alt="" loading="lazy" />
                          <span class="f-strip__n">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                    <span class="meta keys-inline"><Kbd>,</Kbd><Kbd>.</Kbd>photo {photoIndex + 1} of {shot.photos.length}</span>
                  </>
                )}
                {shot.photos.length === 1 && <span class="meta num">{when(shot.captured_at)}</span>}
                <span class="f-toolbar__sp" />
                <div class="btn-row" style={{ gap: "6px", justifyContent: "flex-end" }}>
                  <button type="button" class="f-btn f-btn--secondary f-btn--sm" title="Download the photo cropped to the rig frame" onClick={() => void downloadCrop(photo)}><Icon name="crop" />Download crop</button>
                  <a class="f-btn f-btn--secondary f-btn--sm" href={photo.image_url} download target="_blank" rel="noreferrer"><Icon name="download-outline" />Original</a>
                  <button type="button" class="f-btn f-btn--secondary f-btn--sm" onClick={() => p.onShowOnMap(shot)}><Icon name="map-marker-outline" />Show on map</button>
                  <button type="button" class="f-btn f-btn--danger f-btn--sm f-btn--icon" aria-label="Delete shot…" title="Delete shot…" onClick={() => void remove()}><Icon name="delete-outline" /></button>
                </div>
              </div>
            </>
          )}
        </section>
        <Inspector shot={shot} photo={photo} projects={p.projects} fields={p.fieldsOf(shot.project_id)} locations={p.locations} onLocations={p.onLocations}
          onUpdated={p.onUpdated} onState={(s) => void setState(s)} stateBusy={busy} onCorrect={() => p.onStage("position")} onOpenDay={p.onOpenDay} />
      </div>
    </>
  );
}

/** Hints for the key bar, per stage. */
export function shotHints(stage: Stage, review: boolean): { k: string; t: string }[] {
  if (stage === "rigs") return [{ k: "←/→", t: "Lens" }, { k: "Tab", t: "Rig / lens pickers" }, { k: "Esc", t: "Back to photo" }];
  if (stage === "position") return [{ k: "Drag", t: "Move pin" }, { k: "↵", t: "Save position" }, { k: "Esc", t: "Cancel" }];
  return [{ k: "←/→", t: review ? "Queue" : "Shots" }, { k: ", .", t: "Photos" }, { k: "A", t: "Approve" }, { k: "E", t: "Archive" }, { k: "R", t: "Rigs" }, { k: "M", t: "Frame mode" }, { k: "Esc", t: review ? "Leave field" : "Close" }];
}
