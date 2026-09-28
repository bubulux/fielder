import { useMemo, useState, type ComponentType } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { makeStyles, num, type, useTheme } from "../theme";
import { Button, Header, Hint, Toggle } from "./ui";
import { MAP_CSS } from "./mapHtml";

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
  const s = useStyles();
  const { c, name } = useTheme();
  const [pos, setPos] = useState<[number, number]>([lat, lon]);
  const [all, setAll] = useState(photoCount > 1);
  const html = useMemo(() => buildHtml(lat, lon, accuracyM, name === "set", c.bg), [lat, lon, accuracyM, name, c.bg]);
  const moved = Math.abs(pos[0] - lat) > 1e-7 || Math.abs(pos[1] - lon) > 1e-7;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={s.root}>
        <Header title="Correct position" right={<Pressable onPress={onCancel} style={s.cancel} accessibilityRole="button"><Text style={s.cancelText}>Cancel</Text></Pressable>} />
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}><Hint>Drag the pin or tap the map where the photo was taken.{accuracyM ? ` The dashed circle is the reported GPS accuracy (±${Math.round(accuracyM)} m).` : ""}</Hint></View>
        <WebView
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://fielder.local/" }}
          style={{ flex: 1, backgroundColor: c.bg }}
          onMessage={(e: WebViewMessageEvent) => { const [a, b] = e.nativeEvent.data.split(",").map(Number); if (Number.isFinite(a) && Number.isFinite(b)) setPos([a, b]); }}
          javaScriptEnabled
          setSupportMultipleWindows={false}
        />
        <View style={s.footer}>
          {photoCount > 1 && <Toggle label={`All ${photoCount} photos of this shot`} value={all} onChange={setAll} />}
          <Text style={s.coords}>{pos[0].toFixed(6)}, {pos[1].toFixed(6)}</Text>
          <Button label="Save position" icon="crosshairs-gps" onPress={() => onSave(pos[0], pos[1], all)} disabled={!moved} />
        </View>
      </View>
    </Modal>
  );
}

function buildHtml(lat: number, lon: number, acc: number | null, dark: boolean, bg: string): string {
  return `<!doctype html><html${dark ? ' class="dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:${bg}}${MAP_CSS}</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{zoomControl:true}).setView([${lat},${lon}],18);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
${acc ? `L.circle([${lat},${lon}],{radius:${acc},color:'#0B0B0C',weight:2,dashArray:'6 4',fillColor:'#0040D8',fillOpacity:.12}).addTo(map);` : ""}
var mk=L.marker([${lat},${lon}],{draggable:true,icon:L.divIcon({className:'pin-icon',html:'<span class="pin pin--drag"><i class="mdi mdi-crosshairs"></i></span>',iconSize:[40,40],iconAnchor:[20,20]})}).addTo(map);
function send(p){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(p.lat+','+p.lng);}
mk.on('dragend',function(){send(mk.getLatLng());});
map.on('click',function(e){mk.setLatLng(e.latlng);send(e.latlng);});
</script></body></html>`;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  cancel: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10 },
  cancelText: { ...type("body", "bold"), color: c.accent },
  footer: { padding: 16, paddingBottom: 28, gap: 4, backgroundColor: c.surface, borderTopWidth: 2, borderTopColor: c.border },
  coords: { ...type("caption"), color: c.textDim, ...num },
}));
