import { useState } from "react";
import { Text } from "react-native";
import type { LensRange } from "../types";
import { lensList } from "../lens";
import { Button, Chip, ChipRow, colors, Hint, Input, Row, Sheet } from "./ui";

interface Props { visible: boolean; onClose: () => void; lensMm: number; onChange: (mm: number) => void; range: LensRange | null }

export function LensSheet({ visible, onClose, lensMm, onChange, range }: Props) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const applyCustom = () => {
    const v = Number(custom.replace(",", "."));
    if (!Number.isFinite(v) || v < 1 || v > 2000) { setError("Enter a focal length between 1 and 2000 mm."); return; }
    if (range && (v < range.min || v > range.max)) { setError(`Outside the rig's lens range (${range.min}–${range.max} mm).`); return; }
    onChange(v); setCustom(""); setError(null); onClose();
  };
  return (
    <Sheet visible={visible} title="Lens focal length" onClose={onClose}>
      <Row label={range ? `Focal lengths within the rig's ${range.min}–${range.max} mm range` : "Common focal lengths (as printed on the lens)"}>
        <ChipRow>
          {lensList(range).map((mm) => (
            <Chip key={mm} label={`${mm} mm`} selected={mm === lensMm} onPress={() => { onChange(mm); onClose(); }} />
          ))}
        </ChipRow>
      </Row>
      <Row label="Custom / zoom position">
        <Input value={custom} onChangeText={(t) => { setCustom(t); setError(null); }} placeholder={range ? `${range.min}–${range.max}` : "e.g. 70"} keyboardType="decimal-pad" onSubmitEditing={applyCustom} />
        {error && <Text style={{ color: colors.danger, marginTop: 6, fontSize: 12 }}>{error}</Text>}
        <Hint>Enter the lens's native focal length. The speedbooster from the active rig is applied automatically.</Hint>
        <Button label="Use" onPress={applyCustom} disabled={!custom} />
      </Row>
    </Sheet>
  );
}
