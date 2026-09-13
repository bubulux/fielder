import { FRAME_MODES, frameModeLabel } from "./format";
import type { MaskMode } from "./Framed";

export function ModeSwitch({ value, onChange }: { value: MaskMode; onChange: (m: MaskMode) => void }) {
  return (
    <div class="seg" title="How to show the rig frame on photos">
      {FRAME_MODES.map((m) => <button key={m} class={value === m ? "active" : ""} onClick={() => onChange(m)}>{frameModeLabel(m)}</button>)}
    </div>
  );
}
