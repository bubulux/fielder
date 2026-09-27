import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Shot } from "../api";
import { isSignedIn, onAuthChange, signedInEmail } from "../auth";
import { isConfigured } from "../config";
import { computeOverlay, formatDeg, previewBox, type Box } from "../framing";
import { log } from "../log";
import { PHONE } from "../phone";
import { addToSequence, deleteDraftFiles, startSequence } from "../sequence";
import { store, usePendingCount } from "../storage";
import { lensRangeOf, type CaptureDraft, type DraftPhoto, type LocationEntry, type PhotoMetadata, type Preset, type ProjectEntry, type Settings, type ShotMetadata, type ShotTags } from "../types";
import { enqueue, flush } from "../uploads";
import { syncPresets } from "../presetSync";
import { LensCarousel } from "../components/LensCarousel";
import { clampToRange } from "../lens";
import { LensSheet } from "../components/LensSheet";
import { HUMAN_COLOR, Overlay } from "../components/Overlay";
import { PresetSheet } from "../components/PresetSheet";
import { ShotReview } from "./ShotReview";
import { colors } from "../components/ui";

const CONTROLS_SIZE = 104;
const LENS_STRIP = 72;
/** Minimum clearance between the lens strip and the screen edge (camera cutout in landscape). */
const EDGE_PAD = 32;
const MAX_UPLOAD_EDGE = 1280;
const HUMAN_STEPS = [35, 43, 50];
/** A watched GPS fix younger than this is used as is; otherwise the capture waits briefly for a fresh one. */
const FIX_MAX_AGE_MS = 15_000;
const SEQ_COLOR = "#FF3B30";

const NO_TAGS: ShotTags = { name: null, light: [], artificial: false, weather: null, int_ext: null, location_id: null, extra: {} };

type Sheet = "rig" | "lens" | null;

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  /** Whether this tab is on screen; the camera (and GPS watch) is released otherwise. */
  active: boolean;
  /** Every capture goes into this project; null blocks the shutter (App asks for one first). */
  project: ProjectEntry | null;
  /** Uploaded shots (for per-location counters in the review form). */
  shots: Shot[] | null;
  locations: LocationEntry[];
  onLocations: (l: LocationEntry[]) => void;
}

export function Viewfinder({ settings, onSettings, active: tabActive, project, shots, locations, onLocations }: Props) {
  const [size, setSize] = useState<Box>({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  const window = size;
  const portrait = window.height >= window.width;
  const insets = useSafeAreaInsets();
  // App.tsx already pads the content by the cutout inset; top up to EDGE_PAD so the strip never touches the edge.
  const lensPad = portrait ? 0 : Math.max(0, EDGE_PAD - insets.left);
  const setSettings = (u: Settings | ((s: Settings) => Settings)) => onSettings(typeof u === "function" ? u(settings) : u);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [locPerm, requestLocPerm] = Location.useForegroundPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [presets, setPresets] = useState<Preset[]>(() => store.loadPresets());
  const [activeId, setActiveId] = useState<string | null>(() => store.loadActivePresetId());
  const [lensMm, setLensMm] = useState<number>(() => store.loadLensMm());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<"capture" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pendingCount = usePendingCount();
  /** Capture or finished sequence waiting in the tag form. */
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  /** Sequence mode: on while non-null; resumes after an app restart. */
  const [sequence, setSequence] = useState<CaptureDraft | null>(() => store.loadSequence());
  /** Flashlight; deliberately not remembered across launches. */
  const [torch, setTorch] = useState(false);

  const active = presets.find((p) => p.id === activeId) ?? presets[0] ?? null;
  const lensRange = lensRangeOf(active);
  // Keep the lens inside the rig's range when the rig (or its range) changes.
  useEffect(() => { setLensMm((mm) => clampToRange(mm, lensRange)); }, [active?.id, lensRange?.min, lensRange?.max]);

  // Persist on change.
  useEffect(() => { store.savePresets(presets); }, [presets]);
  useEffect(() => { store.saveActivePresetId(activeId); }, [activeId]);
  useEffect(() => { store.saveLensMm(lensMm); }, [lensMm]);

  // Permissions and background sync on launch.
  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCamPerm();
  }, [camPerm, requestCamPerm]);
  useEffect(() => {
    if (locPerm && !locPerm.granted && locPerm.canAskAgain) void requestLocPerm();
  }, [locPerm, requestLocPerm]);
  const [authEmail, setAuthEmail] = useState<string | null>(() => signedInEmail());
  useEffect(() => {
    if (!isConfigured) return;
    const sync = async () => {
      if (!isSignedIn()) return;
      // Rigs live on the server; pull the authoritative list after pushing offline edits.
      const server = await syncPresets(store.loadPresets());
      if (server) {
        setPresets(server);
        setActiveId((cur) => (cur && server.some((p) => p.id === cur) ? cur : server[0]?.id ?? null));
      }
      await flush(); // also pulls the server's project and location lists
      onLocations(store.loadLocations());
    };
    void sync();
    // Re-run after a sign-in so queued shots go out right away.
    return onAuthChange(() => { setAuthEmail(signedInEmail()); void sync(); });
  }, []);

  // GPS: watch at the best accuracy while the camera is on screen, so a capture has a warm, precise fix.
  const lastFix = useRef<Location.LocationObject | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  useEffect(() => {
    if (!tabActive || !locPerm?.granted) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    // Android: ask once to turn on Google Location Accuracy (Wi-Fi/cell assisted), which fixes much faster and tighter.
    if (Platform.OS === "android") Location.enableNetworkProviderAsync().catch(() => {});
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (pos) => {
      lastFix.current = pos;
      setGpsAccuracy(pos.coords.accuracy ?? null);
    }).then((s) => { if (cancelled) s.remove(); else sub = s; }).catch((e) => log("warn", "gps watch failed", e));
    return () => { cancelled = true; sub?.remove(); };
  }, [tabActive, locPerm?.granted]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  }, []);

  // Layout: preview box fills the space left after the control strip.
  const area: Box = portrait
    ? { width: window.width, height: Math.max(0, window.height - CONTROLS_SIZE - 64) }
    : { width: Math.max(0, window.width - CONTROLS_SIZE - LENS_STRIP - lensPad), height: window.height };
  const preview = useMemo(() => previewBox(area), [area.width, area.height]);
  const overlay = useMemo(
    () => (active ? computeOverlay(settings, active, lensMm, preview) : null),
    [settings, active, lensMm, preview],
  );

  async function getPosition(): Promise<Location.LocationObject | null> {
    if (!locPerm?.granted) {
      const r = await requestLocPerm();
      if (!r.granted) return null;
    }
    const watched = lastFix.current;
    if (watched && Date.now() - watched.timestamp < FIX_MAX_AGE_MS) return watched;
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 8000));
    const pos = await Promise.race([fresh.catch(() => null), timeout]);
    return pos ?? lastFix.current ?? (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }));
  }

  async function capture() {
    if (!camera.current || !cameraReady || busy || !active || !overlay || !project) return;
    setBusy("capture");
    try {
      const [pos, pic] = await Promise.all([
        getPosition(),
        camera.current.takePictureAsync({ quality: 0.7, exif: true, skipProcessing: false }),
      ]);
      if (!pos) {
        log("warn", "capture without GPS fix");
        Alert.alert("No GPS position", "Could not get a location fix. The shot was not saved.");
        return;
      }
      const landscapePic = pic.width >= pic.height;
      const rendered = await ImageManipulator.manipulate(pic.uri)
        .resize(landscapePic ? { width: Math.min(MAX_UPLOAD_EDGE, pic.width) } : { height: Math.min(MAX_UPLOAD_EDGE, pic.height) })
        .renderAsync();
      const small = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });

      const exif = (pic.exif ?? {}) as Record<string, unknown>;
      const frame = { width: round4(overlay.fractions.width), height: round4(overlay.fractions.height) };
      const meta: PhotoMetadata = {
        id: Crypto.randomUUID(),
        ordinal: 0,
        timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        gps_accuracy_m: pos.coords.accuracy ?? null,
        lens_mm: lensMm,
        preset_id: active.synced ? active.id : null,
        width: small.width,
        height: small.height,
        framing: {
          preset_name: active.name,
          camera_id: active.cameraId,
          format_id: active.formatId,
          sensor_width_mm: active.sensorWidthMm,
          sensor_height_mm: active.sensorHeightMm,
          speedbooster_factor: active.speedboosterFactor,
          lens_mm: lensMm,
          rig_orientation: settings.rigOrientation,
          effective_focal_mm: round(overlay.framing.effectiveFocalLengthMm),
          full_frame_equivalent_mm: round(overlay.framing.fullFrameEquivalentMm),
          hfov_deg: round(overlay.framing.fov.horizontal),
          vfov_deg: round(overlay.framing.fov.vertical),
          // Rig frame relative to the uploaded photo, centred. Lets the dashboard re-apply the mask.
          frame: { width_fraction: frame.width, height_fraction: frame.height },
          // Phone view the photo was taken with, so other rigs/lenses can be simulated on it later.
          phone_equivalent_focal_mm: settings.phoneEquivalentFocalMm,
        },
        device: {
          phone_model: PHONE.model,
          exif_focal_length: exif.FocalLength ?? null,
          exif_focal_length_35mm: exif.FocalLengthIn35mmFilm ?? null,
          exif_model: exif.Model ?? null,
          gps_altitude_m: pos.coords.altitude ?? null,
          gps_heading_deg: pos.coords.heading ?? null,
          gps_fix_age_ms: Date.now() - pos.timestamp,
        },
      };
      log("info", "capture", { lens: lensMm, rig: active.name, gps_accuracy_m: meta.gps_accuracy_m, sequence: !!sequence, direct: settings.directUpload });
      if (!active.synced) {
        // Preset unknown to the server: try once more now so the FK can be set on the row later.
        try { await api.putPreset(active); setPresets((c) => c.map((x) => (x.id === active.id ? { ...x, synced: true } : x))); } catch { /* the framing snapshot on the photo still preserves it */ }
      }
      const photo: DraftPhoto = { uri: small.uri, meta, frame };
      if (sequence) {
        const next = addToSequence(sequence, photo);
        setSequence(next);
        showToast(`Sequence · ${next.photos.length} photo${next.photos.length === 1 ? "" : "s"}`);
      } else if (settings.directUpload) {
        await queueDraft({ shotId: Crypto.randomUUID(), photos: [photo] }, NO_TAGS, null);
      } else {
        // Hand over to the review form; nothing is queued until the user taps Upload.
        setDraft({ shotId: Crypto.randomUUID(), photos: [photo] });
      }
    } catch (err) {
      log("error", "capture failed", err);
      Alert.alert("Capture failed", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /** Queue a capture or sequence as one shot of the active project and try to upload right away. */
  async function queueDraft(d: CaptureDraft, tags: ShotTags, newLocation: LocationEntry | null): Promise<boolean> {
    if (!project) return false;
    if (newLocation) { const next = [...locations, newLocation]; onLocations(next); store.saveLocations(next); }
    const metadata: ShotMetadata = { id: d.shotId, project_id: project.id, ...tags, photos: d.photos.map((p) => p.meta) };
    try {
      enqueue(metadata, Object.fromEntries(d.photos.map((p) => [p.meta.id, p.uri])));
    } catch (err) {
      log("error", "enqueue failed", err);
      Alert.alert("Could not save the shot", err instanceof Error ? err.message : String(err));
      return false; // keep the draft so nothing is lost
    }
    deleteDraftFiles(d); // the queue has its own copies now
    const r = await flush();
    onLocations(store.loadLocations());
    showToast(r.remaining === 0 ? "Uploaded" : `Saved locally (${r.remaining} pending)`);
    return true;
  }

  async function uploadDraft(tags: ShotTags, newLocation: LocationEntry | null) {
    if (!draft) return;
    const d = draft;
    if (await queueDraft(d, tags, newLocation)) setDraft(null);
  }

  function discardDraft() {
    if (draft) { deleteDraftFiles(draft); log("info", "draft discarded", { shot: draft.shotId, photos: draft.photos.length }); }
    setDraft(null);
  }

  async function toggleSequence() {
    if (!sequence) {
      setSequence(startSequence());
      showToast("Sequence on: every shot joins one set");
      return;
    }
    const d = sequence;
    setSequence(null);
    store.saveSequence(null);
    log("info", "sequence end", { shot: d.shotId, photos: d.photos.length });
    if (d.photos.length === 0) { showToast("Sequence off"); return; }
    if (settings.directUpload) await queueDraft(d, NO_TAGS, null);
    else setDraft(d);
  }

  const countAt = useCallback(
    (locationId: string) =>
      (shots ?? []).filter((x) => x.location_id === locationId).length + store.loadPending().filter((p) => p.metadata.location_id === locationId).length,
    [shots],
  );

  /** Cycle: off -> 35 -> 43 -> 50 -> off. Toggle: off <-> the chosen value (Setup). */
  function pressHuman() {
    setSettings((x) => {
      if (x.humanViewButton === "toggle") return { ...x, humanViewEnabled: !x.humanViewEnabled };
      if (!x.humanViewEnabled) return { ...x, humanViewEnabled: true, humanViewFocalMm: HUMAN_STEPS[0] };
      const i = HUMAN_STEPS.indexOf(x.humanViewFocalMm);
      if (i < 0 || i === HUMAN_STEPS.length - 1) return { ...x, humanViewEnabled: false };
      return { ...x, humanViewFocalMm: HUMAN_STEPS[i + 1] };
    });
  }

  async function retryUploads() {
    const r = await flush();
    showToast(r.remaining === 0 ? "All uploaded" : `${r.remaining} still pending${r.lastError ? `: ${r.lastError}` : ""}`);
  }

  if (!camPerm) return <View style={s.root} onLayout={onLayout} />;
  if (!camPerm.granted) {
    return (
      <View style={[s.root, s.center]}>
        <Text style={s.msg}>Fielder needs the camera to work as a viewfinder.</Text>
        <Pressable style={s.primary} onPress={() => void requestCamPerm()}><Text style={s.primaryText}>Grant camera access</Text></Pressable>
      </View>
    );
  }

  const lensStrip = (
    <LensCarousel lensMm={lensMm} onChange={setLensMm} vertical={!portrait} length={portrait ? window.width : window.height} range={lensRange} onPressValue={() => setSheet("lens")} />
  );
  const shutterDisabled = !!busy || !active || !cameraReady || !project;

  return (
    <View style={[s.root, { flexDirection: portrait ? "column" : "row" }]} onLayout={onLayout}>
      <StatusBar hidden />
      {!portrait && <View style={{ paddingLeft: lensPad, backgroundColor: colors.bg }}>{lensStrip}</View>}
      <View style={[s.previewArea, { width: area.width, height: area.height }]}>
        <View style={{ width: preview.width, height: preview.height, backgroundColor: "#000", overflow: "hidden" }}>
          {window.width > 0 && (
            <CameraView
              ref={camera}
              active={tabActive}
              style={overlay ? { position: "absolute", ...overlay.camera } : StyleSheet.absoluteFill}
              facing="back"
              ratio="4:3"
              enableTorch={torch && tabActive}
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
            />
          )}
          {overlay && <Overlay preview={preview} rect={overlay.rect} settings={settings} exceedsPreview={overlay.exceedsPreview} human={overlay.human} />}
          {/* HUD (can be hidden in Setup; the "no rig" hint always shows) */}
          {(settings.hudEnabled || !active) && <View style={s.hud} pointerEvents="none">
            {active && overlay ? (
              <>
                <Text style={s.hudProject} numberOfLines={1}>{project?.name ?? "No project"}</Text>
                <Text style={s.hudMain}>{active.name} · {lensMm} mm{active.speedboosterFactor !== 1 ? ` ×${active.speedboosterFactor}` : ""}</Text>
                <Text style={s.hudSub}>
                  {round(overlay.framing.effectiveFocalLengthMm)} mm eff · {round(overlay.framing.fullFrameEquivalentMm)} mm FF-eq · {formatDeg(overlay.framing.fov.horizontal)} × {formatDeg(overlay.framing.fov.vertical)}
                </Text>
                <Text style={[s.hudSub, gpsAccuracy != null && gpsAccuracy > 20 && { color: colors.accent }]}>
                  GPS {gpsAccuracy == null ? "searching…" : `±${Math.round(gpsAccuracy)} m`}
                </Text>
                {overlay.exceedsPreview && <Text style={s.hudWarn}>Rig sees more than the phone camera: live image shrunk to fit the frame; black areas are outside the phone's view</Text>}
                {settings.fitToFrame && !overlay.exceedsPreview && <Text style={s.hudWarn}>Fit: digital zoom ×{(overlay.camera.width / preview.width).toFixed(2)}</Text>}
                {overlay.human && (
                  <Text style={[s.hudSub, { color: HUMAN_COLOR }]}>
                    {overlay.human.relation === "equal"
                      ? `Rig matches the human view (${overlay.human.focalMm} mm-eq)`
                      : overlay.human.relation === "wider"
                        ? `Rig is wider than the human view (${overlay.human.focalMm} mm-eq): cyan frame inside`
                        : `Rig is narrower than the human view (${overlay.human.focalMm} mm-eq)${overlay.human.fits ? ": cyan frame around it" : "; the cyan frame is outside the preview"}`}
                  </Text>
                )}
              </>
            ) : (
              <Text style={s.hudWarn}>No rig selected. Tap "Rig" to create one.</Text>
            )}
            {!isConfigured && <Text style={s.hudWarn}>Build has no API configuration; shots stay on device.</Text>}
            {isConfigured && !authEmail && <Text style={s.hudWarn}>Not signed in: shots are kept on the phone. Sign in via Setup.</Text>}
          </View>}
          {sequence && (
            <View style={s.seqBadge} pointerEvents="none">
              <View style={s.seqDot} />
              <Text style={s.seqText}>SEQ · {sequence.photos.length}</Text>
            </View>
          )}
          {toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
        </View>
      </View>

      {portrait && lensStrip}
      <View style={[s.controls, portrait ? { height: CONTROLS_SIZE, flexDirection: "row" } : { width: CONTROLS_SIZE, flexDirection: "column" }]}>
        <Ctl label="Rig" value={active ? "●" : "＋"} onPress={() => setSheet("rig")} />
        <Ctl label="Human" value={settings.humanViewEnabled ? `${settings.humanViewFocalMm}` : "off"} onPress={pressHuman} accent={settings.humanViewEnabled} />
        <Ctl label="Fit" value={settings.fitToFrame ? "ON" : "off"} onPress={() => setSettings((x) => ({ ...x, fitToFrame: !x.fitToFrame }))} accent={settings.fitToFrame} />
        <Pressable onPress={capture} disabled={shutterDisabled} style={[s.shutter, sequence && { borderColor: SEQ_COLOR }, shutterDisabled && { opacity: 0.4 }]}>
          {busy === "capture" ? <ActivityIndicator color="#000" /> : <View style={[s.shutterInner, sequence && { backgroundColor: SEQ_COLOR }]} />}
        </Pressable>
        <Ctl label="Light" value={torch ? "ON" : "off"} onPress={() => setTorch((t) => !t)} accent={torch} />
        <Ctl label="Seq" value={sequence ? `${sequence.photos.length}` : "off"} onPress={() => void toggleSequence()} color={sequence ? SEQ_COLOR : undefined} />
        <Ctl label="Uploads" value={pendingCount ? `${pendingCount}` : "✓"} onPress={() => void retryUploads()} />
      </View>

      <ShotReview draft={draft} settings={settings} locations={locations} countAt={countAt} onUpload={(t, l) => void uploadDraft(t, l)} onDiscard={discardDraft} />
      <PresetSheet visible={sheet === "rig"} onClose={() => setSheet(null)} presets={presets} activeId={active?.id ?? null}
        onChange={(p, id) => { setPresets(p); setActiveId(id); }} />
      <LensSheet visible={sheet === "lens"} onClose={() => setSheet(null)} lensMm={lensMm} onChange={setLensMm} range={lensRange} />
    </View>
  );
}

function Ctl({ label, value, onPress, accent, color }: { label: string; value: string; onPress: () => void; accent?: boolean; color?: string }) {
  return (
    <Pressable onPress={onPress} style={s.ctl} hitSlop={6}>
      <Text style={[s.ctlValue, accent && { color: colors.accent }, color ? { color } : null]}>{value}</Text>
      <Text style={[s.ctlLabel, color ? { color } : null]}>{label}</Text>
    </Pressable>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  msg: { color: colors.text, fontSize: 16, textAlign: "center", marginBottom: 16 },
  primary: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: "#000", fontWeight: "600" },
  previewArea: { alignItems: "center", justifyContent: "center" },
  hud: { position: "absolute", top: 10, left: 10, right: 10, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 8 },
  hudProject: { color: colors.accent, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  hudMain: { color: "#fff", fontSize: 14, fontWeight: "600" },
  hudSub: { color: "#ddd", fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] },
  hudWarn: { color: colors.accent, fontSize: 12, marginTop: 4 },
  seqBadge: { position: "absolute", bottom: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: SEQ_COLOR, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  seqDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: SEQ_COLOR },
  seqText: { color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  toast: { position: "absolute", bottom: 16, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  toastText: { color: "#fff" },
  controls: { backgroundColor: colors.bg, alignItems: "center", justifyContent: "space-evenly" },
  ctl: { alignItems: "center", minWidth: 44 },
  ctlValue: { color: colors.text, fontSize: 17, fontWeight: "600" },
  ctlLabel: { color: colors.dim, fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
});
