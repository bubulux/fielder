/**
 * Shared vocabularies for shot metadata. Stored values are the lowercase ids;
 * `label()` gives the display string. Worker, mobile app and dashboard all import this.
 */

export const LIGHT = ["dawn", "morning", "noon", "afternoon", "dusk", "night", "artificial"] as const;
export type Light = (typeof LIGHT)[number];

export const WEATHER = ["sunny", "partly_cloudy", "cloudy", "rainy", "stormy", "foggy", "snow"] as const;
export type Weather = (typeof WEATHER)[number];

/** Screenplay convention: INT (interior) / EXT (exterior). */
export const INT_EXT = ["int", "ext"] as const;
export type IntExt = (typeof INT_EXT)[number];

export const SHOT_STATES = ["unreviewed", "approved", "archived"] as const;
export type ShotState = (typeof SHOT_STATES)[number];

/** The twelve Berlin boroughs (Bezirke). */
export const BERLIN_DISTRICTS = [
  "Mitte",
  "Friedrichshain-Kreuzberg",
  "Pankow",
  "Charlottenburg-Wilmersdorf",
  "Spandau",
  "Steglitz-Zehlendorf",
  "Tempelhof-Schöneberg",
  "Neukölln",
  "Treptow-Köpenick",
  "Marzahn-Hellersdorf",
  "Lichtenberg",
  "Reinickendorf",
] as const;
export type District = (typeof BERLIN_DISTRICTS)[number];

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

/** Badge colours shared by both UIs. */
export const STATE_COLORS: Record<ShotState, string> = {
  unreviewed: "#FFB300",
  approved: "#00E676",
  archived: "#9A9AA5",
};

export const isOneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);
