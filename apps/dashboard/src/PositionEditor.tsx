import { useEffect, useRef, useState } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { patchPhotoPosition, type Photo, type Shot } from "./api";

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
    if (photo.gps_accuracy_m) L.circle([photo.lat, photo.lon], { radius: photo.gps_accuracy_m, color: "#9a9aa5", weight: 1, fillOpacity: 0.08 }).addTo(map);
    const marker = L.marker([photo.lat, photo.lon], {
      draggable: true,
      icon: L.divIcon({ className: "pos-pin", html: "<div></div>", iconSize: [22, 22], iconAnchor: [11, 11] }),
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
      <div class="meta">Drag the pin or click the map where the photo was taken.{photo.gps_accuracy_m ? ` The grey circle is the reported GPS accuracy (±${Math.round(photo.gps_accuracy_m)} m).` : ""}</div>
      <div ref={el} class="pos-map" />
      <div class="btn-row">
        {shot.photos.length > 1 && <label class="check"><input type="checkbox" checked={all} onChange={() => setAll(!all)} /> All {shot.photos.length} photos of this shot</label>}
        <span style="flex:1" />
        <button class="btn outline" onClick={onCancel}>Cancel</button>
        <button class="btn primary" disabled={!moved || busy} onClick={() => void save()}>Save position</button>
      </div>
    </div>
  );
}
