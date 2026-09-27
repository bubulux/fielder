/**
 * Shared vocabularies for shot metadata. Stored values are the lowercase ids;
 * `label()` gives the display string. Worker, mobile app and dashboard all import this.
 */

/**
 * Daylight phases a shot works in. A shot stores any subset ("dusk or night both work").
 * Artificial light is a separate flag on the shot, independent of these and of INT/EXT.
 */
export const LIGHT = ["dawn", "day", "dusk", "night"] as const;
export type Light = (typeof LIGHT)[number];

/** "none" = not relevant / indoors. */
export const WEATHER = ["none", "sunny", "partly_cloudy", "cloudy", "rainy", "stormy", "foggy", "snow"] as const;
export type Weather = (typeof WEATHER)[number];

/** Screenplay convention: INT (interior) / EXT (exterior). */
export const INT_EXT = ["int", "ext"] as const;
export type IntExt = (typeof INT_EXT)[number];

export const SHOT_STATES = ["unreviewed", "approved", "archived"] as const;
export type ShotState = (typeof SHOT_STATES)[number];

const LABELS: Record<string, string> = {
  partly_cloudy: "Partly cloudy",
  int: "INT",
  ext: "EXT",
};

/** Display label for any vocabulary value ("partly_cloudy" -> "Partly cloudy", "dawn" -> "Dawn"). */
export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** "Dusk / Night + Artificial", "Artificial", or "" when nothing is set. Phases are listed in LIGHT order. */
export function lightLabel(light: readonly string[] | null | undefined, artificial: boolean): string {
  const phases = LIGHT.filter((l) => light?.includes(l)).map(label).join(" / ");
  return [phases, artificial ? "Artificial" : ""].filter(Boolean).join(" + ");
}

/** Badge colours shared by both UIs. */
export const STATE_COLORS: Record<ShotState, string> = {
  unreviewed: "#FFB300",
  approved: "#00E676",
  archived: "#9A9AA5",
};

export const isOneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * "Extra" metadata: a free-form JSON object on the shot. Field definitions that describe and
 * validate it per project come later; until then only the shape and size are checked.
 */
export type ExtraValue = string | number | boolean | null | ExtraValue[] | { [k: string]: ExtraValue };
export type Extra = Record<string, ExtraValue>;

const MAX_EXTRA_BYTES = 16 * 1024;

/** Validates an `extra` object. Returns the error or null. */
export function validateExtra(v: unknown): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "extra must be an object";
  if (JSON.stringify(v).length > MAX_EXTRA_BYTES) return "extra is too large";
  return null;
}

/** "U-Bahn: U4 · Station: Bayerischer Platz"; nested objects are flattened one level per key. */
export function extraLabel(extra: Extra | null | undefined): string {
  if (!extra) return "";
  const parts: string[] = [];
  const walk = (o: Extra) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === null || v === "") continue;
      if (typeof v === "object" && !Array.isArray(v)) walk(v);
      else parts.push(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    }
  };
  walk(extra);
  return parts.join(" · ");
}
