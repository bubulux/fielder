import { useMemo, useState } from "preact/hooks";
import { computeFraming, LENS_PRESETS_MM, reframe, type RigLens } from "@fielder/fov-math";
import type { Photo, Preset } from "./api";
import { Combobox } from "./Combobox";
import { sourceRigOf, type FrameGeometry } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { ModeSwitch } from "./ModeSwitch";

interface Props { photo: Photo; presets: Preset[]; mode: MaskMode; onMode: (m: MaskMode) => void; onClose: () => void }

/** "as shot" = the rig the photo was framed with; otherwise a preset id. */
interface Choice { rig: string; lensMm: number }
const AS_SHOT = "__as_shot__";

const lensRange = (p: Preset | undefined) => (p?.lens_min_mm != null && p.lens_max_mm != null ? { min: p.lens_min_mm, max: p.lens_max_mm } : null);
function lensesFor(p: Preset | undefined, extra: number[]): number[] {
  const r = lensRange(p);
  const list = [...LENS_PRESETS_MM, ...extra].filter((mm) => !r || (mm >= r.min && mm <= r.max));
  if (r) list.push(r.min, r.max);
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Re-frame one photo for other rigs and lenses. The photo only holds what the phone saw, so a
 * combination wider than that shows its frame beyond the photo (dashed), like in the app.
 */
export function RigExplorer({ photo, presets, mode, onMode, onClose }: Props) {
  const source = sourceRigOf(photo);
  const [view, setView] = useState<"single" | "compare">("single");
  const [a, setA] = useState<Choice>({ rig: AS_SHOT, lensMm: photo.lens_mm });
  const [b, setB] = useState<Choice>({ rig: presets.find((p) => p.id !== photo.preset_id)?.id ?? AS_SHOT, lensMm: photo.lens_mm });

  if (!source) return <div class="status">This photo has no framing data, so it cannot be re-framed.</div>;
  const rigOf = (c: Choice): RigLens => {
    const p = presets.find((x) => x.id === c.rig);
    if (!p) return { ...source.rigLens, lensMm: c.lensMm };
    return { rig: { sensor: { widthMm: p.sensor_width_mm, heightMm: p.sensor_height_mm }, speedboosterFactor: p.speedbooster_factor }, lensMm: c.lensMm, portrait: source.rigLens.portrait };
  };
  const frameFor = (c: Choice): FrameGeometry => {
    const r = reframe(source.rigLens, source.frame, rigOf(c));
    return { width_fraction: r.widthFraction, height_fraction: r.heightFraction };
  };
  const rigName = (c: Choice) => presets.find((p) => p.id === c.rig)?.name ?? `As shot (${photo.preset_name ?? (photo.framing?.preset_name as string | undefined) ?? "rig"})`;

  return (
    <div class="explorer">
      <div class="explorer-head">
        <strong>Rig explorer</strong>
        <div class="seg">
          <button class={view === "single" ? "active" : ""} onClick={() => setView("single")}>One rig</button>
          <button class={view === "compare" ? "active" : ""} onClick={() => setView("compare")}>Compare</button>
        </div>
        <ModeSwitch value={mode} onChange={onMode} />
        <span style="flex:1" />
        <button class="btn outline" onClick={onClose}>Back to details</button>
      </div>
      {view === "single" ? (
        <Single photo={photo} presets={presets} choice={a} onChoice={setA} frameFor={frameFor} rigOf={rigOf} rigName={rigName} mode={mode} />
      ) : (
        <div class="compare">
          <Pane photo={photo} presets={presets} choice={a} onChoice={setA} frame={frameFor(a)} rig={rigOf(a)} name={rigName(a)} mode={mode} tag="A" />
          <Pane photo={photo} presets={presets} choice={b} onChoice={setB} frame={frameFor(b)} rig={rigOf(b)} name={rigName(b)} mode={mode} tag="B" />
        </div>
      )}
    </div>
  );
}

interface PaneProps { photo: Photo; presets: Preset[]; choice: Choice; onChoice: (c: Choice) => void; mode: MaskMode }

function Pickers({ photo, presets, choice, onChoice }: Omit<PaneProps, "mode">) {
  const preset = presets.find((p) => p.id === choice.rig);
  const lenses = lensesFor(preset, [photo.lens_mm]);
  const options = [{ value: AS_SHOT, label: "As shot" }, ...presets.map((p) => ({ value: p.id, label: p.name }))];
  return (
    <div class="pickers">
      <label>Rig<Combobox options={options} value={choice.rig} clearable={false} onChange={(v) => { if (!v) return; const p = presets.find((x) => x.id === v); const r = lensRange(p); onChoice({ rig: v, lensMm: r ? Math.min(r.max, Math.max(r.min, choice.lensMm)) : choice.lensMm }); }} /></label>
      <label>Lens
        <div class="chips small">
          {lenses.map((mm) => <button type="button" key={mm} class={`chip ${mm === choice.lensMm ? "active" : ""}`} onClick={() => onChoice({ ...choice, lensMm: mm })}>{mm}</button>)}
        </div>
      </label>
    </div>
  );
}

function Facts({ rig, frame }: { rig: RigLens; frame: FrameGeometry }) {
  const f = computeFraming(rig.rig, rig.lensMm);
  const wider = frame.width_fraction > 1 || frame.height_fraction > 1;
  return (
    <div class="meta">
      {rig.lensMm} mm{rig.rig.speedboosterFactor !== 1 ? ` ×${rig.rig.speedboosterFactor}` : ""} · {f.fullFrameEquivalentMm.toFixed(1)} mm FF-eq · {f.fov.horizontal.toFixed(1)}° × {f.fov.vertical.toFixed(1)}°
      {wider && <span class="warn"> · sees more than this photo (dashed)</span>}
    </div>
  );
}

function Pane({ photo, presets, choice, onChoice, frame, rig, name, mode, tag }: PaneProps & { frame: FrameGeometry; rig: RigLens; name: string; tag: string }) {
  return (
    <div class="pane">
      <div class="pane-title"><span class="tag">{tag}</span> {name}</div>
      <Framed photo={photo} mode={mode} frame={frame} maxHeight="52vh" />
      <Facts rig={rig} frame={frame} />
      <Pickers photo={photo} presets={presets} choice={choice} onChoice={onChoice} />
    </div>
  );
}

function Single({ photo, presets, choice, onChoice, frameFor, rigOf, rigName, mode }: PaneProps & { frameFor: (c: Choice) => FrameGeometry; rigOf: (c: Choice) => RigLens; rigName: (c: Choice) => string }) {
  const preset = presets.find((p) => p.id === choice.rig);
  const lenses = useMemo(() => lensesFor(preset, [photo.lens_mm]), [preset, photo.lens_mm]);
  const frame = frameFor(choice);
  return (
    <div class="single">
      <div class="pane">
        <div class="pane-title">{rigName(choice)}</div>
        <Framed photo={photo} mode={mode} frame={frame} maxHeight="56vh" />
        <Facts rig={rigOf(choice)} frame={frame} />
        <Pickers photo={photo} presets={presets} choice={choice} onChoice={onChoice} />
      </div>
      <div class="lens-strip" title="Every lens on this rig; click one to look at it">
        {lenses.map((mm) => (
          <button key={mm} class={mm === choice.lensMm ? "active" : ""} onClick={() => onChoice({ ...choice, lensMm: mm })}>
            <Framed photo={photo} mode="mask" frame={frameFor({ ...choice, lensMm: mm })} />
            <span>{mm} mm</span>
          </button>
        ))}
      </div>
    </div>
  );
}
