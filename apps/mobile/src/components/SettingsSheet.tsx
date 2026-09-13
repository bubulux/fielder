import { Switch, Text, View } from "react-native";
import { Button, Chip, ChipRow, colors, Hint, Input, Row, Sheet } from "./ui";
import { PHONE } from "../phone";
import type { Settings } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  pendingCount: number;
  onRetryUploads: () => void;
  buildInfo: string;
}

const BORDER_COLORS = ["#FFFFFF", "#FFB300", "#00E676", "#00B0FF", "#FF3B30", "#000000"];
const TINTS: { label: string; value: string }[] = [
  { label: "Red 50%", value: "rgba(255,0,0,0.5)" },
  { label: "Black 60%", value: "rgba(0,0,0,0.6)" },
  { label: "Black 85%", value: "rgba(0,0,0,0.85)" },
  { label: "White 50%", value: "rgba(255,255,255,0.5)" },
];

export function SettingsSheet({ visible, onClose, settings, onChange, pendingCount, onRetryUploads, buildInfo }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Sheet visible={visible} title="Settings" onClose={onClose}>
      <Row label={`${PHONE.model} main camera, 35mm-equivalent`}>
        <Input
          value={String(settings.phoneEquivalentFocalMm)}
          onChangeText={(t) => { const v = Number(t.replace(",", ".")); if (Number.isFinite(v) && v > 5 && v < 200) set("phoneEquivalentFocalMm", v); }}
          keyboardType="decimal-pad"
        />
        <Hint>Spec-sheet value is {PHONE.mainCameraEquivalentFocalMm} mm. Only change this if the overlay is measurably off against a real camera; a smaller value makes the frame smaller on screen.</Hint>
        {settings.phoneEquivalentFocalMm !== PHONE.mainCameraEquivalentFocalMm && (
          <Button label={`Reset to ${PHONE.mainCameraEquivalentFocalMm} mm`} kind="ghost" onPress={() => set("phoneEquivalentFocalMm", PHONE.mainCameraEquivalentFocalMm)} />
        )}
      </Row>
      <Row label="Rig orientation">
        <ChipRow>
          <Chip label="Landscape" selected={settings.rigOrientation === "landscape"} onPress={() => set("rigOrientation", "landscape")} />
          <Chip label="Portrait" selected={settings.rigOrientation === "portrait"} onPress={() => set("rigOrientation", "portrait")} />
        </ChipRow>
      </Row>
      <Row label="Screen orientation on launch">
        <ChipRow>
          <Chip label="Auto" selected={settings.orientationLock === "auto"} onPress={() => set("orientationLock", "auto")} />
          <Chip label="Lock landscape" selected={settings.orientationLock === "landscape"} onPress={() => set("orientationLock", "landscape")} />
          <Chip label="Lock portrait" selected={settings.orientationLock === "portrait"} onPress={() => set("orientationLock", "portrait")} />
        </ChipRow>
        <Hint>Locks the whole app to that orientation, so it opens ready to shoot. Applies immediately.</Hint>
      </Row>
      <Row label="Fit to frame (digital zoom)">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text }}>Enabled</Text>
          <Switch value={settings.fitToFrame} onValueChange={(v) => set("fitToFrame", v)} trackColor={{ true: colors.accent }} />
        </View>
        <Hint>Scales the live image so the rig frame fills the screen. Purely digital, so it gets soft with long lenses, but it shows the frame edges at full size. Also available as the Fit button.</Hint>
      </Row>
      <Row label="Frame border">
        <ChipRow>
          {BORDER_COLORS.map((c) => (
            <Chip key={c} label={c === settings.borderColor ? "● " + c : c} selected={c === settings.borderColor} onPress={() => set("borderColor", c)} />
          ))}
        </ChipRow>
        <ChipRow>
          {[1, 2, 3, 4, 6].map((w) => (
            <Chip key={w} label={`${w} px`} selected={w === settings.borderWidthPx} onPress={() => set("borderWidthPx", w)} />
          ))}
        </ChipRow>
      </Row>
      <Row label="Blackout outside frame">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text }}>Enabled</Text>
          <Switch value={settings.blackoutEnabled} onValueChange={(v) => set("blackoutEnabled", v)} trackColor={{ true: colors.accent }} />
        </View>
        <ChipRow>
          {TINTS.map((t) => (
            <Chip key={t.value} label={t.label} selected={t.value === settings.blackoutColor} onPress={() => set("blackoutColor", t.value)} />
          ))}
        </ChipRow>
      </Row>
      <Row label="Uploads">
        <Text style={{ color: colors.text }}>{pendingCount === 0 ? "All shots uploaded." : `${pendingCount} shot(s) waiting for upload.`}</Text>
        {pendingCount > 0 && <Button label="Retry now" kind="ghost" onPress={onRetryUploads} />}
      </Row>
      <Row label="Build"><Text style={{ color: colors.dim, fontSize: 12 }}>{buildInfo}</Text></Row>
    </Sheet>
  );
}
