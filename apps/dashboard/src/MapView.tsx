import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Shot } from "./api";
import { fovLabel, rigLabel, when } from "./format";

interface Props { shots: Shot[]; onOpen: (shot: Shot) => void; focus?: Shot | null }

export function MapView({ shots, onOpen, focus }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.setView([51, 10], 5);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const s of shots) {
      bounds.push([s.lat, s.lon]);
      const marker = L.circleMarker([s.lat, s.lon], { radius: 8, color: "#ffb300", weight: 2, fillColor: "#ffb300", fillOpacity: 0.6 });
      const html = document.createElement("div");
      html.className = "popup";
      html.innerHTML = `<img src="${s.image_url}" alt="" loading="lazy" /><div class="title"></div><div class="sub"></div><div class="sub"></div><a href="#">Open details</a>`;
      html.querySelector(".title")!.textContent = rigLabel(s);
      html.querySelectorAll(".sub")[0]!.textContent = when(s.timestamp);
      html.querySelectorAll(".sub")[1]!.textContent = fovLabel(s);
      html.querySelector("a")!.addEventListener("click", (e) => { e.preventDefault(); onOpen(s); });
      marker.bindPopup(html, { maxWidth: 280 });
      marker.addTo(g);
    }
    if (bounds.length === 1) m.setView(bounds[0], 15);
    else if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40] });
  }, [shots]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lon], 16);
  }, [focus]);

  return <div ref={el} class="map" />;
}
