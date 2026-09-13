/** Same-origin API; the Access session cookie is sent automatically. */
export interface Shot {
  id: string;
  timestamp: string;
  lat: number;
  lon: number;
  preset_id: string | null;
  preset_name: string | null;
  lens_mm: number;
  image_url: string;
  extra_metadata: Record<string, unknown> | null;
  created_at: string;
  name: string | null;
  light: string | null;
  weather: string | null;
  int_ext: string | null;
  location_id: string | null;
  location_name: string | null;
  district: string | null;
  state: "unreviewed" | "approved" | "archived";
}
export interface Preset {
  id: string;
  name: string;
  camera_id: string | null;
  format_id: string | null;
  sensor_width_mm: number;
  sensor_height_mm: number;
  speedbooster_factor: number;
  lens_min_mm: number | null;
  lens_max_mm: number | null;
  created_at: string;
  updated_at: string | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" }, credentials: "same-origin" });
  if (res.status === 401 || res.redirected) {
    // Access session expired: reload to trigger the login redirect.
    location.reload();
    throw new Error("session expired");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

type Cursor = { before: string; before_id: string } | null;
interface ShotsPage { shots: Shot[]; next: Cursor }

export async function fetchAllShots(): Promise<Shot[]> {
  const all: Shot[] = [];
  let cursor: Cursor = null;
  for (;;) {
    const q: string = cursor ? `?limit=500&before=${encodeURIComponent(cursor.before)}&before_id=${cursor.before_id}` : "?limit=500";
    const page: ShotsPage = await get<ShotsPage>(`/api/shots${q}`);
    all.push(...page.shots);
    if (!page.next) break;
    cursor = page.next;
  }
  return all;
}

export const fetchPresets = () => get<{ presets: Preset[] }>("/api/presets").then((r) => r.presets);

export async function deleteShot(id: string): Promise<void> {
  const res = await fetch(`/api/shots/${id}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`/api/presets/${id}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
