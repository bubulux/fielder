import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { label, STATE_ICONS } from "@fielder/vocab";
import type { Photo, Shot } from "./api";
import { cover, frameLayout, frameOf, imageAspect, shotTitle } from "./format";
import type { MaskMode } from "./Framed";
import { shotSub } from "./ShotCard";
import { cx, Icon, StateMarker } from "./ui";

interface Props {
  shots: Shot[];
  mask: MaskMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (s: Shot) => void;
}

const pinIcon = (s: Shot, selected: boolean) => L.divIcon({
  className: "f-pin-icon",
  html: `<span class="f-pin f-pin--${s.state}${selected ? " is-selected" : ""}" title="${label(s.state)}"><i class="mdi mdi-${STATE_ICONS[s.state]}"></i></span>`,
  iconSize: selected ? [36, 36] : [26, 26], iconAnchor: selected ? [18, 18] : [13, 13], popupAnchor: [0, -16],
});

/** Shots layout "Map": the result list on the left, one state pin per shot; the popup opens the shot view. */
export function ShotsMap({ shots, mask, selectedId, onSelect, onOpen }: Props) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" }); }, [selectedId]);
  const idx = shots.findIndex((s) => s.id === selectedId);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = shots[Math.max(0, Math.min(shots.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))]; if (n) onSelect(n.id); }
    else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); onOpen(shots[idx]); }
  };
  return (
    <>
      <div class="f-panel f-panel--left" style={{ "--panel-w": "320px" }}>
        <div ref={list} class="f-panel__body f-panel__body--flush" role="listbox" aria-label="Shots on the map" tabIndex={0} onKeyDown={onKey}>
          {shots.map((s) => (
            <button key={s.id} type="button" role="option" aria-selected={s.id === selectedId} class={cx("f-row f-row--dense", s.id === selectedId && "is-selected")} onClick={() => onSelect(s.id)} onDblClick={() => onOpen(s)}>
              <div class="f-row__thumb" style={{ width: "64px" }}><MiniFramed photo={cover(s)} mask={mask} /></div>
              <div class="f-row__main"><span class="f-row__title">{shotTitle(s)}</span><span class="f-row__meta">{shotSub(s)}</span></div>
              <StateMarker state={s.state} iconOnly />
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <LeafletMap shots={shots} mask={mask} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
      </div>
    </>
  );
}

function MiniFramed({ photo, mask }: { photo: Photo; mask: MaskMode }) {
  const f = frameOf(photo);
  const l = f && mask !== "off" && mask !== "fit" ? frameLayout(f, "frame", imageAspect(photo)) : null;
  return (
    <div class="framed" style={{ aspectRatio: "4 / 3" }}>
      <img src={photo.image_url} alt="" loading="lazy" style={{ objectFit: "cover" }} />
      {l?.frame && <div class={cx("f-framed__frame f-framed__frame--thin", mask === "mask" && "f-framed__frame--mask")} style={{ left: `${l.frame.left}%`, top: `${l.frame.top}%`, width: `${l.frame.width}%`, height: `${l.frame.height}%` }} />}
    </div>
  );
}

function LeafletMap({ shots, mask, selectedId, onSelect, onOpen }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fit = () => {
    const m = map.current;
    const b = shots.map((s) => [cover(s).lat, cover(s).lon] as L.LatLngTuple);
    if (!m) return;
    if (b.length === 1) m.setView(b[0], 15); else if (b.length > 1) m.fitBounds(b, { padding: [40, 40] }); else m.setView([51, 10], 5);
  };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    L.control.zoom({ position: "topleft" }).addTo(m);
    map.current = m;
    m.setView([51, 10], 5);
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current.values()) mk.remove();
    markers.current.clear();
    for (const s of shots) {
      const p = cover(s);
      const mk = L.marker([p.lat, p.lon], { icon: pinIcon(s, s.id === selectedId), title: shotTitle(s), keyboard: false });
      mk.bindPopup(() => popupContent(s, mask, () => onOpen(s)), { maxWidth: 260, minWidth: 248, className: "f-leaflet-popup" });
      mk.on("click", () => onSelect(s.id));
      mk.addTo(m);
      markers.current.set(s.id, mk);
    }
    fit();
  }, [shots, mask]);

  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const s = shots.find((x) => x.id === id);
      if (s) mk.setIcon(pinIcon(s, id === selectedId));
      if (id === selectedId) mk.setZIndexOffset(1000); else mk.setZIndexOffset(0);
    }
    const mk = selectedId ? markers.current.get(selectedId) : null;
    if (mk && map.current) { map.current.setView(mk.getLatLng(), Math.max(map.current.getZoom(), 15)); mk.openPopup(); }
  }, [selectedId]);

  return (
    <>
      <div ref={el} class="map" />
      <button type="button" class="f-btn f-btn--secondary f-btn--sm map-fit" onClick={fit}><Icon name="fit-to-page-outline" />Fit all</button>
    </>
  );
}

function popupContent(s: Shot, mask: MaskMode, open: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-popup";
  const p = cover(s);
  const box = document.createElement("div");
  box.className = "framed";
  const pf = popupFrameHtml(p, mask);
  box.innerHTML = pf.html + (s.photos.length > 1 ? `<div class="f-card__tl"><span class="f-seq"><i class="mdi mdi-layers-triple-outline"></i>SEQ · ${s.photos.length}</span></div>` : "");
  box.style.aspectRatio = String(pf.aspect ?? imageAspect(p));
  const body = document.createElement("div");
  body.className = "map-popup__body";
  const head = document.createElement("div");
  head.className = "map-popup__head";
  const title = document.createElement("strong");
  title.textContent = shotTitle(s);
  const st = document.createElement("span");
  st.className = `f-state f-state--${s.state}`;
  st.innerHTML = `<i class="mdi mdi-${STATE_ICONS[s.state]}"></i>`;
  st.append(label(s.state));
  head.append(title, st);
  const sub = document.createElement("span");
  sub.className = "meta";
  sub.textContent = [shotSub(s), s.project_name].filter(Boolean).join(" · ");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "f-btn f-btn--sm";
  btn.innerHTML = `Open details<span class="f-btn__kbd">↵</span>`;
  btn.addEventListener("click", open);
  body.append(head, sub, btn);
  el.append(box, body);
  return el;
}

/** The framed thumbnail as HTML for Leaflet popups (same geometry as `Framed`). */
export function popupFrameHtml(s: Photo, mask: MaskMode): { html: string; aspect?: number } {
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
