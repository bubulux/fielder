import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { LensRange } from "../types";
import { lensList } from "../lens";
import { Button, Chip, Hint, Input, makeStyles, Sheet, type } from "../ui";

interface Props { visible: boolean; onClose: () => void; lensMm: number; onChange: (mm: number) => void; range: LensRange | null }

/** Any focal length: a number field (auto-focused) plus the rig's presets. Outside the range is allowed and marked. */
export function LensSheet({ visible, onClose, lensMm, onChange, range }: Props) {
  const s = useStyles();
  const [text, setText] = useState(String(lensMm));
  useEffect(() => { if (visible) setText(String(lensMm)); }, [visible]);
  const v = Number(text.replace(",", "."));
  const valid = Number.isFinite(v) && v >= 1 && v <= 2000;
  const outside = valid && !!range && (v < range.min || v > range.max);
  const use = () => { if (!valid) return; onChange(v); onClose(); };
  return (
    <Sheet visible={visible} title="Lens focal length" sub={range ? `Rig range ${range.min}–${range.max} mm` : "As printed on the lens"} onClose={onClose} doneLabel={null}
      footer={<Button icon="check" label={valid ? `Use ${v} mm` : "Use"} onPress={use} disabled={!valid} />}>
      <Input value={text} onChangeText={setText} autoFocus selectTextOnFocus keyboardType="decimal-pad" onSubmitEditing={use} placeholder="mm" style={s.big} />
      {!valid && text.trim() !== "" && <Text style={s.error}>Enter a focal length between 1 and 2000 mm.</Text>}
      {outside && <Text style={s.warn}>Outside the rig's lens range; it shows struck through on the strip.</Text>}
      <View style={s.chips}>
        {lensList(range).map((mm) => <Chip key={mm} label={`${mm}`} selected={mm === v} onPress={() => { onChange(mm); onClose(); }} />)}
      </View>
      <Hint>The native focal length of the lens. The rig's speedbooster is applied automatically.</Hint>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  big: { ...type("heading", "heavy"), minHeight: 60 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { ...type("small", "semibold"), color: c.danger },
  warn: { ...type("small", "semibold"), color: c.warnInk },
}));
