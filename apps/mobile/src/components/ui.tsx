import { useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { label as vocabLabel, STATE_ICONS, type ShotState } from "@fielder/vocab";
import { BORDER, FIXED, makeStyles, num, RADIUS, SIZE, type, useTheme } from "../theme";

/** Material Design Icons, same names as the dashboard (shared ones are in @fielder/vocab). */
export function Icon({ name, size = SIZE.icon, color }: { name: string; size?: number; color?: string }) {
  const { c } = useTheme();
  return <MaterialCommunityIcons name={name as ComponentProps<typeof MaterialCommunityIcons>["name"]} size={size} color={color ?? c.text} />;
}

/** Bottom sheet: raised surface with a strong top edge, a grab handle and a big "Done". */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const s = useStyles();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={s.sheet}>
        <View style={s.grab} />
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [s.done, pressed && s.donePressed]} accessibilityRole="button"><Text style={s.doneText}>Done</Text></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Screen top bar: optional back action, title (+ subtitle), optional trailing element. */
export function Header({ title, sub, onBack, backLabel, right }: { title: string; sub?: string; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.header}>
      {onBack && (
        <Pressable onPress={onBack} style={({ pressed }) => [s.back, pressed && { backgroundColor: c.surfaceSunken }]} hitSlop={4} accessibilityRole="button" accessibilityLabel={backLabel ?? "Back"}>
          <Icon name="chevron-left" size={28} />
          {backLabel && <Text style={s.backText}>{backLabel}</Text>}
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={s.headerSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Row({ label, children }: { label: string; children?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

/** Pill for choosing. Selected = accent fill + bold + check, so it never relies on colour alone. */
export function Chip({ label, selected, onPress, danger, icon, swatch, disabled }: { label: string; selected?: boolean; onPress: () => void; danger?: boolean; icon?: string; /** A colour sample (e.g. frame colour). */ swatch?: string; disabled?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const fg = disabled ? c.textDisabled : selected ? c.onAccent : danger ? c.danger : c.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled }}
      style={({ pressed }) => [s.chip, danger && { borderColor: c.danger }, pressed && !selected && s.chipPressed, selected && s.chipSelected, disabled && s.chipDisabled]}>
      {selected && <Icon name="check" size={SIZE.iconSm} color={fg} />}
      {icon && <Icon name={icon} size={SIZE.iconSm} color={fg} />}
      {swatch && <View style={[s.swatch, { backgroundColor: swatch }]} />}
      <Text style={[s.chipText, selected && s.chipTextSelected, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.chipRow}>{children}</View>;
}

export interface SegOption<T extends string> { id: T; label?: string; icon?: string }

/** Segmented switch: one of a few, in a pill. */
export function Seg<T extends string>({ options, value, onChange, accessibilityLabel }: { options: readonly SegOption<T>[]; value: T; onChange: (v: T) => void; accessibilityLabel?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.seg} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label ?? o.icon}
            style={({ pressed }) => [s.segOpt, pressed && !on && { backgroundColor: c.surfaceSunken }, on && { backgroundColor: c.accent }]}>
            {o.icon && <Icon name={o.icon} size={SIZE.iconSm} color={on ? c.onAccent : c.text} />}
            {o.label && <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput placeholderTextColor={c.textDim} selectionColor={c.accent} {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[s.input, focused && s.inputFocused, props.style]} />
  );
}

type ButtonKind = "primary" | "approve" | "archive" | "ghost" | "danger";

/** primary = accent, approve = green, archive = neutral grey, ghost = outlined, danger = red outline. Disabled is dashed. */
export function Button({ label, onPress, kind = "primary", disabled, icon, busy, style }: { label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; icon?: string; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  const { c } = useTheme();
  const look: Record<ButtonKind, { bg: string; pressed: string; border: string; fg: string }> = {
    primary: { bg: c.accent, pressed: c.accentPressed, border: c.accent, fg: c.onAccent },
    approve: { bg: c.ok, pressed: c.okHover, border: c.ok, fg: c.onOk },
    archive: { bg: c.archive, pressed: c.archiveHover, border: c.border, fg: c.onArchive },
    ghost: { bg: "transparent", pressed: c.surfaceSunken, border: c.border, fg: c.text },
    danger: { bg: "transparent", pressed: c.dangerTint, border: c.danger, fg: c.danger },
  };
  const l = look[kind];
  const fg = disabled ? c.textDisabled : l.fg;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [s.btn, { backgroundColor: pressed ? l.pressed : l.bg, borderColor: l.border }, pressed && { transform: [{ translateY: 1 }] }, disabled && s.btnDisabled, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={22} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Round icon-only button with an accessible name. */
export function IconButton({ icon, label, onPress, disabled, color }: { icon: string; label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: c.surfaceSunken }, disabled && { borderStyle: "dashed", borderColor: c.textDisabled }]}>
      <Icon name={icon} color={disabled ? c.textDisabled : color} />
    </Pressable>
  );
}

/** Review state: fill + icon + label (colours shared with the dashboard). */
export function StateMarker({ state, iconOnly }: { state: ShotState; iconOnly?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const look = state === "approved" ? { bg: c.ok, fg: c.onOk, border: c.ok } : state === "archived" ? { bg: c.archive, fg: c.onArchive, border: c.border } : { bg: c.warn, fg: c.onWarn, border: c.onWarn };
  return (
    <View style={[s.state, { backgroundColor: look.bg, borderColor: look.border }, iconOnly && s.stateIcon]} accessibilityLabel={vocabLabel(state)}>
      <Icon name={STATE_ICONS[state]} size={16} color={look.fg} />
      {!iconOnly && <Text style={[s.stateText, { color: look.fg }]}>{vocabLabel(state)}</Text>}
    </View>
  );
}

/** "SEQ · n": solid black over photos; red with a dot while recording. */
export function SeqBadge({ count, recording }: { count: number; recording?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.seq, recording && s.seqRec]} accessibilityLabel={`${count} photos in sequence`}>
      {recording ? <View style={s.seqDot} /> : <Icon name="layers-triple" size={15} color={FIXED.white} />}
      <Text style={[s.seqText, recording && { fontSize: 15 }]}>SEQ · {count}</Text>
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <Text style={s.hint}>{children}</Text>;
}

/** A labelled on/off switch (drawn, so the off state keeps a visible border in sunlight). */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={s.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={[s.track, value && { backgroundColor: c.accent, borderColor: c.accent }]}>
        <View style={[s.knob, value ? { left: 25, backgroundColor: c.onAccent } : { left: 3, backgroundColor: c.textDim }]}>
          {value && <Icon name="check" size={14} color={c.accent} />}
        </View>
      </View>
    </Pressable>
  );
}

type BannerKind = "offline" | "info" | "ok" | "warn" | "danger";

/** Full-width status strip: tinted fill + state border + icon + text. */
export function Banner({ kind, title, meta, icon, action }: { kind: BannerKind; title: string; meta?: string; icon?: string; action?: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  const look: Record<BannerKind, { bg: string; border: string; icon: string; iconColor: string }> = {
    offline: { bg: c.archive, border: c.borderStrong, icon: "cloud-off-outline", iconColor: c.text },
    info: { bg: c.accentTint, border: c.accent, icon: "cloud-upload-outline", iconColor: c.accent },
    ok: { bg: c.okTint, border: c.ok, icon: "check-circle", iconColor: c.ok },
    warn: { bg: c.warnTint, border: c.warn, icon: "alert", iconColor: c.warnInk },
    danger: { bg: c.dangerTint, border: c.danger, icon: "alert-circle", iconColor: c.danger },
  };
  const l = look[kind];
  return (
    <View style={[s.banner, { backgroundColor: l.bg, borderColor: l.border }]} accessibilityRole={kind === "danger" ? "alert" : undefined}>
      <Icon name={icon ?? l.icon} color={l.iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={s.bannerTitle}>{title}</Text>
        {!!meta && <Text style={s.bannerMeta}>{meta}</Text>}
      </View>
      {action}
    </View>
  );
}

/** Whole-screen empty / error / loading message. */
export function Empty({ icon = "image-off-outline", title, body, loading, children }: { icon?: string; title: string; body?: string; loading?: boolean; children?: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>{loading ? <ActivityIndicator color={c.text} /> : <Icon name={icon} size={28} />}</View>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!body && <Text style={s.emptyBody}>{body}</Text>}
      {children}
    </View>
  );
}

export const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surfaceRaised, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, borderTopWidth: BORDER.control, borderColor: c.borderStrong, maxHeight: "88%", elevation: 12 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: "center", marginTop: 10, marginBottom: 2 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingLeft: 20, paddingRight: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  sheetTitle: { ...type("title", "bold"), color: c.text, flex: 1 },
  done: { minWidth: 72, height: SIZE.touchMin, paddingHorizontal: 14, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  donePressed: { backgroundColor: c.accentTint },
  doneText: { ...type("body", "bold"), color: c.accent },
  header: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 60, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.surface, borderBottomWidth: BORDER.control, borderBottomColor: c.border },
  back: { flexDirection: "row", alignItems: "center", minHeight: SIZE.touchMin, minWidth: SIZE.touchMin, paddingRight: 8, borderRadius: RADIUS.sm },
  backText: { ...type("label", "semibold"), color: c.text },
  headerTitle: { ...type("title", "bold"), color: c.text },
  headerSub: { ...type("caption"), color: c.textDim },
  row: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  rowLabel: { ...type("overline", "bold"), color: c.text, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: SIZE.touchMin, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surface },
  chipPressed: { backgroundColor: c.surfaceSunken, borderColor: c.borderStrong },
  chipSelected: { backgroundColor: c.accent, borderColor: c.accent, paddingLeft: 12 },
  chipDisabled: { borderStyle: "dashed", borderColor: c.textDisabled, backgroundColor: "transparent" },
  chipText: { ...type("label", "medium"), color: c.text },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.borderStrong },
  chipTextSelected: { fontFamily: type("label", "bold").fontFamily },
  seg: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 2, borderWidth: BORDER.control, borderColor: c.border, borderRadius: RADIUS.pill, backgroundColor: c.surface },
  segOpt: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 42, minWidth: 48, paddingHorizontal: 14, borderRadius: RADIUS.pill, justifyContent: "center" },
  segText: { ...type("label", "medium"), color: c.text },
  segTextOn: { fontFamily: type("label", "bold").fontFamily, color: c.onAccent },
  input: { ...type("body"), minHeight: SIZE.control, backgroundColor: c.surface, color: c.text, borderWidth: BORDER.control, borderColor: c.border, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 10 },
  inputFocused: { borderColor: c.accent },
  btn: { flexDirection: "row", gap: 8, minHeight: SIZE.control, paddingHorizontal: 18, borderRadius: RADIUS.sm, borderWidth: BORDER.control, alignItems: "center", justifyContent: "center", marginTop: 12 },
  btnDisabled: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: c.textDisabled },
  btnText: { ...type("body", "semibold") },
  iconBtn: { width: SIZE.touchMin, height: SIZE.touchMin, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  state: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", height: 26, paddingLeft: 6, paddingRight: 8, borderRadius: RADIUS.xs, borderWidth: 1.5 },
  stateIcon: { width: 26, paddingLeft: 0, paddingRight: 0, justifyContent: "center", borderRadius: 13, borderColor: FIXED.black },
  stateText: { ...type("caption", "bold"), fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  seq: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", height: 26, paddingHorizontal: 8, borderRadius: RADIUS.xs, backgroundColor: FIXED.black, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  seqRec: { backgroundColor: FIXED.record, borderColor: FIXED.white, borderWidth: 2, height: 34, paddingHorizontal: 12, borderRadius: 6 },
  seqDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: FIXED.white },
  seqText: { ...type("caption", "heavy"), color: FIXED.white, letterSpacing: 0.5, ...num },
  hint: { ...type("caption"), color: c.textDim },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: SIZE.touchMin },
  toggleLabel: { ...type("body"), color: c.text, flex: 1 },
  track: { width: 52, height: 30, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surfaceSunken, justifyContent: "center" },
  knob: { position: "absolute", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderWidth: BORDER.control, borderRadius: RADIUS.sm },
  bannerTitle: { ...type("small", "bold"), color: c.text },
  bannerMeta: { ...type("caption"), color: c.textDim },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, borderWidth: BORDER.control, borderColor: c.border, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { ...type("title", "bold"), color: c.text, textAlign: "center" },
  emptyBody: { ...type("small"), color: c.textDim, textAlign: "center", maxWidth: 340 },
}));
