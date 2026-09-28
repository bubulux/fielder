import { useEffect, useRef, useState } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { patchPhotoPosition, type Photo, type Shot } from "./api";
import { Icon } from "./ui";

interface Props { shot: Shot; photo: Photo; onSaved: (s: Shot) => void; onCancel: () => void }

/** Drag the pin (or click the map) to where the photo was really taken. */
export function PositionEditor({ shot, photo, onSaved, onCancel }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<[number, number]>([photo.lat, photo.lon]);
  const [all, setAll] = useState(shot.photos.length > 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true }).setView([photo.lat, photo.lon], 18);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    // Reported accuracy: dashed black ring with a faint fill, readable on light and (filtered) dark tiles.
    if (photo.gps_accuracy_m) L.circle([photo.lat, photo.lon], { radius: photo.gps_accuracy_m, color: "#0B0B0C", weight: 2, dashArray: "6 4", fillColor: "#0040D8", fillOpacity: 0.12 }).addTo(map);
    const marker = L.marker([photo.lat, photo.lon], {
      draggable: true,
      icon: L.divIcon({ className: "f-pin-icon", html: '<span class="f-pin f-pin--drag" title="Drag to correct"><i class="mdi mdi-crosshairs"></i></span>', iconSize: [40, 40], iconAnchor: [20, 20] }),
    }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); setPos([p.lat, p.lng]); });
    map.on("click", (e: L.LeafletMouseEvent) => { marker.setLatLng(e.latlng); setPos([e.latlng.lat, e.latlng.lng]); });
    return () => { map.remove(); };
  }, [photo.id]);

  const moved = Math.abs(pos[0] - photo.lat) > 1e-7 || Math.abs(pos[1] - photo.lon) > 1e-7;
  async function save() {
    setBusy(true);
    try { onSaved(await patchPhotoPosition(photo.id, pos[0], pos[1], all)); } catch (e) { alert(`Saving the position failed: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  return (
    <div class="pos-editor">
      <div class="meta">Drag the pin or click the map where the photo was taken.{photo.gps_accuracy_m ? ` The dashed circle is the reported GPS accuracy (±${Math.round(photo.gps_accuracy_m)} m).` : ""}</div>
      <div ref={el} class="pos-map" />
      <div class="btn-row">
        {shot.photos.length > 1 && <label class="check"><input type="checkbox" checked={all} onChange={() => setAll(!all)} /> All {shot.photos.length} photos of this shot</label>}
        <span class="grow" />
        <button class="f-btn f-btn--ghost" onClick={onCancel}>Cancel</button>
        <button class="f-btn" disabled={!moved || busy} onClick={() => void save()}><Icon name="crosshairs-gps" />Save position</button>
      </div>
    </div>
  );
}
