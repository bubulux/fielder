import { useMemo, useState, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";

// react-native-webview's class typings collapse to `never` under this TS/React combination; use the props type directly.
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;
import type { Shot } from "../api";
import { colors } from "../components/ui";
import { rigLabel, ShotDetail, type useShots } from "./Gallery";
import type { Settings } from "../types";

interface Props { settings: Settings; data: ReturnType<typeof useShots>; focus: Shot | null }

/** Leaflet + OpenStreetMap inside a WebView: no API key, no native map SDK. */
export function MapScreen({ settings, data, focus }: Props) {
  const [open, setOpen] = useState<Shot | null>(null);
  const { shots, remove } = data;

  const markers = useMemo(
    () => (shots ?? []).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, title: rigLabel(s), sub: new Date(s.timestamp).toLocaleString() })),
    [shots],
  );
  const html = useMemo(() => buildHtml(markers, focus ? { lat: focus.lat, lon: focus.lon } : null), [markers, focus]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!shots && <Text style={m.status}>Loading…</Text>}
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://fielder.local/" }}
        style={{ flex: 1, backgroundColor: colors.bg }}
        onMessage={(e: WebViewMessageEvent) => {
          const id = e.nativeEvent.data;
          const s = shots?.find((x) => x.id === id);
          if (s) setOpen(s);
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
      <ShotDetail shot={open} onClose={() => setOpen(null)} settings={settings} mode="mask" onDeleted={remove} onShowOnMap={() => setOpen(null)} />
    </View>
  );
}

function buildHtml(markers: { id: string; lat: number; lon: number; title: string; sub: string }[], focus: { lat: number; lon: number } | null): string {
  const data = JSON.stringify(markers).replace(/</g, "\\u003c");
  const focusJson = JSON.stringify(focus);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#0b0b0d}.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#16161a;color:#f2f2f5}.t{font-weight:600}.s{color:#9a9aa5;font-size:12px}.b{display:inline-block;margin-top:6px;padding:6px 10px;border-radius:999px;background:#ffb300;color:#000;font-weight:600;font-size:12px}</style>
</head><body><div id="m"></div><script>
var shots=${data}, focus=${focusJson};
var map=L.map('m',{zoomControl:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var b=[];
shots.forEach(function(s){b.push([s.lat,s.lon]);
  var mk=L.circleMarker([s.lat,s.lon],{radius:9,color:'#ffb300',weight:2,fillColor:'#ffb300',fillOpacity:.6}).addTo(map);
  var el=document.createElement('div');
  var t=document.createElement('div');t.className='t';t.textContent=s.title;
  var su=document.createElement('div');su.className='s';su.textContent=s.sub;
  var bt=document.createElement('a');bt.className='b';bt.textContent='Open shot';bt.href='#';
  bt.addEventListener('click',function(e){e.preventDefault();window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(s.id);});
  el.appendChild(t);el.appendChild(su);el.appendChild(bt);mk.bindPopup(el);
});
if(focus){map.setView([focus.lat,focus.lon],16);}
else if(b.length===1){map.setView(b[0],15);}
else if(b.length>1){map.fitBounds(b,{padding:[40,40]});}
else{map.setView([51,10],5);}
</script></body></html>`;
}

const m = StyleSheet.create({ status: { color: colors.dim, padding: 12, textAlign: "center" } });
