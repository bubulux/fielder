import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Shot } from "./api";
import { fovLabel, frameOf, rigLabel, when } from "./format";
import type { MaskMode } from "./Framed";

interface Props { shots: Shot[]; onOpen: (shot: Shot) => void; focus?: Shot | null; mask: MaskMode }

export function MapView({ shots, onOpen, focus, mask }: Props) {
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
      html.innerHTML = `<div class="framed popup-img"></div><div class="title"></div><div class="sub"></div><div class="sub"></div><a href="#">Open details</a>`;
      const box = html.querySelector(".framed") as HTMLElement;
      box.innerHTML = popupFrameHtml(s, mask);
      html.querySelector(".title")!.textContent = rigLabel(s);
      html.querySelectorAll(".sub")[0]!.textContent = when(s.timestamp);
      html.querySelectorAll(".sub")[1]!.textContent = fovLabel(s);
      html.querySelector("a")!.addEventListener("click", (e) => { e.preventDefault(); onOpen(s); });
      marker.bindPopup(html, { maxWidth: 280 });
      marker.addTo(g);
    }
    if (bounds.length === 1) m.setView(bounds[0], 15);
    else if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40] });
  }, [shots, mask]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lon], 16);
  }, [focus]);

  return <div ref={el} class="map" />;
}

function popupFrameHtml(s: Shot, mask: MaskMode): string {
  const f = frameOf(s);
  const img = `<img src="${s.image_url}" alt="" loading="lazy" />`;
  if (!f || mask === "off") return img;
  const scale = 1 / Math.max(1, f.width_fraction, f.height_fraction);
  const w = f.width_fraction * scale * 100, h = f.height_fraction * scale * 100;
  const left = (100 - w) / 2, top = (100 - h) / 2;
  const imgStyle = scale < 1 ? `style="inset:auto;width:${scale * 100}%;height:${scale * 100}%;left:${(1 - scale) * 50}%;top:${(1 - scale) * 50}%"` : "";
  const tints = mask === "mask"
    ? `<div class="tint" style="left:0;top:0;right:0;height:${top}%"></div><div class="tint" style="left:0;bottom:0;right:0;height:${top}%"></div><div class="tint" style="left:0;top:${top}%;width:${left}%;height:${h}%"></div><div class="tint" style="right:0;top:${top}%;width:${left}%;height:${h}%"></div>`
    : "";
  return `<img src="${s.image_url}" alt="" loading="lazy" ${imgStyle} />${tints}<div class="frame${scale < 1 ? " dashed" : ""}" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%"></div>`;
}
