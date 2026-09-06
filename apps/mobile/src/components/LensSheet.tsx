import { useState } from "react";
import { LENS_PRESETS_MM } from "@fielder/fov-math";
import { Button, Chip, ChipRow, Hint, Input, Row, Sheet } from "./ui";

interface Props { visible: boolean; onClose: () => void; lensMm: number; onChange: (mm: number) => void }

export function LensSheet({ visible, onClose, lensMm, onChange }: Props) {
  const [custom, setCustom] = useState("");
  const applyCustom = () => {
    const v = Number(custom.replace(",", "."));
    if (Number.isFinite(v) && v >= 1 && v <= 2000) { onChange(v); setCustom(""); onClose(); }
  };
  return (
    <Sheet visible={visible} title="Lens focal length" onClose={onClose}>
      <Row label="Common focal lengths (as printed on the lens)">
        <ChipRow>
          {LENS_PRESETS_MM.map((mm) => (
            <Chip key={mm} label={`${mm} mm`} selected={mm === lensMm} onPress={() => { onChange(mm); onClose(); }} />
          ))}
        </ChipRow>
      </Row>
      <Row label="Custom / zoom position">
        <Input value={custom} onChangeText={setCustom} placeholder="e.g. 70" keyboardType="decimal-pad" onSubmitEditing={applyCustom} />
        <Hint>Enter the lens's native focal length. The speedbooster from the active rig is applied automatically.</Hint>
        <Button label="Use" onPress={applyCustom} disabled={!custom} />
      </Row>
    </Sheet>
  );
}
