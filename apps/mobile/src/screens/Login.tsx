import { useState, type ComponentType } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { setToken } from "../auth";
import { Banner, Header, Hint } from "../components/ui";
import { makeStyles, type, useTheme } from "../theme";
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
  const s = useStyles();
  const { c } = useTheme();
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
        <Header title="Sign in" right={<Pressable onPress={onSkip} style={s.skip} accessibilityRole="button"><Text style={s.skipText}>Later</Text></Pressable>} />
        <View style={{ padding: 16, gap: 8 }}>
          <Hint>Enter your email, then the PIN from the mail. Without signing in, shots stay on the phone until you do.</Hint>
          {error && <Banner kind="danger" title={error} />}
        </View>
        <WebView
          key={visible ? "open" : "closed"}
          source={{ uri: `${API_URL}/auth/mobile` }}
          onMessage={onMessage}
          incognito
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: c.bg }}
        />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  skip: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10 },
  skipText: { ...type("body", "bold"), color: c.accent },
}));
