import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Photo, Shot } from "./api";
import { cover, frameLayout, frameOf, imageAspect, placeLabel, rigLabel, shotTitle, stateColor, when } from "./format";
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
      const p = cover(s);
      bounds.push([p.lat, p.lon]);
      const c = stateColor(s);
      const marker = L.circleMarker([p.lat, p.lon], { radius: 8, color: c, weight: 2, fillColor: c, fillOpacity: 0.6 });
      const html = document.createElement("div");
      html.className = "popup";
      html.innerHTML = `<div class="framed popup-img"></div><div class="title"></div><div class="sub"></div><div class="sub"></div><a href="#">Open details</a>`;
      const box = html.querySelector(".framed") as HTMLElement;
      const popup = popupFrameHtml(p, mask);
      box.innerHTML = popup.html;
      box.style.aspectRatio = String(popup.aspect ?? imageAspect(p));
      html.querySelector(".title")!.textContent = shotTitle(s);
      html.querySelectorAll(".sub")[0]!.textContent = `${placeLabel(s) || rigLabel(p)} · ${s.state}`;
      html.querySelectorAll(".sub")[1]!.textContent = when(s.captured_at);
      html.querySelector("a")!.addEventListener("click", (e) => { e.preventDefault(); onOpen(s); });
      marker.bindPopup(html, { maxWidth: 280 });
      marker.addTo(g);
    }
    if (bounds.length === 1) m.setView(bounds[0], 15);
    else if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40] });
  }, [shots, mask]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([cover(focus).lat, cover(focus).lon], 16);
  }, [focus]);

  return <div ref={el} class="map" />;
}

function popupFrameHtml(s: Photo, mask: MaskMode): { html: string; aspect?: number } {
  const f = frameOf(s);
  const img = (style = "") => `<img src="${s.image_url}" alt="" loading="lazy" ${style} />`;
  if (!f || mask === "off") return { html: img() };
  const l = frameLayout(f, mask, imageAspect(s));
  const r = (x: { left: number; top: number; width: number; height: number }) => `left:${x.left}%;top:${x.top}%;width:${x.width}%;height:${x.height}%`;
  const fullImg = l.img.left === 0 && l.img.width === 100 && l.img.height === 100;
  const imgHtml = img(fullImg ? "" : `style="inset:auto;${r(l.img)}"`);
  if (!l.frame) return { html: imgHtml, aspect: l.aspect };
  const fr = l.frame;
  const tints = mask === "mask"
    ? `<div class="tint" style="left:0;top:0;right:0;height:${fr.top}%"></div><div class="tint" style="left:0;bottom:0;right:0;height:${fr.top}%"></div><div class="tint" style="left:0;top:${fr.top}%;width:${fr.left}%;height:${fr.height}%"></div><div class="tint" style="right:0;top:${fr.top}%;width:${fr.left}%;height:${fr.height}%"></div>`
    : "";
  return { html: `${imgHtml}${tints}<div class="frame${l.shrunk ? " dashed" : ""}" style="${r(fr)}"></div>` };
}
