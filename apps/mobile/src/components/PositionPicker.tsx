import { useMemo, useState, type ComponentType } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { Button, colors } from "./ui";

// react-native-webview's class typings collapse to `never` under this TS/React combination; use the props type directly.
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;

interface Props {
  visible: boolean;
  lat: number;
  lon: number;
  accuracyM: number | null;
  /** > 1 offers "move all photos of this shot". */
  photoCount: number;
  onSave: (lat: number, lon: number, allInShot: boolean) => void;
  onCancel: () => void;
}

/** Full-screen map with a draggable pin to correct where a photo was taken. */
export function PositionPicker({ visible, lat, lon, accuracyM, photoCount, onSave, onCancel }: Props) {
  const [pos, setPos] = useState<[number, number]>([lat, lon]);
  const [all, setAll] = useState(photoCount > 1);
  const html = useMemo(() => buildHtml(lat, lon, accuracyM), [lat, lon, accuracyM]);
  const moved = Math.abs(pos[0] - lat) > 1e-7 || Math.abs(pos[1] - lon) > 1e-7;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={s.root}>
        <View style={s.header}>
          <Text style={s.title}>Correct position</Text>
          <Pressable onPress={onCancel} hitSlop={12}><Text style={s.close}>Cancel</Text></Pressable>
        </View>
        <Text style={s.hint}>Drag the pin or tap the map where the photo was taken.</Text>
        <WebView
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://fielder.local/" }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          onMessage={(e: WebViewMessageEvent) => { const [a, b] = e.nativeEvent.data.split(",").map(Number); if (Number.isFinite(a) && Number.isFinite(b)) setPos([a, b]); }}
          javaScriptEnabled
          setSupportMultipleWindows={false}
        />
        <View style={s.footer}>
          {photoCount > 1 && (
            <View style={s.row}>
              <Text style={{ color: colors.text, flex: 1 }}>All {photoCount} photos of this shot</Text>
              <Switch value={all} onValueChange={setAll} trackColor={{ true: colors.accent }} />
            </View>
          )}
          <Text style={s.coords}>{pos[0].toFixed(6)}, {pos[1].toFixed(6)}</Text>
          <Button label="Save position" onPress={() => onSave(pos[0], pos[1], all)} disabled={!moved} />
        </View>
      </View>
    </Modal>
  );
}

function buildHtml(lat: number, lon: number, acc: number | null): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#0b0b0d}.pin div{width:26px;height:26px;border-radius:50%;background:#ffb300;border:3px solid #000;box-shadow:0 0 0 2px #ffb300}</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{zoomControl:true}).setView([${lat},${lon}],18);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
${acc ? `L.circle([${lat},${lon}],{radius:${acc},color:'#9a9aa5',weight:1,fillOpacity:.08}).addTo(map);` : ""}
var mk=L.marker([${lat},${lon}],{draggable:true,icon:L.divIcon({className:'pin',html:'<div></div>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map);
function send(p){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(p.lat+','+p.lng);}
mk.on('dragend',function(){send(mk.getLatLng());});
map.on('click',function(e){mk.setLatLng(e.latlng);send(e.latlng);});
</script></body></html>`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  close: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  hint: { color: colors.dim, fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  coords: { color: colors.dim, fontSize: 12, fontVariant: ["tabular-nums"] },
});
