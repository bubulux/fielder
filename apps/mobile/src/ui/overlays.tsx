/** Overlays from the design system: the bottom sheet every picker and confirmation is built on. */
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";
import { Input } from "./forms";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useStyles } from "./styles";

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

/** Rows that run edge to edge inside a Sheet (cancels the sheet body's padding; `flushTop` also its top gap). */
export function SheetList({ flushTop = true, children }: { flushTop?: boolean; children: ReactNode }) {
  return <View style={flushTop ? { marginHorizontal: -20, marginTop: -12 } : { marginHorizontal: -20 }}>{children}</View>;
}

/** The search field pinned above a sheet's list. */
export function SheetSearch(props: TextInputProps) {
  const s = useStyles();
  return <View style={s.sheetSearch}><Input {...props} /></View>;
}
