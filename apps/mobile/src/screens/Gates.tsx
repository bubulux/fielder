import { useState, type ComponentType } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { setToken } from "../auth";
import { API_URL } from "../config";
import { ActionBar } from "../components/chrome";
import { NewProjectSheet, projectMeta, type PickProject } from "../components/ProjectSheet";
import { Banner, Button, Empty, Hint, IconButton, ListRow, Mark } from "../components/ui";
import { makeStyles, type, useTheme } from "../theme";
import type { ProjectEntry } from "../types";

// react-native-webview's class typings collapse to `never` under this TS/React combination; use the props type directly.
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;

/** Full-screen gate on launch without a session and whenever a request finds it gone. Buttons at the thumb. */
export function SignInGate({ onSignIn, onSkip }: { onSignIn: () => void; onSkip: () => void }) {
  const s = useStyles();
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.gateBody}>
        <View style={s.brandRow}><Mark size={32} /><Text style={s.brand}>Fielder</Text></View>
        <Text style={s.gateTitle}>Sign in</Text>
        <Text style={s.gateText}>Same login as the dashboard: a one-time PIN by email. The session lasts up to 30 days.</Text>
      </ScrollView>
      <ActionBar edge style={{ flexDirection: "column" }}>
        <Button icon="login" label="Sign in with email PIN" onPress={onSignIn} />
        <Button kind="secondary" label="Continue without signing in" onPress={onSkip} />
        <Hint>Without signing in, shots stay on the phone.</Hint>
      </ActionBar>
    </View>
  );
}

/**
 * The server's Access login inside a WebView; the Worker's /auth/mobile page posts the Access
 * token back. We only frame it: spinner until the first load, an error state with Try again.
 */
export function LoginWeb({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { token?: string };
      if (m.token && m.token.split(".").length === 3) { setToken(m.token); onDone(); }
      else setError("The login page returned no token. Try again.");
    } catch { /* not our message */ }
  };
  return (
    <View style={s.root}>
      <View style={s.webHead}>
        <IconButton plain icon="close" label="Cancel sign-in" onPress={onCancel} />
        <Text style={s.webTitle}>Sign in</Text>
      </View>
      {error && <View style={{ padding: 12 }}><Banner kind="danger" title={error} /></View>}
      {failed ? (
        <Empty icon="cloud-alert" title="Couldn't reach the login page" body="Check the connection. Shots you take meanwhile stay on the phone.">
          <Button icon="refresh" label="Try again" onPress={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); }} />
        </Empty>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            source={{ uri: `${API_URL}/auth/mobile` }}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            incognito
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            style={{ flex: 1, backgroundColor: c.bg }}
          />
          {loading && <View style={s.spinner} pointerEvents="none"><ActivityIndicator size="large" color={c.text} /></View>}
        </View>
      )}
    </View>
  );
}

/** First launch (or the active project is gone): pick one before anything else. No close, no tab bar. */
export function ProjectGate({ projects, onPick }: { projects: ProjectEntry[]; onPick: PickProject }) {
  const s = useStyles();
  const [creating, setCreating] = useState(false);
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.gateBody}>
          <View style={s.brandRow}><Mark size={32} /><Text style={s.brand}>Fielder</Text></View>
          <Text style={s.gateTitle}>Pick a project</Text>
          <Text style={s.gateText}>Every shot goes into the active project. You can switch at any time from the header.</Text>
        </View>
        {projects.map((p) => <ListRow key={p.id} icon={p.synced ? "folder-outline" : "folder-sync-outline"} title={p.name} meta={projectMeta(p)} onPress={() => onPick(p.id, null)} />)}
        {projects.length === 0 && <View style={{ paddingHorizontal: 16 }}><Hint>No projects yet. Create the first one; it syncs once you are signed in.</Hint></View>}
      </ScrollView>
      <ActionBar edge>
        <Button style={{ flex: 1 }} icon="plus" label="New project" onPress={() => setCreating(true)} />
      </ActionBar>
      <NewProjectSheet visible={creating} projects={projects} onPick={(id, p) => { setCreating(false); onPick(id, p); }} onClose={() => setCreating(false)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  gateBody: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16, gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  brand: { ...type("title", "heavy"), color: c.text },
  gateTitle: { ...type("display", "heavy"), color: c.text },
  gateText: { ...type("body"), color: c.textDim },
  webHead: { height: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: c.surface, borderBottomWidth: 2, borderBottomColor: c.borderSubtle },
  webTitle: { ...type("title", "bold"), color: c.text },
  spinner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: c.bg },
}));
