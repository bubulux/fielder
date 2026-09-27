import { useEffect, useState } from "react";
import { Alert, ScrollView, Share, Switch, Text, View } from "react-native";
import { onAuthChange, setToken, signedInEmail } from "../auth";
import { API_URL, isConfigured } from "../config";
import { clearLog, logCount, logText, setLogging } from "../log";
import { PHONE } from "../phone";
import { store, usePendingCount } from "../storage";
import type { ProjectEntry, Settings } from "../types";
import { discardPending, flush } from "../uploads";
import { Button, Chip, ChipRow, colors, Hint, Input, Row } from "../components/ui";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  /** Active project (every capture goes there). */
  project: ProjectEntry | null;
  onSwitchProject: () => void;
  onSignIn: () => void;
}

const BORDER_COLORS = ["#FFFFFF", "#FFB300", "#00E676", "#00B0FF", "#FF3B30", "#000000"];
const TINTS: { label: string; value: string }[] = [
  { label: "Red 50%", value: "rgba(255,0,0,0.5)" },
  { label: "Black 60%", value: "rgba(0,0,0,0.6)" },
  { label: "Black 85%", value: "rgba(0,0,0,0.85)" },
  { label: "White 50%", value: "rgba(255,255,255,0.5)" },
];
const HUMAN_STEPS = [35, 43, 50];

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: colors.text, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

/** The Setup tab: project, capture behaviour, overlay look, account, uploads, debug log. */
export function Setup({ settings, onChange, project, onSwitchProject, onSignIn }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const pendingCount = usePendingCount();
  const [authEmail, setAuthEmail] = useState<string | null>(() => signedInEmail());
  useEffect(() => onAuthChange(() => setAuthEmail(signedInEmail())), []);
  const [entries, setEntries] = useState(() => logCount());
  const buildInfo = `API: ${isConfigured ? API_URL.replace(/^https?:\/\//, "") : "not configured"}`;

  async function retryUploads() {
    const r = await flush({ includeStuck: true });
    Alert.alert("Uploads", r.remaining === 0 ? "All uploaded." : `${r.remaining} still pending${r.lastError ? `: ${r.lastError}` : ""}`);
  }
  async function shareLog() {
    const pending = store.loadPending();
    const text = logText({
      exported: new Date().toISOString(),
      phone: PHONE.model,
      build: buildInfo,
      project: project ? `${project.name} (${project.id})` : "none",
      signedIn: authEmail ?? "no",
      pending: pending.map((p) => ({ shot: p.metadata.id, photos: p.metadata.photos.length, attempts: p.attempts, lastError: p.lastError })),
      settings,
    });
    await Share.share({ message: text, title: "Fielder debug log" });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 8 }}>Setup</Text>
      <Row label="Project">
        <Text style={{ color: colors.text, fontSize: 16 }}>{project?.name ?? "None selected"}</Text>
        <Button label="Switch project" kind="ghost" onPress={onSwitchProject} />
        <Hint>Every shot you take goes into this project.</Hint>
      </Row>
      <Row label="Capture">
        <Toggle label="Upload directly (skip the tag form)" value={settings.directUpload} onChange={(v) => set("directUpload", v)} />
        <Hint>Every shot, or every finished sequence, goes straight into the upload queue without tags. Name and tag them later in the dashboard.</Hint>
      </Row>
      <Row label="Human view button">
        <ChipRow>
          <Chip label="Cycle 35 → 43 → 50 → off" selected={settings.humanViewButton === "cycle"} onPress={() => set("humanViewButton", "cycle")} />
          <Chip label="Toggle off ↔ one value" selected={settings.humanViewButton === "toggle"} onPress={() => set("humanViewButton", "toggle")} />
        </ChipRow>
        <View style={{ marginTop: 8 }}>
          <ChipRow>
            {HUMAN_STEPS.map((mm) => <Chip key={mm} label={`${mm} mm-eq`} selected={settings.humanViewFocalMm === mm} onPress={() => set("humanViewFocalMm", mm)} />)}
          </ChipRow>
        </View>
        <Hint>The value above is what the button toggles to (and where a cycle starts). The cyan frame shows roughly what a person sees: 43–50 mm full-frame-equivalent is the film convention for the region of attention, 35 mm a wider take.</Hint>
      </Row>
      <Row label={`${PHONE.model} main camera, 35mm-equivalent`}>
        <Input
          value={String(settings.phoneEquivalentFocalMm)}
          onChangeText={(t) => { const v = Number(t.replace(",", ".")); if (Number.isFinite(v) && v > 5 && v < 200) set("phoneEquivalentFocalMm", v); }}
          keyboardType="decimal-pad"
        />
        <Hint>Spec-sheet value is {PHONE.mainCameraEquivalentFocalMm} mm. Only change this if the overlay is measurably off against a real camera; a smaller value makes the frame smaller on screen.</Hint>
        {settings.phoneEquivalentFocalMm !== PHONE.mainCameraEquivalentFocalMm && (
          <Button label={`Reset to ${PHONE.mainCameraEquivalentFocalMm} mm`} kind="ghost" onPress={() => set("phoneEquivalentFocalMm", PHONE.mainCameraEquivalentFocalMm)} />
        )}
      </Row>
      <Row label="Rig orientation">
        <ChipRow>
          <Chip label="Landscape" selected={settings.rigOrientation === "landscape"} onPress={() => set("rigOrientation", "landscape")} />
          <Chip label="Portrait" selected={settings.rigOrientation === "portrait"} onPress={() => set("rigOrientation", "portrait")} />
        </ChipRow>
      </Row>
      <Row label="Screen orientation on launch">
        <ChipRow>
          <Chip label="Auto" selected={settings.orientationLock === "auto"} onPress={() => set("orientationLock", "auto")} />
          <Chip label="Lock landscape" selected={settings.orientationLock === "landscape"} onPress={() => set("orientationLock", "landscape")} />
          <Chip label="Lock portrait" selected={settings.orientationLock === "portrait"} onPress={() => set("orientationLock", "portrait")} />
        </ChipRow>
        <Hint>Locks the whole app to that orientation, so it opens ready to shoot. Applies immediately.</Hint>
      </Row>
      <Row label="Live view">
        <Toggle label="Info overlay (rig, focal length, FOV, GPS, warnings)" value={settings.hudEnabled} onChange={(v) => set("hudEnabled", v)} />
        <Toggle label="Fit to frame (digital zoom)" value={settings.fitToFrame} onChange={(v) => set("fitToFrame", v)} />
        <Hint>Fit scales the live image so the rig frame fills the screen. Purely digital, so it gets soft with long lenses. Also available as the Fit button.</Hint>
      </Row>
      <Row label="Frame border">
        <ChipRow>
          {BORDER_COLORS.map((c) => <Chip key={c} label={c === settings.borderColor ? "● " + c : c} selected={c === settings.borderColor} onPress={() => set("borderColor", c)} />)}
        </ChipRow>
        <View style={{ marginTop: 8 }}>
          <ChipRow>
            {[1, 2, 3, 4, 6].map((w) => <Chip key={w} label={`${w} px`} selected={w === settings.borderWidthPx} onPress={() => set("borderWidthPx", w)} />)}
          </ChipRow>
        </View>
      </Row>
      <Row label="Blackout outside frame">
        <Toggle label="Enabled" value={settings.blackoutEnabled} onChange={(v) => set("blackoutEnabled", v)} />
        <ChipRow>
          {TINTS.map((t) => <Chip key={t.value} label={t.label} selected={t.value === settings.blackoutColor} onPress={() => set("blackoutColor", t.value)} />)}
        </ChipRow>
      </Row>
      <Row label="Account">
        <Text style={{ color: colors.text }}>{authEmail ? `Signed in as ${authEmail}` : "Not signed in: shots stay on the phone until you sign in."}</Text>
        {authEmail ? <Button label="Sign out" kind="ghost" onPress={() => setToken(null)} /> : <Button label="Sign in with email PIN" onPress={onSignIn} />}
        <Hint>Same login as the web dashboard (Cloudflare Access one-time PIN). The session lasts up to 30 days.</Hint>
      </Row>
      <Row label="Uploads">
        <Text style={{ color: colors.text }}>{pendingCount === 0 ? "All shots uploaded." : `${pendingCount} shot(s) waiting for upload.`}</Text>
        {pendingCount > 0 && <Button label="Retry now" kind="ghost" onPress={() => void retryUploads()} />}
        {store.loadPending().filter((p) => p.stuck).map((p) => (
          <View key={p.metadata.id} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 10 }}>
            <Text style={{ color: colors.text }}>{p.metadata.name ?? "Untitled shot"} · {p.metadata.photos.length} photo(s)</Text>
            <Text style={{ color: colors.danger, fontSize: 12, marginTop: 2 }}>Rejected by the server: {p.lastError ?? "unknown error"}</Text>
            <Hint>Kept on the phone. "Retry now" tries it again; share the debug log if it keeps failing.</Hint>
            <Button label="Discard this shot" kind="danger" onPress={() => Alert.alert("Discard shot", "Deletes the queued photos from the phone.", [{ text: "Cancel", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => discardPending(p.metadata.id) }])} />
          </View>
        ))}
      </Row>
      <Row label="Debug log">
        <Toggle label="Record a detailed log" value={settings.loggingEnabled} onChange={(v) => { setLogging(v); set("loggingEnabled", v); setEntries(logCount()); }} />
        <Hint>Turn on, reproduce the problem, then share the log (e.g. to yourself or a chat with an AI agent). Records API calls, uploads, GPS, captures and errors; no photos. {entries} entries stored.</Hint>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Button label="Share log" kind="ghost" onPress={() => void shareLog()} disabled={entries === 0 && !settings.loggingEnabled} /></View>
          <View style={{ flex: 1 }}><Button label="Clear" kind="danger" onPress={() => { clearLog(); setEntries(0); }} /></View>
        </View>
      </Row>
      <Row label="Build"><Text style={{ color: colors.dim, fontSize: 12 }}>{buildInfo}</Text></Row>
    </ScrollView>
  );
}
