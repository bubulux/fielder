import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { label as vocabLabel, STATE_ICONS, type ShotState } from "@fielder/vocab";
import { BORDER, FIXED, makeStyles, num, RADIUS, SIZE, type, useTheme } from "../theme";

/** Measured size of a view: `const [box, onLayout] = useLayoutSize()`; zero until the first layout. */
export function useLayoutSize(): [{ width: number; height: number }, (e: LayoutChangeEvent) => void] {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.width - width) < 0.5 && Math.abs(b.height - height) < 0.5 ? b : { width, height }));
  };
  return [box, onLayout];
}

/** Material Design Icons, same names as the dashboard (shared ones are in @fielder/vocab). */
export function Icon({ name, size = SIZE.icon, color }: { name: string; size?: number; color?: string }) {
  const { c } = useTheme();
  return <MaterialCommunityIcons name={name as ComponentProps<typeof MaterialCommunityIcons>["name"]} size={size} color={color ?? c.text} />;
}

interface SheetProps {
  visible: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  /** Right-hand head action; null hides it (confirm sheets). */
  doneLabel?: string | null;
  onDone?: () => void;
  /** Left-hand head action, e.g. "Cancel" when Done saves. */
  leadLabel?: string;
  onLead?: () => void;
  /** Fixed height as a share of the screen (0.7, 0.86 …); omitted = fits the content. */
  height?: number;
  /** Pinned under the content (Save, Done (n)). */
  footer?: ReactNode;
  /** false when the child scrolls itself (a FlatList). */
  scroll?: boolean;
}

/**
 * Bottom sheet for a single choice that returns you where you were: raised surface, strong top
 * edge, grab handle, the head pinned. Scrim tap and Android back close it. Max 560 dp wide.
 */
export function Sheet({ visible, title, sub, onClose, children, doneLabel = "Done", onDone, leadLabel, onLead, height, footer, scroll = true }: SheetProps) {
  const s = useStyles();
  const { width } = useWindowDimensions();
  const body = scroll
    ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody}>{children}</ScrollView>
    : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={s.sheetWrap}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { width: Math.min(width, 560) }, height ? { height: `${Math.round(height * 100)}%` } : { maxHeight: "92%" }]}>
          <View style={s.grab} />
          <View style={s.sheetHeader}>
            {leadLabel && (
              <Pressable onPress={onLead ?? onClose} style={({ pressed }) => [s.headBtn, pressed && s.headBtnPressed]} accessibilityRole="button">
                <Text style={s.headBtnText}>{leadLabel}</Text>
              </Pressable>
            )}
            <View style={{ flex: 1, paddingLeft: leadLabel ? 4 : 12 }}>
              <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
              {!!sub && <Text style={s.sheetSub} numberOfLines={1}>{sub}</Text>}
            </View>
            {doneLabel !== null && (
              <Pressable onPress={onDone ?? onClose} style={({ pressed }) => [s.headBtn, pressed && s.headBtnPressed]} accessibilityRole="button">
                <Text style={s.headBtnText}>{doneLabel}</Text>
              </Pressable>
            )}
          </View>
          {height ? <View style={{ flex: 1 }}>{body}</View> : body}
          {footer && <View style={s.sheetFooter}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

/** Rectangles of the Fielder mark on a 72-unit grid (same geometry as the app icon). */
const MARK_CORNERS = [
  [0, 0, 20, 12], [0, 12, 12, 8], [52, 0, 20, 12], [60, 12, 12, 8],
  [52, 60, 20, 12], [60, 52, 12, 8], [0, 60, 20, 12], [0, 52, 12, 8],
];

/** The Fielder mark: viewfinder corners in the text colour around the cinema frame in the accent. */
export function Mark({ size = 28 }: { size?: number }) {
  const { c } = useTheme();
  const k = size / 72;
  const box = (x: number, y: number, w: number, h: number, color: string, key: number) =>
    <View key={key} style={{ position: "absolute", left: x * k, top: y * k, width: w * k, height: h * k, backgroundColor: color }} />;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {MARK_CORNERS.map(([x, y, w, h], i) => box(x, y, w, h, c.text, i))}
      {box(18, 26, 36, 20, c.accent, 99)}
    </View>
  );
}

/** Uppercase section label (13 dp caps). */
export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  const s = useStyles();
  return <Text style={[s.section, color ? { color } : null]}>{children}</Text>;
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
export function Chip({ label, selected, onPress, danger, icon, swatch, disabled, block }: { label: string; selected?: boolean; onPress: () => void; danger?: boolean; icon?: string; /** A colour sample (e.g. frame colour). */ swatch?: string; disabled?: boolean; /** Fills its grid cell. */ block?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const fg = disabled ? c.textDisabled : selected ? c.onAccent : danger ? c.danger : c.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled }}
      style={({ pressed }) => [s.chip, block && s.chipBlock, danger && { borderColor: c.danger }, pressed && !selected && s.chipPressed, selected && s.chipSelected, disabled && s.chipDisabled]}>
      {selected && <Icon name="check" size={SIZE.iconSm} color={fg} />}
      {icon && <Icon name={icon} size={SIZE.iconSm} color={fg} />}
      {swatch && <View style={[s.swatch, { backgroundColor: swatch }]} />}
      <Text style={[s.chipText, selected && s.chipTextSelected, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.chipRow}>{children}</View>;
}

export interface SegOption<T extends string> { id: T; label?: string; icon?: string }

/** Segmented switch: one of a few, in a pill. `lg` = 50 dp; `block` stretches the options to the full width. */
export function Seg<T extends string>({ options, value, onChange, accessibilityLabel, size, block, disabled }: { options: readonly SegOption<T>[]; value: T | null; onChange: (v: T) => void; accessibilityLabel?: string; size?: "lg"; block?: boolean; disabled?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={[s.seg, block && s.segBlock]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={o.label ?? o.icon}
            hitSlop={size === "lg" ? 3 : 0}
            style={({ pressed }) => [s.segOpt, size === "lg" && s.segOptLg, block && { flex: 1 }, pressed && !on && { backgroundColor: c.surfaceSunken }, on && { backgroundColor: c.accent }]}>
            {o.icon && <Icon name={o.icon} size={SIZE.iconSm} color={on ? c.onAccent : disabled ? c.textDisabled : c.text} />}
            {o.label && <Text style={[s.segText, on && s.segTextOn, disabled && !on && { color: c.textDisabled }]} numberOfLines={1}>{o.label}</Text>}
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

export type ButtonKind = "primary" | "approve" | "archive" | "secondary" | "ghost" | "danger" | "dangerSolid";

/**
 * primary = accent, approve = green, archive = neutral grey, secondary/ghost = outlined,
 * danger = red outline, dangerSolid = red fill (inside a confirmation only). Disabled is dashed.
 */
export function Button({ label, onPress, kind = "primary", disabled, icon, busy, style, big }: { label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; icon?: string; busy?: boolean; style?: StyleProp<ViewStyle>; /** Fills its container's height (landscape action columns). */ big?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const outline = { bg: "transparent", pressed: c.surfaceSunken, border: c.border, fg: c.text };
  const look: Record<ButtonKind, { bg: string; pressed: string; border: string; fg: string }> = {
    primary: { bg: c.accent, pressed: c.accentPressed, border: c.accent, fg: c.onAccent },
    approve: { bg: c.ok, pressed: c.okHover, border: c.ok, fg: c.onOk },
    archive: { bg: c.archive, pressed: c.archiveHover, border: c.border, fg: c.onArchive },
    secondary: outline,
    ghost: outline,
    danger: { bg: "transparent", pressed: c.dangerTint, border: c.danger, fg: c.danger },
    dangerSolid: { bg: c.danger, pressed: c.dangerHover, border: c.danger, fg: c.onDanger },
  };
  const l = look[kind];
  const fg = disabled ? c.textDisabled : l.fg;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [s.btn, big && s.btnBig, { backgroundColor: pressed ? l.pressed : l.bg, borderColor: l.border }, pressed && { transform: [{ translateY: 1 }] }, disabled && s.btnDisabled, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={big ? 30 : 22} color={fg} /> : null}
      <Text style={[s.btnText, big && s.btnTextBig, { color: fg }]} numberOfLines={big ? 2 : 1}>{label}</Text>
    </Pressable>
  );
}

/** Square icon-only button (48 dp, 2 dp border) with an accessible name. */
export function IconButton({ icon, label, onPress, onLongPress, disabled, color, size = SIZE.touchMin, plain }: { icon: string; label: string; onPress: () => void; onLongPress?: () => void; disabled?: boolean; color?: string; size?: number; /** No border (header lead). */ plain?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [s.iconBtn, { width: size, height: size }, plain && { borderColor: "transparent", backgroundColor: "transparent" }, pressed && { backgroundColor: c.surfaceSunken }, disabled && { borderStyle: "dashed", borderColor: c.textDisabled }]}>
      <Icon name={icon} size={26} color={disabled ? c.textDisabled : color} />
    </Pressable>
  );
}

/** Review state: fill + icon + label (colours shared with the dashboard). */
export function StateMarker({ state, iconOnly, lg }: { state: ShotState; iconOnly?: boolean; lg?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const look = state === "approved" ? { bg: c.ok, fg: c.onOk, border: c.ok } : state === "archived" ? { bg: c.archive, fg: c.onArchive, border: c.border } : { bg: c.warn, fg: c.onWarn, border: c.onWarn };
  return (
    <View style={[s.state, lg && s.stateLg, { backgroundColor: look.bg, borderColor: look.border }, iconOnly && s.stateIcon]} accessibilityLabel={vocabLabel(state)}>
      <Icon name={STATE_ICONS[state]} size={lg ? 18 : 16} color={look.fg} />
      {!iconOnly && <Text style={[s.stateText, lg && { fontSize: 13 }, { color: look.fg }]}>{vocabLabel(state)}</Text>}
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

/** Solid black label over a photo ("Photo 2 / 5", "3 / 9"). */
export function PhotoTag({ children, big }: { children: ReactNode; big?: boolean }) {
  const s = useStyles();
  return <View style={[s.photoTag, big && { height: 36, paddingHorizontal: 12 }]}><Text style={[s.photoTagText, big && { fontSize: 17 }]}>{children}</Text></View>;
}

export function Hint({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <Text style={s.hint}>{children}</Text>;
}

/** The switch itself (drawn, so the off state keeps a visible border in sunlight). */
export function Switch({ value, disabled }: { value: boolean; disabled?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={[s.track, value && { backgroundColor: c.accent, borderColor: c.accent }, disabled && { borderStyle: "dashed", borderColor: c.textDisabled }]}>
      <View style={[s.knob, value ? { left: 25, backgroundColor: c.onAccent } : { left: 3, backgroundColor: disabled ? c.textDisabled : c.textDim }]}>
        {value && <Icon name="check" size={14} color={c.accent} />}
      </View>
    </View>
  );
}

/** A labelled on/off row; the whole row toggles. 64 dp with an optional icon and meta line. */
export function Toggle({ label, meta, icon, value, onChange, disabled }: { label: string; meta?: string; icon?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} disabled={disabled} style={({ pressed }) => [s.toggleRow, pressed && { backgroundColor: c.surfaceSunken }]} accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label}>
      {icon && <Icon name={icon} color={disabled ? c.textDisabled : c.text} />}
      <View style={{ flex: 1 }}>
        <Text style={[s.toggleLabel, disabled && { color: c.textDisabled }]}>{label}</Text>
        {!!meta && <Text style={s.listMeta}>{meta}</Text>}
      </View>
      <Switch value={value} disabled={disabled} />
    </Pressable>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return <View style={[s.check, checked && { backgroundColor: c.accent, borderColor: c.accent }]}>{checked && <Icon name="check-bold" size={18} color={c.onAccent} />}</View>;
}

/** 64 dp list row: icon, title, meta, trailing (chevron by default). Hub rows, pickers, rig list. */
export function ListRow({ icon, iconColor, title, meta, onPress, onLongPress, trailing, selected, disabled, titleColor }: { icon?: string; iconColor?: string; title: string; meta?: string; onPress?: () => void; onLongPress?: () => void; trailing?: ReactNode | null; selected?: boolean; disabled?: boolean; titleColor?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled || !onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled }}
      style={({ pressed }) => [s.listRow, selected && s.listRowOn, pressed && { backgroundColor: c.surfaceSunken }]}>
      {selected ? <Icon name="check" color={c.accent} /> : icon ? <Icon name={icon} color={iconColor ?? (disabled ? c.textDisabled : c.text)} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.listTitle, selected && s.listTitleOn, disabled && { color: c.textDisabled }, titleColor ? { color: titleColor } : null]} numberOfLines={2}>{title}</Text>
        {!!meta && <Text style={s.listMeta} numberOfLines={2}>{meta}</Text>}
      </View>
      {trailing === undefined ? (onPress ? <Icon name="chevron-right" /> : null) : trailing}
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
      {children && <View style={{ alignSelf: "stretch", gap: 8, marginTop: 8, alignItems: "center" }}>{children}</View>}
    </View>
  );
}

/** Loading placeholder block that pulses (no spinner). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.55, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v]);
  return <Animated.View style={[{ backgroundColor: c.surfaceSunken, borderRadius: RADIUS.sm, opacity: v }, style]} />;
}

export const useStyles = makeStyles((c) => ({
  sheetWrap: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surfaceRaised, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, borderTopWidth: BORDER.control, borderColor: c.borderStrong, elevation: 12, overflow: "hidden" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, borderTopWidth: BORDER.control, borderTopColor: c.border, backgroundColor: c.surfaceRaised, gap: 8 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: "center", marginTop: 10, marginBottom: 2 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8, minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  sheetTitle: { ...type("title", "bold"), color: c.text },
  sheetSub: { ...type("caption"), color: c.textDim, ...num },
  headBtn: { minWidth: 64, height: SIZE.touchMin, paddingHorizontal: 12, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  headBtnPressed: { backgroundColor: c.accentTint },
  headBtnText: { ...type("body", "bold"), color: c.accent },
  section: { ...type("overline", "bold"), color: c.textDim },
  row: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  rowLabel: { ...type("overline", "bold"), color: c.text, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: SIZE.touchMin, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surface },
  chipBlock: { flex: 1, justifyContent: "center" },
  chipPressed: { backgroundColor: c.surfaceSunken, borderColor: c.borderStrong },
  chipSelected: { backgroundColor: c.accent, borderColor: c.accent, paddingLeft: 12 },
  chipDisabled: { borderStyle: "dashed", borderColor: c.textDisabled, backgroundColor: "transparent" },
  chipText: { ...type("label", "medium"), color: c.text, flexShrink: 1 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.borderStrong },
  chipTextSelected: { fontFamily: type("label", "bold").fontFamily },
  seg: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 2, borderWidth: BORDER.control, borderColor: c.border, borderRadius: RADIUS.pill, backgroundColor: c.surface },
  segBlock: { alignSelf: "stretch" },
  segOpt: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 42, minWidth: 48, paddingHorizontal: 14, borderRadius: RADIUS.pill, justifyContent: "center" },
  segOptLg: { minHeight: 44 },
  segText: { ...type("label", "medium"), color: c.text },
  segTextOn: { fontFamily: type("label", "bold").fontFamily, color: c.onAccent },
  input: { ...type("body"), minHeight: SIZE.control, backgroundColor: c.surface, color: c.text, borderWidth: BORDER.control, borderColor: c.border, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 10 },
  inputFocused: { borderColor: c.accent },
  btn: { flexDirection: "row", gap: 8, minHeight: SIZE.control, paddingHorizontal: 16, borderRadius: RADIUS.sm, borderWidth: BORDER.control, alignItems: "center", justifyContent: "center" },
  btnBig: { flex: 1, flexDirection: "column", gap: 6 },
  btnDisabled: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: c.textDisabled },
  btnText: { ...type("body", "semibold"), flexShrink: 1 },
  btnTextBig: { ...type("title", "bold"), textAlign: "center" },
  iconBtn: { borderRadius: RADIUS.sm, borderWidth: BORDER.control, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  state: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", height: 26, paddingLeft: 6, paddingRight: 8, borderRadius: RADIUS.xs, borderWidth: 1.5 },
  stateLg: { height: 32, paddingLeft: 8, paddingRight: 10 },
  stateIcon: { width: 26, paddingLeft: 0, paddingRight: 0, justifyContent: "center", borderRadius: 13, borderColor: FIXED.black },
  stateText: { ...type("caption", "bold"), fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  seq: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", height: 26, paddingHorizontal: 8, borderRadius: RADIUS.xs, backgroundColor: FIXED.black, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  seqRec: { backgroundColor: FIXED.record, borderColor: FIXED.white, borderWidth: 2, height: 34, paddingHorizontal: 12, borderRadius: 6 },
  seqDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: FIXED.white },
  seqText: { ...type("caption", "heavy"), color: FIXED.white, letterSpacing: 0.5, ...num },
  photoTag: { height: 32, paddingHorizontal: 10, borderRadius: RADIUS.xs, backgroundColor: FIXED.black, alignItems: "center", justifyContent: "center" },
  photoTagText: { ...type("small", "heavy"), color: FIXED.white, ...num },
  hint: { ...type("caption"), color: c.textDim },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  toggleLabel: { ...type("body", "semibold"), color: c.text },
  track: { width: 52, height: 30, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surfaceSunken, justifyContent: "center" },
  knob: { position: "absolute", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  check: { width: 28, height: 28, borderRadius: RADIUS.xs + 2, borderWidth: BORDER.control, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  listRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  listRowOn: { backgroundColor: c.accentTint },
  listTitle: { ...type("body", "semibold"), color: c.text },
  listTitleOn: { fontFamily: type("body", "heavy").fontFamily },
  listMeta: { ...type("small"), color: c.textDim, ...num },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderWidth: BORDER.control, borderRadius: RADIUS.sm },
  bannerTitle: { ...type("small", "bold"), color: c.text },
  bannerMeta: { ...type("caption"), color: c.textDim },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, borderWidth: BORDER.control, borderColor: c.border, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { ...type("title", "bold"), color: c.text, textAlign: "center" },
  emptyBody: { ...type("small"), color: c.textDim, textAlign: "center", maxWidth: 340 },
}));
