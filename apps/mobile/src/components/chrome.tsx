import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useApp } from "../appState";
import { useSync, type Sync, type SyncState } from "../sync";
import { BORDER, FIXED, makeStyles, num, RADIUS, SIZE, type, useTheme, type Palette } from "../theme";
import { Icon, IconButton } from "./ui";

interface HeadAction { icon: string; label: string; onPress: () => void }

/**
 * 64 dp header on every screen but Shoot. Without a title: the project pill (tap = Project sheet;
 * warn fill "Pick a project" when none) and the sync icon (tap = Uploads). With a title: a lead
 * action (back/close), title + sub, an optional trailing action. The offline banner pins under it.
 */
export function AppHeader({ title, sub, lead, trail, sync = true, offlineMeta }: { title?: string; sub?: string; lead?: HeadAction; trail?: HeadAction; sync?: boolean; /** Offline banner text; the banner shows whenever the server is unreachable. */ offlineMeta?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  const app = useApp();
  const st = useSync();
  const none = !app.project;
  return (
    <View>
      <View style={s.header}>
        {lead && <IconButton plain icon={lead.icon} label={lead.label} onPress={lead.onPress} />}
        {title ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            {!!sub && <Text style={s.sub} numberOfLines={1}>{sub}</Text>}
          </View>
        ) : (
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
            <Pressable onPress={app.openProjectSheet} accessibilityRole="button" accessibilityLabel={none ? "Pick a project" : `Project ${app.project?.name}, tap to switch`}
              style={({ pressed }) => [s.pill, none && { backgroundColor: c.warn, borderColor: c.warn }, pressed && !none && { backgroundColor: c.surfaceSunken }]}>
              <Icon name={none ? "folder-alert-outline" : "folder-outline"} size={22} color={none ? c.onWarn : c.text} />
              <Text style={[s.pillText, none && { color: c.onWarn }]} numberOfLines={1}>{app.project?.name ?? "Pick a project"}</Text>
              <Icon name="chevron-down" size={22} color={none ? c.onWarn : c.text} />
            </Pressable>
          </View>
        )}
        {trail && <IconButton icon={trail.icon} label={trail.label} onPress={trail.onPress} />}
        {sync && <SyncIcon sync={st} onPress={() => app.push({ name: "uploads" })} />}
      </View>
      {!st.online && <OfflineBanner meta={offlineMeta} />}
    </View>
  );
}

/**
 * A pushed full screen: header with back (Android back pops too), a scrolling body, and an
 * optional footer pinned at the thumb with the nav-bar clearance.
 */
export function PushScreen({ title, sub, trail, children, footer, scroll = true, lead, sync = false, offlineMeta }: { title: string; sub?: string; trail?: HeadAction; children: ReactNode; footer?: ReactNode; scroll?: boolean; lead?: HeadAction; sync?: boolean; offlineMeta?: string }) {
  const s = useStyles();
  const app = useApp();
  return (
    <View style={s.screen}>
      <AppHeader title={title} sub={sub} lead={lead ?? { icon: "arrow-left", label: "Back", onPress: app.pop }} trail={trail} sync={sync} offlineMeta={offlineMeta} />
      {scroll
        ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: footer ? 16 : SIZE.edgePad }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        : <View style={{ flex: 1 }}>{children}</View>}
      {footer && <ActionBar edge>{footer}</ActionBar>}
    </View>
  );
}

/** Padded block inside a screen (16 dp sides). */
export function Block({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }, style]}>{children}</View>;
}

export function OfflineBanner({ meta }: { meta?: string }) {
  const s = useStyles();
  return (
    <View style={s.offline} accessibilityRole="alert">
      <Icon name="cloud-off-outline" size={22} />
      <View style={{ flex: 1 }}>
        <Text style={s.offlineTitle}>Offline</Text>
        <Text style={s.offlineMeta}>{meta ?? "The server can't be reached. Captures queue on the phone."}</Text>
      </View>
    </View>
  );
}

const SYNC: Record<SyncState, { icon: string; color: (c: Palette) => string; tint: (c: Palette) => string }> = {
  ok: { icon: "cloud-check-outline", color: (c) => c.ok, tint: (c) => c.okTint },
  pending: { icon: "cloud-upload-outline", color: (c) => c.warnInk, tint: (c) => c.warnTint },
  uploading: { icon: "cloud-sync-outline", color: (c) => c.accent, tint: (c) => c.accentTint },
  stuck: { icon: "cloud-alert", color: (c) => c.danger, tint: (c) => c.dangerTint },
  offline: { icon: "cloud-off-outline", color: (c) => c.textDim, tint: (c) => c.surfaceSunken },
};

export function syncLabel(v: Sync): { label: string; meta: string } {
  const n = v.state === "stuck" ? v.stuck : v.pending;
  switch (v.state) {
    case "ok": return { label: "All on the server", meta: "Nothing waiting on this phone" };
    case "pending": return { label: `${n} waiting to upload`, meta: "Uploads at the next capture, sign-in or retry" };
    case "uploading": return { label: `Uploading ${n}…`, meta: "Keep the app open" };
    case "stuck": return { label: `${n} stuck`, meta: "Rejected 3 times · retry or discard" };
    case "offline": return { label: n ? `Offline · ${n} waiting` : "Offline", meta: "Uploads resume when the connection is back" };
  }
}

/** The header's 48 dp sync button: icon by state, count badge (red when stuck). */
export function SyncIcon({ sync, onPress }: { sync: Sync; onPress: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const look = SYNC[sync.state];
  const n = sync.state === "stuck" ? sync.stuck : sync.pending;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${syncLabel(sync).label}. Open uploads`}
      style={({ pressed }) => [s.syncBtn, sync.state === "stuck" && { borderColor: c.danger }, pressed && { backgroundColor: c.surfaceSunken }]}>
      <Icon name={look.icon} size={26} color={look.color(c)} />
      {n > 0 && sync.state !== "ok" && <Badge n={n} stuck={sync.state === "stuck"} accent={sync.state === "uploading"} />}
    </Pressable>
  );
}

/** Count badge on a control; warn fill, red when something is stuck. */
export function Badge({ n, stuck, accent }: { n: number; stuck?: boolean; accent?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Text style={[s.badge, stuck ? { backgroundColor: FIXED.record, color: FIXED.white } : accent ? { backgroundColor: c.accent, color: c.onAccent } : null]}>{n}</Text>
  );
}

/** The 72 dp status card at the top of the Setup hub. */
export function SyncCard({ sync, onPress }: { sync: Sync; onPress: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const look = SYNC[sync.state];
  const { label, meta } = syncLabel(sync);
  const edge = sync.state === "stuck" ? c.danger : c.border;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. Open uploads`}
      style={({ pressed }) => [s.card, { borderColor: edge, backgroundColor: look.tint(c) }, pressed && { transform: [{ translateY: 1 }] }]}>
      <View style={[s.cardIcon, { borderColor: edge }]}><Icon name={look.icon} color={look.color(c)} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.cardLabel}>{label}</Text>
        <Text style={s.cardMeta}>{meta}</Text>
      </View>
      <Icon name="chevron-right" />
    </Pressable>
  );
}

/**
 * A tag or setting as a 64 dp row: label (dim) over the value (bold; "Not set" when empty),
 * an optional LAST tag (kept from the last capture), an error line, a chevron. Groups get
 * chevron-down/up and indent their children 20 dp per level.
 */
export function FieldRow({ icon, label, value, placeholder = "Not set", remembered, error, group, open, depth = 0, onPress, trailing }: { icon?: string; label: string; value: string | null | undefined; placeholder?: string; remembered?: boolean; error?: string | null; group?: boolean; open?: boolean; depth?: number; onPress: () => void; trailing?: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  const empty = !value;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${empty ? placeholder : value}`} accessibilityState={group ? { expanded: !!open } : undefined}
      style={({ pressed }) => [s.field, { paddingLeft: 16 + depth * 20 }, pressed && { backgroundColor: c.surfaceSunken }]}>
      <View style={{ width: 24, alignItems: "center" }}>{icon && <Icon name={icon} color={error ? c.danger : c.text} />}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={[s.fieldValue, empty && s.fieldEmpty]} numberOfLines={2}>{empty ? placeholder : value}</Text>
        {!!error && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="alert-circle" size={16} color={c.danger} />
            <Text style={s.fieldError}>{error}</Text>
          </View>
        )}
      </View>
      {remembered && !empty && (
        <View style={s.last} accessibilityLabel="Kept from the last capture">
          <Icon name="history" size={14} color={c.textDim} />
          <Text style={s.lastText}>LAST</Text>
        </View>
      )}
      {trailing ?? <Icon name={group ? (open ? "chevron-up" : "chevron-down") : "chevron-right"} />}
    </Pressable>
  );
}

/**
 * Decisions pinned in the thumb zone: a bar above the tab bar (or the screen edge when there is
 * none), 2 dp top border. `edge` adds the 32 dp nav-bar clearance of screens without a tab bar.
 */
export function ActionBar({ children, edge, column, style }: { children: ReactNode; edge?: boolean; /** Landscape: a right-hand column. */ column?: boolean; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return <View style={[column ? s.actionColumn : s.actionBar, edge && (column ? { paddingRight: SIZE.edgePad } : { paddingBottom: SIZE.edgePad }), style]}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  header: { height: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: c.surface, borderBottomWidth: BORDER.control, borderBottomColor: c.borderSubtle },
  title: { ...type("title", "bold"), color: c.text },
  sub: { ...type("small"), color: c.textDim, ...num },
  pill: { maxWidth: "100%", height: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 12, borderRadius: RADIUS.pill, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surface },
  pillText: { ...type("body", "bold"), color: c.text, flexShrink: 1 },
  syncBtn: { width: 48, height: 48, borderRadius: RADIUS.sm, borderWidth: BORDER.control, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -8, right: -8, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, overflow: "hidden", backgroundColor: c.warn, color: c.onWarn, textAlign: "center", ...type("caption", "heavy"), fontSize: 12, lineHeight: 22, borderWidth: 2, borderColor: c.surface },
  offline: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.archive, borderBottomWidth: BORDER.control, borderBottomColor: c.borderStrong },
  offlineTitle: { ...type("small", "bold"), color: c.text },
  offlineMeta: { ...type("caption"), color: c.text },
  card: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: BORDER.control },
  cardIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: BORDER.control, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  cardLabel: { ...type("body", "bold"), color: c.text },
  cardMeta: { ...type("small"), color: c.textDim },
  field: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8, paddingRight: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  fieldLabel: { ...type("small", "semibold"), fontSize: 14, color: c.textDim },
  fieldValue: { ...type("body", "bold"), color: c.text },
  fieldEmpty: { fontFamily: type("body").fontFamily, color: c.textDim },
  fieldError: { ...type("small", "semibold"), fontSize: 14, color: c.danger, flexShrink: 1 },
  last: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingHorizontal: 8, borderRadius: RADIUS.xs, borderWidth: 1.5, borderColor: c.border },
  lastText: { ...type("caption", "bold"), fontSize: 12, letterSpacing: 0.7, color: c.textDim },
  actionBar: { flexDirection: "row", gap: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surface, borderTopWidth: BORDER.control, borderTopColor: c.border },
  actionColumn: { width: 148, gap: 8, paddingVertical: 16, paddingHorizontal: 12, backgroundColor: c.surface, borderLeftWidth: BORDER.control, borderLeftColor: c.border },
}));
