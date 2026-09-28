import { useMemo } from "preact/hooks";
import { computeFraming, LENS_PRESETS_MM, reframe, type RigLens } from "@fielder/fov-math";
import type { Photo, Preset } from "./api";
import { sourceRigOf, type FrameGeometry } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { useKeys } from "./keys";
import { cx, Empty, Icon, Seg, Select } from "./ui";

/** "as shot" = the rig the photo was framed with; otherwise a preset id. */
export interface RigChoice { rig: string; lensMm: number }
export const AS_SHOT = "__as_shot__";
export interface RigsState { view: "one" | "compare"; a: RigChoice; b: RigChoice }
export const initialRigs = (photo: Photo, presets: Preset[]): RigsState => ({
  view: "one",
  a: { rig: AS_SHOT, lensMm: photo.lens_mm },
  b: { rig: presets.find((p) => p.id !== photo.preset_id)?.id ?? AS_SHOT, lensMm: photo.lens_mm },
});

const lensRange = (p: Preset | undefined) => (p?.lens_min_mm != null && p.lens_max_mm != null ? { min: p.lens_min_mm, max: p.lens_max_mm } : null);
function lensesFor(p: Preset | undefined, extra: number[]): number[] {
  const r = lensRange(p);
  const list = [...LENS_PRESETS_MM, ...extra].filter((mm) => !r || (mm >= r.min && mm <= r.max));
  if (r) list.push(r.min, r.max);
  return [...new Set(list)].sort((a, b) => a - b);
}

interface Props { photo: Photo; presets: Preset[]; mode: MaskMode; state: RigsState; onState: (s: RigsState) => void; onBack: () => void }

/**
 * Stage mode "Rigs": re-frame the photo for other rigs and lenses. The photo only holds what the
 * phone saw, so a combination wider than that shows its frame beyond the photo (dashed).
 */
export function RigsStage({ photo, presets, mode, state, onState, onBack }: Props) {
  const source = sourceRigOf(photo);
  const preset = presets.find((p) => p.id === state.a.rig);
  const lenses = useMemo(() => lensesFor(preset, [photo.lens_mm]), [preset, photo.lens_mm]);
  const stepLens = (d: number) => {
    const i = lenses.indexOf(state.a.lensMm);
    const n = lenses[Math.max(0, Math.min(lenses.length - 1, (i < 0 ? lenses.findIndex((x) => x > state.a.lensMm) : i) + d))];
    if (n) onState({ ...state, a: { ...state.a, lensMm: n } });
  };
  useKeys({ ArrowLeft: () => stepLens(-1), ArrowRight: () => stepLens(1), Escape: onBack }, state.view === "one");
  useKeys({ Escape: onBack }, state.view === "compare");

  if (!source) return <><div class="f-stage__bar"><span class="grow" /><button type="button" class="f-btn f-btn--ghost f-btn--sm" onClick={onBack}>Back to photo<span class="f-btn__kbd">Esc</span></button></div><div class="f-stage__view" style={{ color: "#fff" }}><Empty icon="crop-free" title="No framing data">This photo cannot be re-framed.</Empty></div></>;

  const rigOf = (c: RigChoice): RigLens => {
    const p = presets.find((x) => x.id === c.rig);
    if (!p) return { ...source.rigLens, lensMm: c.lensMm };
    return { rig: { sensor: { widthMm: p.sensor_width_mm, heightMm: p.sensor_height_mm }, speedboosterFactor: p.speedbooster_factor }, lensMm: c.lensMm, portrait: source.rigLens.portrait };
  };
  const frameFor = (c: RigChoice): FrameGeometry => {
    const r = reframe(source.rigLens, source.frame, rigOf(c));
    return { width_fraction: r.widthFraction, height_fraction: r.heightFraction };
  };
  const asShotName = photo.preset_name ?? (photo.framing?.preset_name as string | undefined) ?? "rig";
  const rigName = (c: RigChoice) => presets.find((p) => p.id === c.rig)?.name ?? `As shot · ${asShotName}`;
  const setA = (a: RigChoice) => onState({ ...state, a });
  const setB = (b: RigChoice) => onState({ ...state, b });

  return (
    <>
      <div class="f-stage__bar">
        <Seg label="Explorer" value={state.view} onChange={(view) => onState({ ...state, view })} options={[{ id: "one", label: "One rig" }, { id: "compare", label: "Compare A / B" }]} />
        {state.view === "one" && <><Pickers photo={photo} presets={presets} choice={state.a} onChoice={setA} /><span class="meta num">{factsText(rigOf(state.a))}</span></>}
        <span class="f-toolbar__sp" />
        {state.view === "one" && <span class="meta">←/→ step the lens · shots paused</span>}
        <button type="button" class="f-btn f-btn--ghost f-btn--sm" onClick={onBack}>Back to photo<span class="f-btn__kbd">Esc</span></button>
      </div>
      <div class="f-stage__view">
        {state.view === "one" ? (
          <Reframed photo={photo} mode={mode} frame={frameFor(state.a)} tag={rigName(state.a) + ` · ${state.a.lensMm} mm`} />
        ) : (
          <div class="compare">
            {([["A", state.a, setA], ["B", state.b, setB]] as const).map(([tag, c, set]) => (
              <div key={tag} class="compare__pane">
                <div class="compare__head"><span class="f-board-lbl">{tag}</span><Pickers photo={photo} presets={presets} choice={c} onChoice={set} /></div>
                <div class="compare__photo"><Reframed photo={photo} mode={mode === "off" ? "mask" : mode} frame={frameFor(c)} /></div>
                <span class="compare__facts num">{factsText(rigOf(c))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {state.view === "one" && (
        <div class="f-stage__foot">
          <div class="f-strip" role="listbox" aria-label={`Lenses of ${rigName(state.a)}`}>
            {lenses.map((mm) => {
              const fr = frameFor({ ...state.a, lensMm: mm });
              return (
                <button key={mm} type="button" role="option" aria-selected={mm === state.a.lensMm} class={cx("f-strip__it", mm === state.a.lensMm && "is-sel")} title={`${mm} mm`} onClick={() => setA({ ...state.a, lensMm: mm })}>
                  <Framed photo={photo} mode="mask" frame={fr} />
                  <span class="f-strip__lbl">{mm} mm</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function factsText(rig: RigLens): string {
  const f = computeFraming(rig.rig, rig.lensMm);
  return `FF ${f.fullFrameEquivalentMm.toFixed(1)} mm · HFOV ${f.fov.horizontal.toFixed(1)}° · VFOV ${f.fov.vertical.toFixed(1)}°`;
}

function Reframed({ photo, mode, frame, tag }: { photo: Photo; mode: MaskMode; frame: FrameGeometry; tag?: string }) {
  const wider = frame.width_fraction > 1 || frame.height_fraction > 1;
  return (
    <Framed photo={photo} mode={mode} frame={frame} maxHeight="calc(100vh - 290px)">
      {wider && <span class="f-framed__more" style={{ left: "8px", top: "8px" }}><Icon name="arrow-expand-all" />Sees more than this photo</span>}
      {tag && <span class="f-framed__tag"><Icon name="camera-control" />{tag}</span>}
    </Framed>
  );
}

function Pickers({ photo, presets, choice, onChoice }: { photo: Photo; presets: Preset[]; choice: RigChoice; onChoice: (c: RigChoice) => void }) {
  const preset = presets.find((p) => p.id === choice.rig);
  const lenses = lensesFor(preset, [photo.lens_mm, choice.lensMm]);
  const pickRig = (v: string) => { const p = presets.find((x) => x.id === v); const r = lensRange(p); onChoice({ rig: v, lensMm: r ? Math.min(r.max, Math.max(r.min, choice.lensMm)) : choice.lensMm }); };
  return (
    <>
      <Select label="Rig" prefix="Rig" width="200px" value={choice.rig} onChange={pickRig}
        options={[{ value: AS_SHOT, label: "As shot" }, ...presets.map((p) => ({ value: p.id, label: p.name }))]} />
      <Select label="Lens" prefix="Lens" width="120px" value={String(choice.lensMm)} onChange={(v) => onChoice({ ...choice, lensMm: Number(v) })}
        options={lenses.map((mm) => ({ value: String(mm), label: `${mm} mm` }))} />
    </>
  );
}
