import { type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

export const colors = {
  bg: "#0B0B0D",
  panel: "#16161A",
  border: "#2A2A31",
  text: "#F2F2F5",
  dim: "#9A9AA5",
  accent: "#FFB300",
  danger: "#FF3B30",
  ok: "#2ECC71",
  btn: "#2C2C34",
};

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={s.close}>Done</Text></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowValue}>{children}</View>
    </View>
  );
}

export function Chip({ label, selected, onPress, danger }: { label: string; selected?: boolean; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && s.chipSelected, danger && { borderColor: colors.danger }]}>
      <Text style={[s.chipText, selected && { color: "#000" }, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={s.chipRow}>{children}</View>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.dim} {...props} style={[s.input, props.style]} />;
}

/** primary = accent, approve = green, archive = grey, ghost = outlined, danger = red outline. */
export function Button({ label, onPress, kind = "primary", disabled }: { label: string; onPress: () => void; kind?: "primary" | "approve" | "archive" | "ghost" | "danger"; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === "ghost" && s.btnGhost, kind === "danger" && s.btnDanger, kind === "approve" && s.btnApprove, kind === "archive" && s.btnArchive, disabled && { opacity: 0.4 }]}>
      <Text style={[s.btnText, kind === "danger" ? { color: colors.danger } : (kind === "ghost" || kind === "archive") ? { color: colors.text } : null]}>{label}</Text>
    </Pressable>
  );
}

/** Coloured review-state tag (colours shared with the dashboard via @fielder/vocab). */
export function StateBadge({ state, color }: { state: string; color: string }) {
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{state}</Text>
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={s.hint}>{children}</Text>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85%", paddingHorizontal: 16, paddingTop: 8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  close: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  row: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { color: colors.dim, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  rowValue: {},
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  input: { backgroundColor: colors.bg, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  btnApprove: { backgroundColor: colors.ok },
  btnArchive: { backgroundColor: colors.btn },
  btnText: { color: "#000", fontSize: 16, fontWeight: "600" },
  hint: { color: colors.dim, fontSize: 12, marginTop: 6, lineHeight: 16 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
});
