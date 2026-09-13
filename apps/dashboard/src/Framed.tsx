import type { Shot } from "./api";
import { frameLayout, frameOf, imageAspect, type FrameMode, type PctRect } from "./format";

export type MaskMode = FrameMode;

const pct = (r: PctRect) => ({ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` });

/**
 * Renders a shot with its rig frame re-applied from the stored geometry.
 * The frame is centred; fractions > 1 mean the rig saw more than the phone, in
 * which case the photo is shrunk inside the frame exactly like in the app.
 * "fit" crops the photo to the frame instead.
 */
export function Framed({ shot, mode, className }: { shot: Shot; mode: MaskMode; className?: string }) {
  const f = frameOf(shot);
  const img = shot.image_url;
  if (!f || mode === "off") return <div class={`framed ${className ?? ""}`}><img src={img} alt="" loading="lazy" /></div>;

  const l = frameLayout(f, mode, imageAspect(shot));
  const fullImg = l.img.left === 0 && l.img.width === 100 && l.img.height === 100;
  return (
    <div class={`framed ${className ?? ""}`} style={l.aspect ? { aspectRatio: String(l.aspect), height: "auto" } : undefined}>
      <img src={img} alt="" loading="lazy" style={fullImg ? undefined : { inset: "auto", ...pct(l.img) }} />
      {mode === "mask" && l.frame && (
        <>
          <div class="tint" style={{ left: 0, top: 0, right: 0, height: `${l.frame.top}%` }} />
          <div class="tint" style={{ left: 0, bottom: 0, right: 0, height: `${l.frame.top}%` }} />
          <div class="tint" style={{ left: 0, top: `${l.frame.top}%`, width: `${l.frame.left}%`, height: `${l.frame.height}%` }} />
          <div class="tint" style={{ right: 0, top: `${l.frame.top}%`, width: `${l.frame.left}%`, height: `${l.frame.height}%` }} />
        </>
      )}
      {l.frame && <div class={`frame ${l.shrunk ? "dashed" : ""}`} style={pct(l.frame)} />}
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
