import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, useColorScheme, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
// One module per weight, so only the five weights in use are bundled.
import { AtkinsonHyperlegibleNext_400Regular } from "@expo-google-fonts/atkinson-hyperlegible-next/400Regular";
import { AtkinsonHyperlegibleNext_500Medium } from "@expo-google-fonts/atkinson-hyperlegible-next/500Medium";
import { AtkinsonHyperlegibleNext_600SemiBold } from "@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold";
import { AtkinsonHyperlegibleNext_700Bold } from "@expo-google-fonts/atkinson-hyperlegible-next/700Bold";
import { AtkinsonHyperlegibleNext_800ExtraBold } from "@expo-google-fonts/atkinson-hyperlegible-next/800ExtraBold";
import type { Shot } from "./src/api";
import { Icon } from "./src/components/ui";
import { makeStyles, PALETTES, resolveTheme, SIZE, ThemeProvider, type, useTheme } from "./src/theme";
import { ProjectSheet } from "./src/components/ProjectSheet";
import { flush, onFlushed } from "./src/uploads";
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
const TABS: { mode: Mode; label: string; icon: string }[] = [
  { mode: "shoot", label: "Shoot", icon: "camera-iris" },
  { mode: "review", label: "Review", icon: "checkbox-marked-outline" },
  { mode: "gallery", label: "Gallery", icon: "view-grid-outline" },
  { mode: "map", label: "Map", icon: "map-outline" },
  { mode: "day", label: "Day", icon: "calendar-clock" },
  { mode: "setup", label: "Setup", icon: "cog-outline" },
];
const TAB = SIZE.tabBar;
/** Minimum clearance between the UI strips and the screen edge (camera cutout, Android navigation bar). */
export const EDGE_PAD = 32;

export default function Root() {
  // The UI font; render nothing for the few frames it takes to load (and carry on with the system font if it fails).
  const [fontsLoaded, fontError] = useFonts({
    AtkinsonHyperlegibleNext_400Regular, AtkinsonHyperlegibleNext_500Medium, AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold, AtkinsonHyperlegibleNext_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;
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
  // Any flush (camera, Setup, here) may have synced or remapped projects and locations.
  useEffect(() => onFlushed(() => { setProjects(store.loadProjects()); setProjectId(store.loadActiveProjectId()); setLocations(store.loadLocations()); }), []);
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
  const os = useColorScheme();
  const themeName = resolveTheme(settings.theme, os);

  return (
    <ThemeProvider choice={settings.theme}>
    <StatusBar style={themeName === "set" ? "light" : "dark"} />
    <View style={{ flex: 1, flexDirection: portrait ? "column" : "row", backgroundColor: PALETTES[themeName].bg }}>
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
      <TabBar mode={mode} onMode={setMode} unreviewed={unreviewed} portrait={portrait} pad={barPad} />
      <Login visible={login} onDone={() => setLogin(false)} onSkip={() => setLogin(false)} />
      {/* Asked once (after sign-in) when no project is active; afterwards only when switching from Setup. */}
      <ProjectSheet visible={!login && (projectSheet || !project)} projects={projects} activeId={project?.id ?? null} onPick={pickProject} onClose={project ? () => setProjectSheet(false) : null} />
    </View>
    </ThemeProvider>
  );
}

/** Bottom tab bar (a right-hand column in landscape). Selected = accent pill behind the icon + heavy label. */
function TabBar({ mode, onMode, unreviewed, portrait, pad }: { mode: Mode; onMode: (m: Mode) => void; unreviewed: number; portrait: boolean; pad: number }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={[s.bar, portrait ? { height: TAB + pad, paddingBottom: pad, flexDirection: "row", borderTopWidth: 2 } : { width: 76 + pad, paddingRight: pad, flexDirection: "column", borderLeftWidth: 2 }]}>
      {TABS.map((t) => {
        const on = mode === t.mode;
        return (
          <Pressable key={t.mode} onPress={() => onMode(t.mode)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
            <View style={[s.pill, on && { backgroundColor: c.accent }]}>
              <Icon name={t.icon} size={22} color={on ? c.onAccent : c.text} />
            </View>
            <Text style={[s.label, on && s.labelOn]} numberOfLines={1}>{t.label}</Text>
            {t.mode === "review" && unreviewed > 0 && <Text style={s.badge}>{unreviewed}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: { backgroundColor: c.surface, borderColor: c.border, justifyContent: "space-around", alignItems: "stretch", paddingHorizontal: 4, paddingTop: 4 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minWidth: 52, minHeight: 56 },
  pill: { width: 52, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  label: { ...type("caption", "medium"), fontSize: 12, lineHeight: 14, color: c.text },
  labelOn: { fontFamily: type("caption", "heavy").fontFamily },
  badge: { position: "absolute", top: 0, left: "54%", minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, overflow: "hidden", backgroundColor: c.warn, color: c.onWarn, textAlign: "center", ...type("caption", "bold"), fontSize: 12, lineHeight: 20 },
}));
