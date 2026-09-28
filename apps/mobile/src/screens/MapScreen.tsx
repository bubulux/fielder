import { useMemo, type ComponentType } from "react";
import { View } from "react-native";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";

// react-native-webview's class typings collapse to `never` under this TS/React combination; use the props type directly.
const WebView = RNWebView as unknown as ComponentType<WebViewProps>;
import { cover, type Shot } from "../api";
import { Empty } from "../components/ui";
import { MAP_CSS } from "../components/mapHtml";
import { STATE_ICONS } from "@fielder/vocab";
import { useTheme } from "../theme";
import { applyFilter, placeLabel, rigLabel, ShotDetail, shotTitle, type ShotListProps } from "./Gallery";

type Props = Omit<ShotListProps, "onFilter" | "onShowOnMap"> & { focus: Shot | null };

/** Leaflet + OpenStreetMap inside a WebView: no API key, no native map SDK. Pins show the review state (colour + icon). */
export function MapScreen({ settings, data, focus, filter, locations, onLocations, countAt, open, onOpen }: Props) {
  const { shots, remove, update } = data;
  const { c, name } = useTheme();

  const markers = useMemo(
    () => applyFilter(shots, filter).map((s) => { const p = cover(s); return { id: s.id, lat: p.lat, lon: p.lon, state: s.state, icon: STATE_ICONS[s.state], title: shotTitle(s), sub: [placeLabel(s) || rigLabel(p), new Date(s.captured_at).toLocaleString()].join(" · ") }; }),
    [shots, filter],
  );
  const html = useMemo(() => buildHtml(markers, focus ? { lat: cover(focus).lat, lon: cover(focus).lon } : null, name === "set", c.bg), [markers, focus, name, c.bg]);
  const openLatest = open ? (shots ?? []).find((s) => s.id === open.id) ?? open : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {!shots && <Empty loading title="Loading shots…" />}
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://fielder.local/" }}
        style={{ flex: 1, backgroundColor: c.bg }}
        onMessage={(e: WebViewMessageEvent) => {
          const id = e.nativeEvent.data;
          const s = shots?.find((x) => x.id === id);
          if (s) onOpen(s);
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
      <ShotDetail shot={openLatest} onClose={() => onOpen(null)} settings={settings} mode="mask" onDeleted={remove} onUpdated={update} onShowOnMap={() => onOpen(null)}
        locations={locations} onLocations={onLocations} countAt={countAt} />
    </View>
  );
}

function buildHtml(markers: { id: string; lat: number; lon: number; state: string; icon: string; title: string; sub: string }[], focus: { lat: number; lon: number } | null, dark: boolean, bg: string): string {
  const data = JSON.stringify(markers).replace(/</g, "\\u003c");
  const focusJson = JSON.stringify(focus);
  return `<!doctype html><html${dark ? ' class="dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:${bg}}${MAP_CSS}</style>
</head><body><div id="m"></div><script>
var shots=${data}, focus=${focusJson};
var map=L.map('m',{zoomControl:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var b=[];
shots.forEach(function(s){b.push([s.lat,s.lon]);
  var mk=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'pin-icon',html:'<span class="pin pin--'+s.state+'"><i class="mdi mdi-'+s.icon+'"></i></span>',iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-14]})}).addTo(map);
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

