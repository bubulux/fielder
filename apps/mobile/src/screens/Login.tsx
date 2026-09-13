import { useState, type ComponentType } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { setToken } from "../auth";
import { colors } from "../components/ui";
import { API_URL } from "../config";

// react-native-webview's class typings collapse to `never` under this TS/React combination; use the props type directly.
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;

interface Props { visible: boolean; onDone: () => void; onSkip: () => void }

/**
 * Sign-in with the same email one-time PIN as the web dashboard. Cloudflare Access
 * shows its login inside this WebView; the Worker's /auth/mobile page then posts
 * the Access token back to the app.
 */
export function Login({ visible, onDone, onSkip }: Props) {
  const [error, setError] = useState<string | null>(null);
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { token?: string; email?: string };
      if (m.token && m.token.split(".").length === 3) { setToken(m.token); onDone(); }
      else setError("Login page returned no token.");
    } catch { /* not our message */ }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onSkip}>
      <View style={s.root}>
        <View style={s.header}>
          <Text style={s.title}>Sign in</Text>
          <Pressable onPress={onSkip} hitSlop={10}><Text style={s.skip}>Later</Text></Pressable>
        </View>
        <Text style={s.hint}>Enter your email, then the PIN from the mail. Without signing in, shots stay on the phone until you do.</Text>
        {error && <Text style={[s.hint, { color: colors.danger }]}>{error}</Text>}
        <WebView
          key={visible ? "open" : "closed"}
          source={{ uri: `${API_URL}/auth/mobile` }}
          onMessage={onMessage}
          incognito
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  skip: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  hint: { color: colors.dim, fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
});
