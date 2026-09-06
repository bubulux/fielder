import type { Shot } from "./api";
import { frameOf } from "./format";

export type MaskMode = "mask" | "frame" | "off";

/**
 * Renders a shot with its rig frame re-applied from the stored geometry.
 * The frame is centred; fractions > 1 mean the rig saw more than the phone, in
 * which case the photo is shrunk inside the frame exactly like in the app.
 */
export function Framed({ shot, mode, className }: { shot: Shot; mode: MaskMode; className?: string }) {
  const f = frameOf(shot);
  const img = shot.image_url;
  if (!f || mode === "off") return <div class={`framed ${className ?? ""}`}><img src={img} alt="" loading="lazy" /></div>;

  const scale = 1 / Math.max(1, f.width_fraction, f.height_fraction);
  const rectW = f.width_fraction * scale * 100;
  const rectH = f.height_fraction * scale * 100;
  const rect = { left: `${(100 - rectW) / 2}%`, top: `${(100 - rectH) / 2}%`, width: `${rectW}%`, height: `${rectH}%` };
  const imgStyle = scale < 1 ? { width: `${scale * 100}%`, height: `${scale * 100}%`, left: `${(1 - scale) * 50}%`, top: `${(1 - scale) * 50}%` } : {};

  return (
    <div class={`framed ${className ?? ""}`}>
      <img src={img} alt="" loading="lazy" style={imgStyle} class={scale < 1 ? "shrunk" : ""} />
      {mode === "mask" && (
        <>
          <div class="tint" style={{ left: 0, top: 0, right: 0, height: rect.top }} />
          <div class="tint" style={{ left: 0, bottom: 0, right: 0, height: rect.top }} />
          <div class="tint" style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
          <div class="tint" style={{ right: 0, top: rect.top, width: rect.left, height: rect.height }} />
        </>
      )}
      <div class={`frame ${scale < 1 ? "dashed" : ""}`} style={rect} />
    </div>
  );
}

/** Crop the photo to the rig frame in the browser and trigger a download. */
export async function downloadCrop(shot: Shot): Promise<void> {
  const f = frameOf(shot);
  const res = await fetch(shot.image_url, { credentials: "same-origin" });
  const bitmap = await createImageBitmap(await res.blob());
  const wf = Math.min(1, f?.width_fraction ?? 1);
  const hf = Math.min(1, f?.height_fraction ?? 1);
  const sw = Math.round(bitmap.width * wf), sh = Math.round(bitmap.height * hf);
  const sx = Math.round((bitmap.width - sw) / 2), sy = Math.round((bitmap.height - sh) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = sw; canvas.height = sh;
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fielder-${shot.timestamp.replace(/[:.]/g, "-")}-framed.jpg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
