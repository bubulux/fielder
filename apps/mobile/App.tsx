import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import type { Shot } from "./src/api";
import { colors } from "./src/components/ui";
import { ProjectSheet } from "./src/components/ProjectSheet";
import { flush } from "./src/uploads";
import { isSignedIn, onAuthChange } from "./src/auth";
import { isConfigured } from "./src/config";
import { Gallery, useShots, type StateFilter } from "./src/screens/Gallery";
import { Login } from "./src/screens/Login";
import { ShootDay } from "./src/screens/ShootDay";
import { Review } from "./src/screens/Review";
import { Setup } from "./src/screens/Setup";
import { setLogging } from "./src/log";
import { MapScreen } from "./src/screens/MapScreen";
import { Viewfinder } from "./src/screens/Viewfinder";
import { store } from "./src/storage";
import type { LocationEntry, ProjectEntry, Settings } from "./src/types";

type Mode = "shoot" | "review" | "gallery" | "map" | "day" | "setup";
const ICONS: Record<Mode, string> = { shoot: "◉", review: "☑", gallery: "▦", map: "⌖", day: "▷", setup: "⚙" };
const TAB = 52;
/** Minimum clearance between the UI strips and the screen edge (camera cutout, Android navigation bar). */
export const EDGE_PAD = 32;

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

function App() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const portrait = height >= width;
  const [mode, setMode] = useState<Mode>("shoot");
  const [settings, setSettings] = useState<Settings>(() => { const s = store.loadSettings(); setLogging(s.loggingEnabled); return s; });
  const [focus, setFocus] = useState<Shot | null>(null);
  const [open, setOpen] = useState<Shot | null>(null);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [locations, setLocations] = useState<LocationEntry[]>(() => store.loadLocations());
  const [projects, setProjects] = useState<ProjectEntry[]>(() => store.loadProjects());
  // Chosen once and remembered across launches until changed in Setup.
  const [projectId, setProjectId] = useState<string | null>(() => store.loadActiveProjectId());
  const project = projects.find((p) => p.id === projectId) ?? null;
  const [projectSheet, setProjectSheet] = useState(false);
  const shots = useShots(project?.id ?? null);
  // Login sheet: on launch when there is no session, and again whenever a request finds the session gone.
  const [login, setLogin] = useState<boolean>(() => isConfigured && !isSignedIn());
  // flush() syncs projects first and repoints queued shots (and the active id) when a name clashed on the server.
  const refreshProjects = useCallback(async () => {
    await flush();
    setProjects(store.loadProjects());
    setProjectId(store.loadActiveProjectId());
  }, []);
  useEffect(() => { if (isSignedIn()) void refreshProjects(); }, []);
  useEffect(() => onAuthChange(() => { if (!isSignedIn()) setLogin(true); else { void refreshProjects(); void shots.load(); } }), [shots.load]);
  useEffect(() => { store.saveActiveProjectId(projectId); }, [projectId]);
  const pickProject = (id: string, created: ProjectEntry | null) => {
    if (created) { const next = [...store.loadProjects(), created]; store.saveProjects(next); setProjects(next); }
    store.saveActiveProjectId(id); // now, not in the effect: refreshProjects reads it back from the store
    setProjectId(id);
    setProjectSheet(false);
    if (created && isSignedIn()) void refreshProjects();
  };
  const unreviewed = (shots.shots ?? []).filter((s) => s.state === "unreviewed").length;
  const countAt = useCallback(
    (locationId: string) =>
      (shots.shots ?? []).filter((x) => x.location_id === locationId).length + store.loadPending().filter((p) => p.metadata.location_id === locationId).length,
    [shots.shots],
  );

  useEffect(() => { store.saveSettings(settings); }, [settings]);
  useEffect(() => { store.saveLocations(locations); }, [locations]);
  // Refresh the gallery when switching to it, so new shots show up without a pull.
  useEffect(() => { if (mode !== "shoot") void shots.load(); }, [mode]);

  useEffect(() => {
    const lock = settings.orientationLock;
    const p = lock === "landscape"
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      : lock === "portrait"
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        : ScreenOrientation.unlockAsync();
    p.catch((e) => console.warn("orientation lock failed", e));
  }, [settings.orientationLock]);

  // The tab bar sits on the navigation-bar edge; keep at least EDGE_PAD clear of it.
  const barPad = portrait ? Math.max(insets.bottom, EDGE_PAD) : Math.max(insets.right, EDGE_PAD);
  const tabs = (
    <View style={[t.bar, portrait ? { height: TAB + barPad, paddingBottom: barPad, flexDirection: "row" } : { width: TAB + barPad, paddingRight: barPad, flexDirection: "column" }]}>
      {(Object.keys(ICONS) as Mode[]).map((m) => (
        <Pressable key={m} onPress={() => setMode(m)} style={t.tab} hitSlop={6}>
          <Text style={[t.icon, mode === m && { color: colors.accent }]}>{ICONS[m]}</Text>
          <Text style={[t.label, mode === m && { color: colors.accent }]}>{m === "review" && unreviewed ? `review ${unreviewed}` : m}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[t.root, { flexDirection: portrait ? "column" : "row" }]}>
      {/* Content stays clear of the camera cutout (top in portrait, left in landscape). */}
      <View style={{ flex: 1, paddingTop: portrait ? insets.top : 0, paddingLeft: portrait ? 0 : insets.left }}>
        {/* Viewfinder stays mounted so state and camera warm-up survive tab switches; it releases the camera when inactive. */}
        <View style={[{ flex: 1 }, mode !== "shoot" && { display: "none" }]}>
          <Viewfinder settings={settings} onSettings={setSettings} active={mode === "shoot"} project={project} shots={shots.shots} locations={locations} onLocations={setLocations} />
        </View>
        {mode === "review" && <Review settings={settings} data={shots} locations={locations} onLocations={setLocations} countAt={countAt} />}
        {mode === "gallery" && <Gallery settings={settings} data={shots} onShowOnMap={(s) => { setFocus(s); setMode("map"); }} filter={filter} onFilter={setFilter}
          locations={locations} onLocations={setLocations} countAt={countAt} open={open} onOpen={setOpen} />}
        {mode === "day" && <ShootDay settings={settings} data={shots} project={project} />}
        {mode === "setup" && <Setup settings={settings} onChange={setSettings} project={project} onSwitchProject={() => setProjectSheet(true)} onSignIn={() => setLogin(true)} />}
        {mode === "map" && <MapScreen settings={settings} data={shots} focus={focus} filter={filter} locations={locations} onLocations={setLocations} countAt={countAt} open={open} onOpen={setOpen} />}
      </View>
      {tabs}
      <Login visible={login} onDone={() => setLogin(false)} onSkip={() => setLogin(false)} />
      {/* Asked once (after sign-in) when no project is active; afterwards only when switching from Setup. */}
      <ProjectSheet visible={!login && (projectSheet || !project)} projects={projects} activeId={project?.id ?? null} onPick={pickProject} onClose={project ? () => setProjectSheet(false) : null} />
    </View>
  );
}

const t = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { backgroundColor: colors.panel, borderColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, justifyContent: "space-evenly", alignItems: "center" },
  tab: { alignItems: "center", minWidth: 48 },
  icon: { color: colors.dim, fontSize: 18 },
  label: { color: colors.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
});
