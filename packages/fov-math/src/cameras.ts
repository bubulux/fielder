/**
 * Camera bodies and their recording formats. A format defines the active sensor
 * area actually used for that recording mode, which is what determines the field
 * of view. Windowed modes (e.g. 4K DCI on a Pocket 6K) crop the sensor.
 *
 * Blackmagic dimensions are derived from pixel count × pixel pitch:
 *   Pocket 4K  18.96 × 10.00 mm @ 4096 × 2160  → 4.629 µm
 *   Pocket 6K  23.10 × 12.99 mm @ 6144 × 3456  → 3.760 µm
 */

export interface RecordingFormat {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Set when the mode crops the sensor rather than using its full width. */
  windowed?: boolean;
}

export interface CameraBody {
  id: string;
  name: string;
  formats: readonly RecordingFormat[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const px = (w: number, h: number, pitchUm: number, id: string, name: string, windowed?: boolean): RecordingFormat => ({
  id,
  name,
  widthMm: r2((w * pitchUm) / 1000),
  heightMm: r2((h * pitchUm) / 1000),
  ...(windowed ? { windowed: true } : {}),
});
const mm = (id: string, name: string, widthMm: number, heightMm: number): RecordingFormat => ({ id, name, widthMm, heightMm });

const P4K = 4.629;
const P6K = 3.76;

export const CAMERAS: readonly CameraBody[] = [
  {
    id: "bmpcc4k",
    name: "Blackmagic Pocket 4K",
    formats: [
      px(4096, 2160, P4K, "4k-dci", "4K DCI 4096×2160"),
      px(3840, 2160, P4K, "uhd", "UHD 3840×2160"),
      px(1920, 1080, P4K * 2, "hd", "HD 1920×1080 (scaled from UHD)"),
    ],
  },
  {
    id: "bmpcc6k",
    name: "Blackmagic Pocket 6K / 6K Pro / 6K G2",
    formats: [
      px(6144, 3456, P6K, "6k", "6K 6144×3456"),
      px(6144, 2560, P6K, "6k-2.4", "6K 2.4:1 6144×2560"),
      px(5744, 3024, P6K, "5.7k-17-9", "5.7K 17:9 5744×3024", true),
      px(4096, 2160, P6K, "4k-dci", "4K DCI 4096×2160 (windowed)", true),
      px(3840, 2160, P6K, "uhd", "UHD 3840×2160 (windowed)", true),
      px(2868, 1512, P6K, "2.8k-17-9", "2.8K 17:9 2868×1512 (windowed)", true),
    ],
  },
  {
    id: "ff",
    name: "Full frame (generic)",
    formats: [
      mm("3-2", "Stills 3:2", 36, 24),
      mm("16-9", "Video 16:9", 36, 20.25),
      mm("17-9", "Video 17:9 (DCI)", 36, 19.06),
    ],
  },
  {
    id: "s35",
    name: "Super 35 (generic)",
    formats: [
      mm("4-perf", "4-perf / open gate", 24.89, 18.66),
      mm("3-perf", "3-perf 16:9", 24.89, 14.0),
    ],
  },
  {
    id: "apsc",
    name: "APS-C Sony / Fuji / Nikon",
    formats: [mm("3-2", "Stills 3:2", 23.5, 15.6), mm("16-9", "Video 16:9", 23.5, 13.22)],
  },
  {
    id: "apsc-canon",
    name: "APS-C Canon",
    formats: [mm("3-2", "Stills 3:2", 22.3, 14.9), mm("16-9", "Video 16:9", 22.3, 12.54)],
  },
  {
    id: "mft",
    name: "Micro Four Thirds (generic)",
    formats: [mm("4-3", "Stills 4:3", 17.3, 13), mm("16-9", "Video 16:9", 17.3, 9.73)],
  },
  {
    id: "1inch",
    name: '1" type',
    formats: [mm("3-2", "Stills 3:2", 13.2, 8.8), mm("16-9", "Video 16:9", 13.2, 7.43)],
  },
];

export const CUSTOM_CAMERA_ID = "custom";

export function findFormat(cameraId: string | null | undefined, formatId: string | null | undefined): RecordingFormat | null {
  const cam = CAMERAS.find((c) => c.id === cameraId);
  return cam?.formats.find((f) => f.id === formatId) ?? null;
}

export function describeRig(cameraId: string | null | undefined, formatId: string | null | undefined, widthMm: number, heightMm: number): string {
  const cam = CAMERAS.find((c) => c.id === cameraId);
  const fmt = cam?.formats.find((f) => f.id === formatId);
  if (cam && fmt) return `${cam.name} · ${fmt.name}`;
  return `Custom ${widthMm} × ${heightMm} mm`;
}
