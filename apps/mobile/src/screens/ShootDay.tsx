import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayLight, lightLabel, localDay, PHASE_ICONS, shootableWindows, type DayLight, type Interval } from "@fielder/vocab";
import { api, cover, type Shot, type ShootingDay } from "../api";
import { offlineDays, removeOfflineDay, saveDayOffline, type OfflineDay } from "../offline";
import { FrameModeSeg, imageAspect, frameOf, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { Banner, Button, Chip, Empty, Header, Icon, IconButton, SeqBadge, Sheet } from "../components/ui";
import { makeStyles, num, RADIUS, type, useTheme, type Palette } from "../theme";
import type { ProjectEntry, Settings } from "../types";
import { placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

interface Props { settings: Settings; data: ReturnType<typeof useShots>; project: ProjectEntry | null }

const NAV = 88;
const BERLIN = { lat: 52.52, lon: 13.405 };
const phaseFill = (c: Palette, phase: string) => (phase === "dawn" ? c.phaseDawn : phase === "day" ? c.phaseDay : phase === "dusk" ? c.phaseDusk : c.phaseNight);
const phaseInk = (c: Palette, phase: string) => (phase === "dawn" ? c.onPhaseDawn : phase === "day" ? c.onPhaseDay : phase === "dusk" ? c.onPhaseDusk : c.onPhaseNight);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const windowsText = (w: Interval[]) => (w.length ? w.map((x) => `${hhmm(x.start)}–${hhmm(x.end)}`).join(", ") : "light not on this day");
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function centroid(shots: Shot[]) {
  if (shots.length === 0) return BERLIN;
  const ps = shots.map(cover);
  return { lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length };
}

/**
 * Shooting day mode: the days planned in the dashboard for the active project. Pick a day, see
 * its light, then step through its shots in order with big prev/next buttons (phone mounted on
 * the camera). A day can be saved offline; it then works without any connection.
 */
export function ShootDay({ settings, data, project }: Props) {
  const p = useStyles();
  const { c } = useTheme();
  const [days, setDays] = useState<ShootingDay[] | null>(null);
  const [offline, setOffline] = useState<OfflineDay[]>(() => offlineDays());
  const [online, setOnline] = useState(true);
  const [dayId, setDayId] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project) return;
    try { setDays(await api.listDays(project.id)); setOnline(true); } catch { setOnline(false); setDays(null); }
  }, [project?.id]);
  useEffect(() => { setDayId(null); setStep(null); void load(); }, [load]);

  const mine = offline.filter((o) => o.day.project_id === project?.id);
  // Online: the server's days. Offline: whatever was saved on the phone.
  const list: ShootingDay[] = online && days ? days : mine.map((o) => o.day);
  const saved = (id: string) => mine.find((o) => o.day.id === id) ?? null;

  const day = list.find((d) => d.id === dayId) ?? null;
  // Fresh shots when online, the saved copy otherwise.
  const shotsFor = (d: ShootingDay): Shot[] => {
    const pool = online && data.shots ? data.shots : saved(d.id)?.shots ?? [];
    return d.shots.map((ds) => pool.find((s) => s.id === ds.shot_id)).filter((s): s is Shot => !!s);
  };

  async function makeOffline(d: ShootingDay) {
    if (!project) return;
    const shots = shotsFor(d);
    try {
      setBusy(`${d.id}:0/${shots.reduce((n, s) => n + s.photos.length, 0)}`);
      await saveDayOffline(d, data.shots ?? shots, project.name, (done, total) => setBusy(`${d.id}:${done}/${total}`));
      setOffline(offlineDays());
    } catch (e) {
      Alert.alert("Could not save the day offline", e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }
  function dropOffline(d: ShootingDay) {
    Alert.alert("Remove offline copy", "The photos of this day are deleted from the phone. The plan stays on the server.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removeOfflineDay(d.id); setOffline(offlineDays()); } },
    ]);
  }

  if (!project) return <View style={p.root}><Empty icon="folder-alert-outline" title="No project" body="Choose a project first (Setup → Project)." /></View>;
  if (online && !days) return <View style={p.root}><Empty loading title="Loading shooting days…" /></View>;

  if (!day) {
    const today = todayIso();
    return (
      <View style={p.root}>
        <Header title="Shooting days" sub={project.name} />
        {!online && <View style={{ padding: 12, paddingBottom: 0 }}><Banner kind="offline" title="Offline" meta="Showing the days saved on this phone" /></View>}
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          onRefresh={() => void load()}
          refreshing={false}
          ListEmptyComponent={<Empty icon="calendar-blank-outline" title={online ? "No shooting days yet" : "Nothing saved offline"} body={online ? "Plan them in the dashboard's Schedule tab." : "Make a day available offline while you have a connection."} />}
          renderItem={({ item }) => {
            const s = saved(item.id);
            const stale = s && item.updated_at && s.day.updated_at !== item.updated_at;
            const progress = busy?.startsWith(`${item.id}:`) ? busy.split(":")[1] : null;
            return (
              <View style={[p.dayRow, item.date === today && p.dayToday]}>
                <Pressable onPress={() => { setDayId(item.id); setStep(null); }} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56 }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={[p.dayName, item.date < today && { color: c.textDim }]}>{dateLabel(item.date)}{item.date === today ? " · today" : ""}</Text>
                    {!!item.title && <Text style={p.daySub}>{item.title}</Text>}
                    <Text style={[p.daySub, num]}>{item.shots.length} shot{item.shots.length === 1 ? "" : "s"}{s ? ` · offline${stale ? " (plan changed)" : ""}` : ""}</Text>
                  </View>
                  <Icon name="chevron-right" />
                </Pressable>
                {online && (progress ? <Text style={p.progress}>{progress}</Text>
                  : s && !stale ? <Chip icon="cloud-check-outline" label="Offline" selected onPress={() => dropOffline(item)} />
                  : <Chip icon="cloud-download-outline" label={stale ? "Update offline" : "Make offline"} onPress={() => void makeOffline(item)} />)}
              </View>
            );
          }}
        />
      </View>
    );
  }

  const shots = shotsFor(day);
  if (step !== null && shots.length) {
    return <StepThrough settings={settings} day={day} shots={shots} index={Math.min(step, shots.length - 1)} onIndex={setStep} onBack={() => setStep(null)} />;
  }
  return <DayOverview day={day} shots={shots} online={online} onBack={() => setDayId(null)} onStart={(i) => setStep(i)} settings={settings} />;
}

function useDayLight(day: ShootingDay, shots: Shot[]): { light: DayLight; start: Date; hours: number } {
  return useMemo(() => {
    const where = centroid(shots);
    const { start, hours } = localDay(day.date);
    return { light: dayLight(start, where.lat, where.lon, hours), start, hours };
  }, [day.date, shots.map((s) => s.id).join()]);
}

function DayOverview({ day, shots, online, onBack, onStart, settings }: { day: ShootingDay; shots: Shot[]; online: boolean; onBack: () => void; onStart: (i: number) => void; settings: Settings }) {
  const p = useStyles();
  const { c } = useTheme();
  const { light, start, hours } = useDayLight(day, shots);
  const now = new Date();
  const current = light.phases.find((ph) => now >= ph.start && now < ph.end && day.date === todayIso());
  const plannedOf = (id: string) => day.shots.find((x) => x.shot_id === id)?.planned_time ?? null;
  let lastLocation = "";
  return (
    <View style={p.root}>
      <Header title={dateLabel(day.date)} sub={[day.title, `${shots.length} shot${shots.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} onBack={onBack} backLabel="Days" />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 10 }}>
        {!online && <Banner kind="offline" title="Offline copy" meta="Saved on this phone" />}
        <View style={p.lightBox}>
          <View style={p.bar24}>
            {light.phases.map((ph) => {
              const w = pct(ph.end, start, hours) - pct(ph.start, start, hours);
              return (
                <View key={ph.start.toISOString()} style={[p.seg, { left: `${pct(ph.start, start, hours)}%`, width: `${w}%`, backgroundColor: phaseFill(c, ph.phase) }]}>
                  {w > 7 && <Icon name={PHASE_ICONS[ph.phase]} size={16} color={phaseInk(c, ph.phase)} />}
                </View>
              );
            })}
            {day.date === todayIso() && <View style={[p.nowMark, { left: `${pct(now, start, hours)}%` }]} />}
          </View>
          {current && <Text style={p.now}>Now: {current.phase} until {hhmm(current.end)}</Text>}
          <Text style={[p.lightText, num]}>
            {light.sunrise ? `Sunrise ${hhmm(light.sunrise)}` : ""}{light.sunset ? ` · Sunset ${hhmm(light.sunset)}` : ""}
          </Text>
          <Text style={[p.lightText, num]}>{light.phases.filter((ph) => ph.phase === "dawn" || ph.phase === "dusk").map((ph) => `${cap(ph.phase)} ${hhmm(ph.start)}–${hhmm(ph.end)}`).join(" · ")}</Text>
          {!!day.notes && <Text style={p.notes}>{day.notes}</Text>}
        </View>
        {shots.length === 0 && <Empty icon="image-off-outline" title="No shots on this day" />}
        {shots.map((s, i) => {
          const loc = placeLabel(s) || "No location";
          const header = loc !== lastLocation ? loc : null;
          lastLocation = loc;
          const w = shootableWindows(light, s.light);
          const planned = plannedOf(s.id);
          return (
            <View key={s.id}>
              {header && <View style={p.locHeader}><Icon name="map-marker-outline" size={20} /><Text style={p.locHeaderText}>{header}</Text></View>}
              <Pressable onPress={() => onStart(i)} style={({ pressed }) => [p.shotRow, pressed && { backgroundColor: c.surfaceSunken }]} accessibilityRole="button">
                <ShotFrame photo={cover(s)} width={110} settings={settings} mode="fit" style={{ borderRadius: RADIUS.xs }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={p.shotName} numberOfLines={1}>{i + 1}. {shotTitle(s)}</Text>
                  {!!planned && <Text style={[p.planned, num]}>Planned {planned}</Text>}
                  <Text style={[p.daySub, num]}>{lightLabel(s.light, s.artificial) || "Any light"} · {windowsText(w)}</Text>
                  {s.photos.length > 1 && <SeqBadge count={s.photos.length} />}
                </View>
                <Icon name="chevron-right" />
              </Pressable>
            </View>
          );
        })}
        {shots.length > 0 && <Button label="Start from the first shot" icon="play" onPress={() => onStart(0)} />}
      </ScrollView>
    </View>
  );
}

const pct = (d: Date, start: Date, hours: number) => Math.max(0, Math.min(100, ((d.getTime() - start.getTime()) / (hours * 3_600_000)) * 100));

/** Big-button stepping through the day's shots (the old Prep mode), one photo at a time. */
function StepThrough({ settings, day, shots, index, onIndex, onBack }: { settings: Settings; day: ShootingDay; shots: Shot[]; index: number; onIndex: (i: number) => void; onBack: () => void }) {
  const p = useStyles();
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const portrait = height >= width;
  const [mode, setMode] = useState<FrameMode>("fit");
  const [info, setInfo] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { light } = useDayLight(day, shots);
  useEffect(() => { setPhotoIndex(0); }, [index]);

  const shot = shots[index];
  const photo = shot.photos[Math.min(photoIndex, shot.photos.length - 1)];
  const planned = day.shots.find((x) => x.shot_id === shot.id)?.planned_time;
  const atStart = index === 0, atEnd = index === shots.length - 1;
  const barH = 64;
  const availW = portrait ? width - 24 : width - 2 * NAV - 24;
  const availH = portrait ? height - barH - NAV - 60 - insets.top : height - barH - 60;
  const f = frameOf(photo);
  const aspect = mode === "fit" && f ? imageAspect(photo) * (f.width / f.height) : imageAspect(photo);
  const imgW = Math.max(100, Math.min(availW, availH * aspect));

  const navBtn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? atStart : atEnd;
    return (
      <Pressable onPress={() => onIndex(index + dir)} disabled={disabled} accessibilityRole="button" accessibilityLabel={dir < 0 ? "Previous shot" : "Next shot"}
        style={({ pressed }) => [p.nav, portrait ? { flex: 1, height: NAV } : { width: NAV, alignSelf: "stretch" }, pressed && { backgroundColor: c.accent }, disabled && p.navOff]}>
        {({ pressed }) => <Icon name={dir < 0 ? "chevron-left" : "chevron-right"} size={56} color={disabled ? c.textDisabled : pressed ? c.onAccent : c.chromeText} />}
      </Pressable>
    );
  };
  const image = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ShotFrame photo={photo} width={imgW} settings={settings} mode={mode} />
      <View style={{ marginTop: 8, flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <FrameModeSeg value={mode} onChange={setMode} />
        {shot.photos.length > 1 && <Chip icon="layers-triple-outline" label={`Photo ${photoIndex + 1}/${shot.photos.length}`} onPress={() => setPhotoIndex((photoIndex + 1) % shot.photos.length)} />}
      </View>
    </View>
  );

  return (
    <View style={p.root}>
      <Header title={`${index + 1}/${shots.length} · ${shotTitle(shot)}`} sub={[placeLabel(shot), planned ? `planned ${planned}` : null, windowsText(shootableWindows(light, shot.light))].filter(Boolean).join(" · ")}
        onBack={onBack} backLabel="Day" right={<IconButton icon="information-outline" label="Shot details" onPress={() => setInfo(true)} />} />
      {portrait ? (
        <>
          {image}
          <View style={{ flexDirection: "row" }}>{navBtn(-1)}{navBtn(1)}</View>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>{navBtn(-1)}{image}{navBtn(1)}</View>
      )}
      <Sheet visible={info} title={shotTitle(shot)} onClose={() => setInfo(false)}>
        <Text style={p.infoLine}>{placeLabel(shot) || "No location"}</Text>
        <Text style={p.infoDim}>{tagsLabel(shot) || "No tags"}</Text>
        <Text style={p.infoDim}>{rigLabel(photo)}</Text>
        <Text style={p.infoDim}>{new Date(shot.captured_at).toLocaleString()}</Text>
        <Text style={p.infoDim}>{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}</Text>
        {!!day.shots.find((x) => x.shot_id === shot.id)?.notes && <Text style={p.infoDim}>{day.shots.find((x) => x.shot_id === shot.id)?.notes}</Text>}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 12 },
  dayToday: { borderWidth: 2, borderColor: c.accent },
  dayName: { ...type("body", "bold"), color: c.text },
  daySub: { ...type("caption"), color: c.textDim },
  planned: { ...type("caption", "bold"), color: c.text },
  progress: { ...type("small", "bold"), color: c.text, ...num },
  lightBox: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 12, gap: 4 },
  bar24: { height: 30, borderRadius: RADIUS.xs, overflow: "hidden", position: "relative", marginBottom: 6, borderWidth: 1, borderColor: c.border },
  seg: { position: "absolute", top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  nowMark: { position: "absolute", top: 0, bottom: 0, width: 3, marginLeft: -1, backgroundColor: c.accent },
  now: { ...type("body", "heavy"), color: c.text },
  lightText: { ...type("small"), color: c.textDim },
  notes: { ...type("small"), color: c.text, marginTop: 6 },
  locHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 6 },
  locHeaderText: { ...type("overline", "bold"), color: c.text },
  shotRow: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 8, marginBottom: 8, minHeight: 64 },
  shotName: { ...type("body", "bold"), color: c.text },
  nav: { alignItems: "center", justifyContent: "center", backgroundColor: c.chromeBg, borderColor: c.chromeBorder, borderWidth: 2 },
  navOff: { borderStyle: "dashed", borderColor: c.textDisabled },
  infoLine: { ...type("body", "semibold"), color: c.text, marginTop: 12 },
  infoDim: { ...type("small"), color: c.textDim, marginTop: 6 },
}));
