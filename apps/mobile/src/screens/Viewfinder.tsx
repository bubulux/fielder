import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { API_URL, isConfigured } from "../config";
import { computeOverlay, formatDeg, previewBox, type Box } from "../framing";
import { PHONE } from "../phone";
import { store } from "../storage";
import { lensRangeOf, type Preset, type Settings, type ShotMetadata } from "../types";
import { enqueue, flush } from "../uploads";
import { syncPresets } from "../presetSync";
import { LensCarousel } from "../components/LensCarousel";
import { clampToRange } from "../lens";
import { LensSheet } from "../components/LensSheet";
import { HUMAN_COLOR, Overlay } from "../components/Overlay";
import { PresetSheet } from "../components/PresetSheet";
import { SettingsSheet } from "../components/SettingsSheet";
import { colors } from "../components/ui";

const CONTROLS_SIZE = 104;
const LENS_STRIP = 72;
/** Minimum clearance between the lens strip and the screen edge (camera cutout in landscape). */
const EDGE_PAD = 32;
const MAX_UPLOAD_EDGE = 1280;

type Sheet = "rig" | "lens" | "settings" | null;

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  /** Whether this tab is on screen; the camera is released otherwise. */
  active: boolean;
}

export function Viewfinder({ settings, onSettings, active: tabActive }: Props) {
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
  const [pendingCount, setPendingCount] = useState(() => store.loadPending().length);

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
  useEffect(() => {
    if (!isConfigured) return;
    void (async () => {
      // Rigs live on the server; pull the authoritative list after pushing offline edits.
      const server = await syncPresets(store.loadPresets());
      if (server) {
        setPresets(server);
        setActiveId((cur) => (cur && server.some((p) => p.id === cur) ? cur : server[0]?.id ?? null));
      }
      const r = await flush();
      setPendingCount(r.remaining);
    })();
  }, []);

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
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 8000));
    const pos = await Promise.race([fresh.catch(() => null), timeout]);
    return pos ?? (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }));
  }

  async function capture() {
    if (!camera.current || !cameraReady || busy || !active || !overlay) return;
    setBusy("capture");
    try {
      const [pos, pic] = await Promise.all([
        getPosition(),
        camera.current.takePictureAsync({ quality: 0.7, exif: true, skipProcessing: false }),
      ]);
      if (!pos) {
        Alert.alert("No GPS position", "Could not get a location fix. The shot was not saved.");
        return;
      }
      const landscapePic = pic.width >= pic.height;
      const rendered = await ImageManipulator.manipulate(pic.uri)
        .resize(landscapePic ? { width: Math.min(MAX_UPLOAD_EDGE, pic.width) } : { height: Math.min(MAX_UPLOAD_EDGE, pic.height) })
        .renderAsync();
      const small = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });

      const exif = (pic.exif ?? {}) as Record<string, unknown>;
      const metadata: ShotMetadata = {
        id: Crypto.randomUUID(),
        timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        lens_mm: lensMm,
        preset_id: active.synced ? active.id : null,
        extra_metadata: {
          schema: 1,
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
            frame: { width_fraction: round4(overlay.fractions.width), height_fraction: round4(overlay.fractions.height) },
          },
          phone: {
            model: PHONE.model,
            equivalent_focal_mm: settings.phoneEquivalentFocalMm,
            exif_focal_length: exif.FocalLength ?? null,
            exif_focal_length_35mm: exif.FocalLengthIn35mmFilm ?? null,
            exif_model: exif.Model ?? null,
          },
          gps: { accuracy_m: pos.coords.accuracy ?? null, altitude_m: pos.coords.altitude ?? null, heading_deg: pos.coords.heading ?? null },
          image: { width: small.width, height: small.height },
        },
      };
      enqueue(metadata, small.uri);
      if (!active.synced) {
        // Preset unknown to the server: try once more now so the FK can be set on the row later.
        try { await api.putPreset(active); setPresets((c) => c.map((x) => (x.id === active.id ? { ...x, synced: true } : x))); } catch { /* snapshot in extra_metadata still preserves it */ }
      }
      const r = await flush();
      setPendingCount(r.remaining);
      showToast(r.remaining === 0 ? "Saved & uploaded" : `Saved locally (${r.remaining} pending)`);
    } catch (err) {
      Alert.alert("Capture failed", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function retryUploads() {
    const r = await flush();
    setPendingCount(r.remaining);
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
    <LensCarousel lensMm={lensMm} onChange={setLensMm} vertical={!portrait} length={portrait ? window.width : window.height} range={lensRange} />
  );

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
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
            />
          )}
          {overlay && <Overlay preview={preview} rect={overlay.rect} settings={settings} exceedsPreview={overlay.exceedsPreview} human={overlay.human} />}
          {/* HUD */}
          <View style={s.hud} pointerEvents="none">
            {active && overlay ? (
              <>
                <Text style={s.hudMain}>{active.name} · {lensMm} mm{active.speedboosterFactor !== 1 ? ` ×${active.speedboosterFactor}` : ""}</Text>
                <Text style={s.hudSub}>
                  {round(overlay.framing.effectiveFocalLengthMm)} mm eff · {round(overlay.framing.fullFrameEquivalentMm)} mm FF-eq · {formatDeg(overlay.framing.fov.horizontal)} × {formatDeg(overlay.framing.fov.vertical)}
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
          </View>
          {toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}
        </View>
      </View>

      {portrait && lensStrip}
      <View style={[s.controls, portrait ? { height: CONTROLS_SIZE, flexDirection: "row" } : { width: CONTROLS_SIZE, flexDirection: "column" }]}>
        <Ctl label="Rig" value={active ? "●" : "＋"} onPress={() => setSheet("rig")} />
        <Ctl label="Custom" value={`${lensMm}`} onPress={() => setSheet("lens")} />
        <Ctl label="Fit" value={settings.fitToFrame ? "ON" : "off"} onPress={() => setSettings((x) => ({ ...x, fitToFrame: !x.fitToFrame }))} accent={settings.fitToFrame} />
        <Pressable onPress={capture} disabled={!!busy || !active || !cameraReady} style={[s.shutter, (!!busy || !active || !cameraReady) && { opacity: 0.4 }]}>
          {busy === "capture" ? <ActivityIndicator color="#000" /> : <View style={s.shutterInner} />}
        </Pressable>
        <Ctl label="Uploads" value={pendingCount ? `${pendingCount}` : "✓"} onPress={() => void retryUploads()} />
        <Ctl label="Setup" value="⚙" onPress={() => setSheet("settings")} />
      </View>

      <PresetSheet visible={sheet === "rig"} onClose={() => setSheet(null)} presets={presets} activeId={active?.id ?? null}
        onChange={(p, id) => { setPresets(p); setActiveId(id); }} />
      <LensSheet visible={sheet === "lens"} onClose={() => setSheet(null)} lensMm={lensMm} onChange={setLensMm} range={lensRange} />
      <SettingsSheet visible={sheet === "settings"} onClose={() => setSheet(null)} settings={settings} onChange={setSettings}
        pendingCount={pendingCount} onRetryUploads={() => void retryUploads()}
        buildInfo={`API: ${isConfigured ? API_URL.replace(/^https?:\/\//, "") : "not configured"}`} />
    </View>
  );
}

function Ctl({ label, value, onPress, accent }: { label: string; value: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={s.ctl} hitSlop={8}>
      <Text style={[s.ctlValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={s.ctlLabel}>{label}</Text>
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
  hudMain: { color: "#fff", fontSize: 14, fontWeight: "600" },
  hudSub: { color: "#ddd", fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] },
  hudWarn: { color: colors.accent, fontSize: 12, marginTop: 4 },
  toast: { position: "absolute", bottom: 16, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  toastText: { color: "#fff" },
  controls: { backgroundColor: colors.bg, alignItems: "center", justifyContent: "space-evenly" },
  ctl: { alignItems: "center", minWidth: 56 },
  ctlValue: { color: colors.text, fontSize: 18, fontWeight: "600" },
  ctlLabel: { color: colors.dim, fontSize: 11, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
});
