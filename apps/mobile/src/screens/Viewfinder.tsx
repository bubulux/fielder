import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Shot } from "../api";
import { isSignedIn, onAuthChange, signedInEmail } from "../auth";
import { isConfigured } from "../config";
import { computeOverlay, formatDeg, previewBox, type Box } from "../framing";
import { log } from "../log";
import { PHONE } from "../phone";
import { addToSequence, deleteDraftFiles, keepPhoto, restoreDraft, startSequence } from "../sequence";
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
import { Button, Empty, Icon, SeqBadge } from "../components/ui";
import { FIXED, makeStyles, num, RADIUS, SIZE, type, useTheme } from "../theme";

/** Control panel: lens strip + two rows in portrait, a right-hand panel in landscape. */
const CONTROLS_H = 68 + 56 + 10 + SIZE.shutter + 20;
const CONTROLS_W = 2 * 56 + 8 + 18;
const LENS_STRIP = 76;
/** Minimum clearance between the lens strip and the screen edge (camera cutout in landscape). */
const EDGE_PAD = 32;
const MAX_UPLOAD_EDGE = 1280;
const HUMAN_STEPS = [35, 43, 50];
/** A watched GPS fix younger than this is used as is; otherwise the capture waits briefly for a fresh one. */
const FIX_MAX_AGE_MS = 15_000;

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
  const s = useStyles();
  const { c, name: themeName } = useTheme();
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
  /** Any queued shot the server keeps rejecting (re-read when the queue changes or a flush reports back). */
  const [stuck, setStuck] = useState(() => store.loadPending().some((p) => p.stuck));
  useEffect(() => { setStuck(store.loadPending().some((p) => p.stuck)); }, [pendingCount, toast]);
  /** Capture or finished sequence waiting in the tag form. */
  const [draft, setDraft] = useState<CaptureDraft | null>(() => restoreDraft(store.loadCaptureDraft()));
  /** Sequence mode: on while non-null; resumes after an app restart. */
  const [sequence, setSequence] = useState<CaptureDraft | null>(() => store.loadSequence());
  /** Mirrors `sequence` for code that runs across awaits (a capture can wait seconds for GPS). */
  const sequenceRef = useRef<CaptureDraft | null>(sequence);
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
    ? { width: window.width, height: Math.max(0, window.height - CONTROLS_H) }
    : { width: Math.max(0, window.width - CONTROLS_W - LENS_STRIP - lensPad), height: window.height };
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
    const seqAtStart = sequenceRef.current?.shotId ?? null;
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
      try { new File(pic.uri).delete(); } catch { /* full-size camera temp file */ }

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
      log("info", "capture", { lens: lensMm, rig: active.name, gps_accuracy_m: meta.gps_accuracy_m, sequence: !!seqAtStart, direct: settings.directUpload });
      if (!active.synced) {
        // Preset unknown to the server: try once more now so the FK can be set on the row later.
        try { await api.putPreset(active); setPresets((c) => c.map((x) => (x.id === active.id ? { ...x, synced: true } : x))); } catch { /* the framing snapshot on the photo still preserves it */ }
      }
      const photo: DraftPhoto = { uri: small.uri, meta, frame };
      // Joins the sequence only if the one that was on when the shutter fired is still on.
      const seq = sequenceRef.current;
      if (seqAtStart && seq && seq.shotId === seqAtStart) {
        const next = addToSequence(seq, photo);
        sequenceRef.current = next;
        setSequence(next);
        showToast(`Sequence · ${next.photos.length} photo${next.photos.length === 1 ? "" : "s"}`);
      } else {
        const single: CaptureDraft = { shotId: Crypto.randomUUID(), photos: [keepPhoto(photo)] };
        if (settings.directUpload) finishDraft(single);
        else openDraft(single); // nothing is queued until the user taps Upload
      }
    } catch (err) {
      log("error", "capture failed", err);
      Alert.alert("Capture failed", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /** Show a draft in the tag form; it is stored so it reopens after an app restart. */
  function openDraft(d: CaptureDraft) {
    store.saveCaptureDraft(d);
    setDraft(d);
  }

  /** Direct upload: queue without tags; if that fails the draft opens in the form instead of being lost. */
  function finishDraft(d: CaptureDraft) {
    store.saveCaptureDraft(d);
    if (queueDraft(d, NO_TAGS, null)) store.saveCaptureDraft(null);
    else setDraft(d);
  }

  /** Queue a capture or sequence as one shot of the active project; the upload runs in the background. */
  function queueDraft(d: CaptureDraft, tags: ShotTags, newLocation: LocationEntry | null): boolean {
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
    showToast("Saved, uploading…");
    void flush().then((r) => {
      onLocations(store.loadLocations());
      showToast(r.remaining === 0 ? "Uploaded" : `Saved on the phone (${r.remaining} pending)`);
    });
    return true;
  }

  function uploadDraft(tags: ShotTags, newLocation: LocationEntry | null) {
    if (!draft) return;
    if (queueDraft(draft, tags, newLocation)) { store.saveCaptureDraft(null); setDraft(null); }
  }

  function discardDraft() {
    if (draft) { deleteDraftFiles(draft); log("info", "draft discarded", { shot: draft.shotId, photos: draft.photos.length }); }
    store.saveCaptureDraft(null);
    setDraft(null);
  }

  function toggleSequence() {
    const d = sequenceRef.current;
    if (!d) {
      const started = startSequence();
      sequenceRef.current = started;
      setSequence(started);
      showToast("Sequence on: every shot joins one set");
      return;
    }
    sequenceRef.current = null;
    setSequence(null);
    log("info", "sequence end", { shot: d.shotId, photos: d.photos.length });
    if (d.photos.length === 0) { store.saveSequence(null); showToast("Sequence off"); return; }
    // Store the finished sequence as the draft before forgetting it as the running sequence.
    store.saveCaptureDraft(d);
    store.saveSequence(null);
    if (settings.directUpload) finishDraft(d);
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
    const r = await flush({ includeStuck: true });
    showToast(r.remaining === 0 ? "All uploaded" : `${r.remaining} still pending${r.lastError ? `: ${r.lastError}` : ""}`);
  }

  if (!camPerm) return <View style={s.root} onLayout={onLayout} />;
  if (!camPerm.granted) {
    return (
      <View style={[s.root, s.center, { backgroundColor: c.bg }]}>
        <Empty icon="camera-off" title="Camera access needed" body="Fielder uses the camera as a viewfinder for your rig's frame.">
          <Button label="Grant camera access" icon="camera-iris" onPress={() => void requestCamPerm()} />
        </Empty>
      </View>
    );
  }

  const lensStrip = (
    <LensCarousel lensMm={lensMm} onChange={setLensMm} vertical={!portrait} length={portrait ? window.width : window.height} range={lensRange} onPressValue={() => setSheet("lens")} />
  );
  const shutterDisabled = !!busy || !active || !cameraReady || !project;

  const gpsWarn = gpsAccuracy == null || gpsAccuracy > 20;
  const cycleTheme = () => setSettings((x) => ({ ...x, theme: themeName === "sun" ? "set" : "sun" }));

  // Rig · Human · Fit · Light, then Seq · Shutter · Uploads in the thumb zone (a right-hand panel in landscape).
  const small = (
    <>
      <VfButton icon="camera-control" label="Rig" onPress={() => setSheet("rig")} warn={!active} />
      <VfButton icon="human-male" label={settings.humanViewEnabled ? `Human ${settings.humanViewFocalMm}` : "Human"} onPress={pressHuman} on={settings.humanViewEnabled} />
      <VfButton icon="fit-to-screen-outline" label="Fit" onPress={() => setSettings((x) => ({ ...x, fitToFrame: !x.fitToFrame }))} on={settings.fitToFrame} />
      <VfButton icon={torch ? "flashlight" : "flashlight-off"} label="Light" onPress={() => setTorch((t) => !t)} on={torch} />
    </>
  );
  const shutter = (
    <Pressable onPress={capture} disabled={shutterDisabled} accessibilityRole="button" accessibilityLabel={sequence ? `Capture into sequence (${sequence.photos.length})` : "Capture"}
      style={[s.shutter, sequence && s.shutterSeq, shutterDisabled && !busy && s.shutterOff]}>
      {({ pressed }) => busy === "capture"
        ? <ActivityIndicator color={c.chromeText} size="large" />
        : <View style={[s.disc, pressed && s.discPressed, sequence && { backgroundColor: FIXED.record }, shutterDisabled && { backgroundColor: "transparent" }]}>
            {sequence ? <Text style={s.discText}>{sequence.photos.length}</Text> : shutterDisabled ? <Icon name="close" size={28} color={c.textDisabled} /> : null}
          </View>}
    </Pressable>
  );
  const big = (
    <>
      <VfButton icon="layers-triple-outline" label={sequence ? `Seq ${sequence.photos.length}` : "Seq"} onPress={toggleSequence} disabled={!!busy} on={!!sequence} record={!!sequence} />
      {shutter}
      <VfButton icon="cloud-upload-outline" label="Uploads" onPress={() => void retryUploads()} count={pendingCount} stuck={stuck} />
    </>
  );

  return (
    <View style={[s.root, { flexDirection: portrait ? "column" : "row" }]} onLayout={onLayout}>
      <StatusBar hidden />
      {!portrait && <View style={{ paddingLeft: lensPad, backgroundColor: c.chromeBg }}>{lensStrip}</View>}
      <View style={[s.previewArea, { width: area.width, height: area.height }]}>
        <View style={{ width: preview.width, height: preview.height, backgroundColor: FIXED.photoBg, overflow: "hidden" }}>
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
          {/* HUD: solid chips, never translucent text on the image. Can be hidden in Setup; the "no rig" hint always shows. */}
          <View style={s.hud} pointerEvents="box-none">
            <View style={s.hudChips} pointerEvents="none">
              {(settings.hudEnabled || !active) && (active && overlay ? (
                <>
                  {project ? <Hud icon="folder-outline">{project.name}</Hud> : <Hud icon="folder-alert-outline" kind="danger">No project</Hud>}
                  <Hud icon="camera-outline">{active.name} · {lensMm} mm{active.speedboosterFactor !== 1 ? ` ×${active.speedboosterFactor}` : ""}</Hud>
                  <Hud icon="angle-acute">{round(overlay.framing.fullFrameEquivalentMm)} mm FF · {formatDeg(overlay.framing.fov.horizontal)} × {formatDeg(overlay.framing.fov.vertical)}</Hud>
                  <Hud icon={gpsWarn ? "crosshairs-question" : "crosshairs-gps"} kind={gpsWarn ? "warn" : undefined}>{gpsAccuracy == null ? "GPS searching…" : `GPS ±${Math.round(gpsAccuracy)} m`}</Hud>
                  {overlay.exceedsPreview && <Hud icon="arrow-expand-all" kind="warn">Rig sees more than the phone: live image shrunk; black = outside the phone's view</Hud>}
                  {settings.fitToFrame && !overlay.exceedsPreview && <Hud icon="fit-to-screen-outline">Fit: digital zoom ×{(overlay.camera.width / preview.width).toFixed(2)}</Hud>}
                  {overlay.human && (
                    <Hud icon="human-male" iconColor={HUMAN_COLOR}>
                      {overlay.human.relation === "equal"
                        ? `Rig matches the human view (${overlay.human.focalMm} mm-eq)`
                        : overlay.human.relation === "wider"
                          ? `Rig is wider than the human view (${overlay.human.focalMm} mm-eq): cyan frame inside`
                          : `Rig is narrower than the human view (${overlay.human.focalMm} mm-eq)${overlay.human.fits ? ": cyan frame around it" : "; the cyan frame is outside the preview"}`}
                    </Hud>
                  )}
                </>
              ) : (
                <Hud icon="camera-control" kind="warn">No rig selected. Tap "Rig" to create one.</Hud>
              ))}
              {!isConfigured && <Hud icon="cloud-off-outline" kind="warn">Build has no API configuration; shots stay on device.</Hud>}
              {isConfigured && !authEmail && <Hud icon="account-circle-outline" kind="warn">Not signed in: shots stay on the phone. Sign in via Setup.</Hud>}
            </View>
            <Pressable onPress={cycleTheme} style={({ pressed }) => [s.themeBtn, pressed && { backgroundColor: c.accent }]} accessibilityRole="button"
              accessibilityLabel={`Theme: ${themeName === "sun" ? "Sun" : "Set"}${settings.theme === "auto" ? " (following the phone)" : ""}. Tap to switch.`}>
              <Icon name={themeName === "sun" ? "white-balance-sunny" : "weather-night"} size={22} color={c.chromeText} />
              <View>
                <Text style={s.themeText}>{themeName === "sun" ? "Sun" : "Set"}</Text>
                {settings.theme === "auto" && <Text style={s.themeAuto}>AUTO</Text>}
              </View>
            </Pressable>
          </View>
          {sequence && <View style={s.seqBadge} pointerEvents="none"><SeqBadge count={sequence.photos.length} recording /></View>}
          {toast && <View style={s.toast} pointerEvents="none"><Icon name="check-circle" size={20} color={c.ok} /><Text style={s.toastText}>{toast}</Text></View>}
        </View>
      </View>

      {portrait ? (
        <View style={s.panel}>
          {lensStrip}
          <View style={s.rowSmall}>{small}</View>
          <View style={s.rowBig}>{big}</View>
        </View>
      ) : (
        <View style={[s.panel, s.panelSide, { width: CONTROLS_W }]}>
          <View style={s.grid}>{small}</View>
          <View style={s.colBig}>{big}</View>
        </View>
      )}

      <ShotReview draft={draft} settings={settings} locations={locations} countAt={countAt} fields={draft ? store.fieldsForProject(project?.id) : []} onUpload={uploadDraft} onDiscard={discardDraft} />
      <PresetSheet visible={sheet === "rig"} onClose={() => setSheet(null)} presets={presets} activeId={active?.id ?? null}
        onChange={(p, id) => { setPresets(p); setActiveId(id); }} />
      <LensSheet visible={sheet === "lens"} onClose={() => setSheet(null)} lensMm={lensMm} onChange={setLensMm} range={lensRange} />
    </View>
  );
}

/** Solid HUD chip over the camera image (chrome colours, or warn / danger fills). */
function Hud({ icon, kind, iconColor, children }: { icon: string; kind?: "warn" | "danger"; iconColor?: string; children: ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  const fg = kind === "warn" ? c.onWarn : kind === "danger" ? FIXED.white : c.chromeText;
  return (
    <View style={[s.hudChip, kind === "warn" && s.hudWarn, kind === "danger" && s.hudDanger]}>
      <Icon name={icon} size={17} color={iconColor ?? fg} />
      <Text style={[s.hudText, { color: fg }]}>{children}</Text>
    </View>
  );
}

/** Viewfinder control: icon over label, 56 dp, opaque. On = accent fill + heavy label. */
function VfButton({ icon, label, onPress, on, disabled, count, stuck, record, warn }: { icon: string; label: string; onPress: () => void; on?: boolean; disabled?: boolean; count?: number; stuck?: boolean; record?: boolean; warn?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const bg = record ? FIXED.record : on ? c.accent : c.chromeBg;
  const fg = disabled ? c.textDisabled : record ? FIXED.white : on ? c.onAccent : c.chromeText;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count} waiting` : label} accessibilityState={{ selected: !!on, disabled }}
      style={({ pressed }) => [s.vfBtn, { backgroundColor: bg, borderColor: record ? FIXED.white : on ? c.accent : c.chromeBorder }, warn && { borderColor: c.warn }, pressed && s.vfPressed, disabled && s.vfOff]}>
      <Icon name={icon} size={24} color={fg} />
      <Text style={[s.vfLabel, { color: fg }, on && s.vfLabelOn]} numberOfLines={1}>{label}</Text>
      {!!count && <Text style={[s.vfCount, stuck && s.vfCountStuck]}>{count}</Text>}
    </Pressable>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: FIXED.photoBg },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  previewArea: { alignItems: "center", justifyContent: "center" },
  hud: { position: "absolute", top: 8, left: 8, right: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  hudChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hudChip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", minHeight: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: c.chromeBg, borderWidth: 1.5, borderColor: c.chromeBorder },
  hudWarn: { backgroundColor: c.warn, borderColor: FIXED.black },
  hudDanger: { backgroundColor: FIXED.record, borderColor: FIXED.white },
  hudText: { ...type("hud", "bold"), ...num, flexShrink: 1 },
  themeBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, minWidth: 48, paddingHorizontal: 10, borderRadius: 6, backgroundColor: c.chromeBg, borderWidth: 1.5, borderColor: c.chromeBorder },
  themeText: { ...type("label", "bold"), color: c.chromeText },
  themeAuto: { fontFamily: type("caption", "heavy").fontFamily, fontSize: 9, lineHeight: 10, letterSpacing: 0.8, color: c.chromeText },
  seqBadge: { position: "absolute", bottom: 12, left: 12 },
  toast: { position: "absolute", bottom: 12, alignSelf: "center", maxWidth: "80%", flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.md, backgroundColor: c.surfaceRaised, borderWidth: 2, borderColor: c.borderStrong, elevation: 6 },
  toastText: { ...type("small", "semibold"), color: c.text, flexShrink: 1 },
  panel: { backgroundColor: c.chromeBg, borderColor: c.chromeBorder },
  panelSide: { borderLeftWidth: 2, paddingVertical: 10, paddingHorizontal: 8, justifyContent: "space-evenly", alignItems: "center", gap: 10 },
  rowSmall: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 10, paddingTop: 10 },
  rowBig: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, width: 2 * 56 + 8 },
  colBig: { alignItems: "center", gap: 10 },
  vfBtn: { width: 56, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 4, borderRadius: 10, borderWidth: 2 },
  vfPressed: { transform: [{ translateY: 1 }], borderColor: c.chromeText },
  vfOff: { borderStyle: "dashed", borderColor: c.textDisabled },
  vfLabel: { fontFamily: type("caption", "semibold").fontFamily, fontSize: 11, lineHeight: 13 },
  vfLabelOn: { fontFamily: type("caption", "heavy").fontFamily },
  vfCount: { position: "absolute", top: -8, right: -8, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, overflow: "hidden", backgroundColor: c.warn, color: c.onWarn, textAlign: "center", fontFamily: type("caption", "heavy").fontFamily, fontSize: 12, lineHeight: 22, borderWidth: 2, borderColor: c.chromeBg },
  vfCountStuck: { backgroundColor: FIXED.record, color: FIXED.white },
  shutter: { width: SIZE.shutter, height: SIZE.shutter, borderRadius: SIZE.shutter / 2, borderWidth: 4, borderColor: c.chromeText, backgroundColor: c.chromeBg, alignItems: "center", justifyContent: "center" },
  shutterSeq: { borderColor: FIXED.record, borderWidth: 5 },
  shutterOff: { borderStyle: "dashed", borderColor: c.textDisabled, borderWidth: 3 },
  disc: { width: 58, height: 58, borderRadius: 29, backgroundColor: c.chromeText, alignItems: "center", justifyContent: "center" },
  discPressed: { width: 52, height: 52, borderRadius: 26 },
  discText: { ...type("title", "heavy"), color: FIXED.white, ...num },
}));
