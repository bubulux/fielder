import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayLight, lightLabel, localDay, shootableWindows, type DayLight, type Interval } from "@fielder/vocab";
import { api, cover, type Shot, type ShootingDay } from "../api";
import { offlineDays, removeOfflineDay, saveDayOffline, type OfflineDay } from "../offline";
import { FRAME_MODES, frameModeLabel, imageAspect, frameOf, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { Button, Chip, ChipRow, colors, Sheet } from "../components/ui";
import type { ProjectEntry, Settings } from "../types";
import { placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

interface Props { settings: Settings; data: ReturnType<typeof useShots>; project: ProjectEntry | null }

const NAV = 88;
const BERLIN = { lat: 52.52, lon: 13.405 };
const PHASE_COLORS: Record<string, string> = { night: "#1c2340", dawn: "#e0925a", day: "#f2d36b", dusk: "#b8628a" };
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

  if (!project) return <Text style={p.status}>Choose a project first (Setup → Project).</Text>;
  if (online && !days) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;

  if (!day) {
    const today = todayIso();
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={p.bar}><Text style={p.barTitle}>Shooting days · {project.name}</Text></View>
        {!online && <Text style={p.offlineBanner}>Offline: showing the days saved on this phone.</Text>}
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onRefresh={() => void load()}
          refreshing={false}
          ListEmptyComponent={<Text style={p.status}>{online ? "No shooting days yet. Plan them in the dashboard's Schedule tab." : "No days saved offline for this project."}</Text>}
          renderItem={({ item }) => {
            const s = saved(item.id);
            const stale = s && item.updated_at && s.day.updated_at !== item.updated_at;
            const progress = busy?.startsWith(`${item.id}:`) ? busy.split(":")[1] : null;
            return (
              <View style={[p.dayRow, item.date < today && { opacity: 0.6 }]}>
                <Pressable onPress={() => { setDayId(item.id); setStep(null); }} style={{ flex: 1 }}>
                  <Text style={p.dayName}>{dateLabel(item.date)}{item.date === today ? " · today" : ""}</Text>
                  {!!item.title && <Text style={p.daySub}>{item.title}</Text>}
                  <Text style={p.daySub}>{item.shots.length} shot{item.shots.length === 1 ? "" : "s"}{s ? ` · offline${stale ? " (plan changed)" : ""}` : ""}</Text>
                </Pressable>
                {online && (progress ? <Text style={p.progress}>{progress}</Text>
                  : s && !stale ? <Pressable onPress={() => dropOffline(item)} hitSlop={8}><Text style={p.offlineOn}>✓ offline</Text></Pressable>
                  : <Pressable onPress={() => void makeOffline(item)} hitSlop={8}><Text style={p.offlineBtn}>{stale ? "Update offline" : "Make offline"}</Text></Pressable>)}
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
  const { light, start, hours } = useDayLight(day, shots);
  const now = new Date();
  const current = light.phases.find((ph) => now >= ph.start && now < ph.end && day.date === todayIso());
  const plannedOf = (id: string) => day.shots.find((x) => x.shot_id === id)?.planned_time ?? null;
  let lastLocation = "";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[p.bar, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: colors.accent, fontSize: 15 }}>‹ Days</Text></Pressable>
        <Text style={[p.barTitle, { flex: 1 }]} numberOfLines={1}>{dateLabel(day.date)}{day.title ? ` · ${day.title}` : ""}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
        <View style={p.lightBox}>
          <View style={p.bar24}>
            {light.phases.map((ph) => (
              <View key={ph.start.toISOString()} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(ph.start, start, hours)}%`, width: `${pct(ph.end, start, hours) - pct(ph.start, start, hours)}%`, backgroundColor: PHASE_COLORS[ph.phase] }} />
            ))}
            {day.date === todayIso() && <View style={[p.nowMark, { left: `${pct(now, start, hours)}%` }]} />}
          </View>
          <Text style={p.lightText}>
            {light.sunrise ? `Sunrise ${hhmm(light.sunrise)}` : ""}{light.sunset ? ` · Sunset ${hhmm(light.sunset)}` : ""}
          </Text>
          <Text style={p.lightText}>{light.phases.filter((ph) => ph.phase === "dawn" || ph.phase === "dusk").map((ph) => `${ph.phase} ${hhmm(ph.start)}–${hhmm(ph.end)}`).join(" · ")}</Text>
          {current && <Text style={[p.lightText, { color: colors.accent }]}>Now: {current.phase} until {hhmm(current.end)}</Text>}
          {!!day.notes && <Text style={[p.lightText, { color: colors.text, marginTop: 6 }]}>{day.notes}</Text>}
        </View>
        {!online && <Text style={p.offlineBanner}>Offline copy</Text>}
        {shots.length === 0 && <Text style={p.status}>No shots on this day.</Text>}
        {shots.map((s, i) => {
          const loc = placeLabel(s) || "No location";
          const header = loc !== lastLocation ? loc : null;
          lastLocation = loc;
          const w = shootableWindows(light, s.light);
          const planned = plannedOf(s.id);
          return (
            <View key={s.id}>
              {header && <Text style={p.locHeader}>{header}</Text>}
              <Pressable onPress={() => onStart(i)} style={p.shotRow}>
                <ShotFrame photo={cover(s)} width={110} settings={settings} mode="fit" style={{ borderRadius: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={p.shotName} numberOfLines={1}>{i + 1}. {shotTitle(s)}</Text>
                  {!!planned && <Text style={[p.daySub, { color: colors.accent }]}>Planned {planned}</Text>}
                  <Text style={p.daySub}>{lightLabel(s.light, s.artificial) || "any light"} · {windowsText(w)}</Text>
                  {s.photos.length > 1 && <Text style={p.daySub}>{s.photos.length} photos</Text>}
                </View>
              </Pressable>
            </View>
          );
        })}
        {shots.length > 0 && <Button label="Start from the first shot" onPress={() => onStart(0)} />}
      </ScrollView>
    </View>
  );
}

const pct = (d: Date, start: Date, hours: number) => Math.max(0, Math.min(100, ((d.getTime() - start.getTime()) / (hours * 3_600_000)) * 100));

/** Big-button stepping through the day's shots (the old Prep mode), one photo at a time. */
function StepThrough({ settings, day, shots, index, onIndex, onBack }: { settings: Settings; day: ShootingDay; shots: Shot[]; index: number; onIndex: (i: number) => void; onBack: () => void }) {
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
  const barH = 56;
  const availW = portrait ? width - 24 : width - 2 * NAV - 24;
  const availH = portrait ? height - barH - NAV - 60 - insets.top : height - barH - 60;
  const f = frameOf(photo);
  const aspect = mode === "fit" && f ? imageAspect(photo) * (f.width / f.height) : imageAspect(photo);
  const imgW = Math.max(100, Math.min(availW, availH * aspect));

  const navBtn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? atStart : atEnd;
    return (
      <Pressable onPress={() => onIndex(index + dir)} disabled={disabled} style={[p.nav, portrait ? { flex: 1, height: NAV } : { width: NAV, alignSelf: "stretch" }, disabled && { opacity: 0.25 }]} hitSlop={8}>
        <Text style={p.navText}>{dir < 0 ? "◀" : "▶"}</Text>
      </Pressable>
    );
  };
  const image = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ShotFrame photo={photo} width={imgW} settings={settings} mode={mode} />
      <View style={{ marginTop: 8, flexDirection: "row", gap: 12, alignItems: "center" }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
        {shot.photos.length > 1 && (
          <Pressable onPress={() => setPhotoIndex((photoIndex + 1) % shot.photos.length)} hitSlop={8}>
            <Text style={{ color: colors.accent, fontWeight: "600" }}>photo {photoIndex + 1}/{shot.photos.length} ›</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[p.bar, { height: barH, flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: colors.accent, fontSize: 15 }}>‹ Day</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={p.barTitle} numberOfLines={1}>{index + 1}/{shots.length} · {shotTitle(shot)}</Text>
          <Text style={p.daySub} numberOfLines={1}>{[placeLabel(shot), planned ? `planned ${planned}` : null, windowsText(shootableWindows(light, shot.light))].filter(Boolean).join(" · ")}</Text>
        </View>
        <Pressable onPress={() => setInfo(true)} hitSlop={8} style={p.infoBtn}><Text style={p.infoText}>i</Text></Pressable>
      </View>
      {portrait ? (
        <>
          {image}
          <View style={{ flexDirection: "row" }}>{navBtn(-1)}{navBtn(1)}</View>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>{navBtn(-1)}{image}{navBtn(1)}</View>
      )}
      <Sheet visible={info} title={shotTitle(shot)} onClose={() => setInfo(false)}>
        <Text style={p.infoLine}>{placeLabel(shot) || "no location"}</Text>
        <Text style={p.infoDim}>{tagsLabel(shot) || "no tags"}</Text>
        <Text style={p.infoDim}>{rigLabel(photo)}</Text>
        <Text style={p.infoDim}>{new Date(shot.captured_at).toLocaleString()}</Text>
        <Text style={p.infoDim}>{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}</Text>
        {!!day.shots.find((x) => x.shot_id === shot.id)?.notes && <Text style={p.infoDim}>{day.shots.find((x) => x.shot_id === shot.id)?.notes}</Text>}
      </Sheet>
    </View>
  );
}

const p = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  status: { color: colors.dim, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  offlineBanner: { color: "#000", backgroundColor: colors.accent, textAlign: "center", paddingVertical: 4, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  dayRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, gap: 12 },
  dayName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  daySub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  offlineBtn: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  offlineOn: { color: colors.ok, fontSize: 13, fontWeight: "600" },
  progress: { color: colors.dim, fontSize: 13, fontVariant: ["tabular-nums"] },
  lightBox: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 12 },
  bar24: { height: 18, borderRadius: 4, overflow: "hidden", position: "relative", marginBottom: 8 },
  nowMark: { position: "absolute", top: -2, bottom: -2, width: 3, marginLeft: -1, backgroundColor: "#fff" },
  lightText: { color: colors.dim, fontSize: 12, marginTop: 2 },
  locHeader: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  shotRow: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, marginBottom: 8 },
  shotName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  nav: { alignItems: "center", justifyContent: "center" },
  navText: { color: colors.text, fontSize: 40 },
  infoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  infoText: { color: colors.accent, fontWeight: "700", fontStyle: "italic" },
  infoLine: { color: colors.text, fontSize: 15, marginTop: 8 },
  infoDim: { color: colors.dim, marginTop: 6 },
});
