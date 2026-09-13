/**
 * Shared vocabularies for shot metadata. Stored values are the lowercase ids;
 * `label()` gives the display string. Worker, mobile app and dashboard all import this.
 */

export const LIGHT = ["dawn", "morning", "noon", "afternoon", "dusk", "night", "artificial", "art_low", "art_high"] as const;
export type Light = (typeof LIGHT)[number];

/** "none" = not relevant / indoors. */
export const WEATHER = ["none", "sunny", "partly_cloudy", "cloudy", "rainy", "stormy", "foggy", "snow"] as const;
export type Weather = (typeof WEATHER)[number];

/** Screenplay convention: INT (interior) / EXT (exterior). */
export const INT_EXT = ["int", "ext"] as const;
export type IntExt = (typeof INT_EXT)[number];

export const SHOT_STATES = ["unreviewed", "approved", "archived"] as const;
export type ShotState = (typeof SHOT_STATES)[number];

/** The twelve Berlin boroughs (Bezirke), plus Brandenburg and Other for locations outside the city. */
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
  "Brandenburg",
  "Other",
] as const;
export type District = (typeof BERLIN_DISTRICTS)[number];

const LABELS: Record<string, string> = {
  partly_cloudy: "Partly cloudy",
  art_low: "Art-Low",
  art_high: "Art-High",
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

/**
 * "Extra" metadata: optional, named collections of values a shot can be tagged with.
 * Stored on the shot as `extra: { [collectionId]: value }`. Add collections here; the
 * worker validates values against this list and both UIs render a picker per collection.
 */
export interface ExtraCollection { id: string; name: string; values: readonly string[] }

const UBAHN_LINES: Record<string, readonly string[]> = {
  U1: ["Uhlandstraße", "Kurfürstendamm", "Wittenbergplatz", "Nollendorfplatz", "Kurfürstenstraße", "Gleisdreieck", "Möckernbrücke", "Hallesches Tor", "Prinzenstraße", "Kottbusser Tor", "Görlitzer Bahnhof", "Schlesisches Tor", "Warschauer Straße"],
  U2: ["Pankow", "Vinetastraße", "Schönhauser Allee", "Eberswalder Straße", "Senefelderplatz", "Rosa-Luxemburg-Platz", "Alexanderplatz", "Klosterstraße", "Märkisches Museum", "Spittelmarkt", "Hausvogteiplatz", "Stadtmitte", "Mohrenstraße", "Potsdamer Platz", "Mendelssohn-Bartholdy-Park", "Gleisdreieck", "Bülowstraße", "Nollendorfplatz", "Wittenbergplatz", "Zoologischer Garten", "Ernst-Reuter-Platz", "Deutsche Oper", "Bismarckstraße", "Sophie-Charlotte-Platz", "Kaiserdamm", "Theodor-Heuss-Platz", "Neu-Westend", "Olympia-Stadion", "Ruhleben"],
  U3: ["Warschauer Straße", "Schlesisches Tor", "Görlitzer Bahnhof", "Kottbusser Tor", "Prinzenstraße", "Hallesches Tor", "Möckernbrücke", "Gleisdreieck", "Kurfürstenstraße", "Nollendorfplatz", "Wittenbergplatz", "Augsburger Straße", "Spichernstraße", "Hohenzollernplatz", "Fehrbelliner Platz", "Heidelberger Platz", "Rüdesheimer Platz", "Breitenbachplatz", "Podbielskiallee", "Dahlem-Dorf", "Freie Universität (Thielplatz)", "Oskar-Helene-Heim", "Onkel Toms Hütte", "Krumme Lanke"],
  U4: ["Nollendorfplatz", "Viktoria-Luise-Platz", "Bayerischer Platz", "Rathaus Schöneberg", "Innsbrucker Platz"],
  U5: ["Hauptbahnhof", "Bundestag", "Brandenburger Tor", "Unter den Linden", "Museumsinsel", "Rotes Rathaus", "Alexanderplatz", "Schillingstraße", "Strausberger Platz", "Weberwiese", "Frankfurter Tor", "Samariterstraße", "Frankfurter Allee", "Magdalenenstraße", "Lichtenberg", "Friedrichsfelde", "Tierpark", "Biesdorf-Süd", "Elsterwerdaer Platz", "Wuhletal", "Kaulsdorf-Nord", "Kienberg (Gärten der Welt)", "Cottbusser Platz", "Hellersdorf", "Louis-Lewin-Straße", "Hönow"],
  U6: ["Alt-Tegel", "Borsigwerke", "Holzhauser Straße", "Otisstraße", "Scharnweberstraße", "Kurt-Schumacher-Platz", "Afrikanische Straße", "Rehberge", "Seestraße", "Leopoldplatz", "Wedding", "Reinickendorfer Straße", "Schwartzkopffstraße", "Naturkundemuseum", "Oranienburger Tor", "Friedrichstraße", "Unter den Linden", "Stadtmitte", "Kochstraße", "Hallesches Tor", "Mehringdamm", "Platz der Luftbrücke", "Paradestraße", "Tempelhof", "Alt-Tempelhof", "Kaiserin-Augusta-Straße", "Ullsteinstraße", "Westphalweg", "Alt-Mariendorf"],
  U7: ["Rathaus Spandau", "Altstadt Spandau", "Zitadelle", "Haselhorst", "Paulsternstraße", "Rohrdamm", "Siemensdamm", "Halemweg", "Jakob-Kaiser-Platz", "Jungfernheide", "Mierendorffplatz", "Richard-Wagner-Platz", "Bismarckstraße", "Wilmersdorfer Straße", "Adenauerplatz", "Konstanzer Straße", "Fehrbelliner Platz", "Blissestraße", "Berliner Straße", "Bayerischer Platz", "Eisenacher Straße", "Kleistpark", "Yorckstraße", "Möckernbrücke", "Mehringdamm", "Gneisenaustraße", "Südstern", "Hermannplatz", "Rathaus Neukölln", "Karl-Marx-Straße", "Neukölln", "Grenzallee", "Blaschkoallee", "Parchimer Allee", "Britz-Süd", "Johannisthaler Chaussee", "Lipschitzallee", "Wutzkyallee", "Zwickauer Damm", "Rudow"],
  U8: ["Wittenau", "Rathaus Reinickendorf", "Karl-Bonhoeffer-Nervenklinik", "Lindauer Allee", "Paracelsus-Bad", "Residenzstraße", "Franz-Neumann-Platz", "Osloer Straße", "Pankstraße", "Gesundbrunnen", "Voltastraße", "Bernauer Straße", "Rosenthaler Platz", "Weinmeisterstraße", "Alexanderplatz", "Jannowitzbrücke", "Heinrich-Heine-Straße", "Moritzplatz", "Kottbusser Tor", "Schönleinstraße", "Hermannplatz", "Boddinstraße", "Leinestraße", "Hermannstraße"],
  U9: ["Osloer Straße", "Nauener Platz", "Leopoldplatz", "Amrumer Straße", "Westhafen", "Birkenstraße", "Turmstraße", "Hansaplatz", "Zoologischer Garten", "Kurfürstendamm", "Spichernstraße", "Güntzelstraße", "Berliner Straße", "Bundesplatz", "Friedrich-Wilhelm-Platz", "Walther-Schreiber-Platz", "Schloßstraße", "Rathaus Steglitz"],
};

/** One entry per line and station ("U1 - Kurfürstendamm", "U9 - Kurfürstendamm"), in line order. */
export const UBAHN_STATIONS: readonly string[] = Object.entries(UBAHN_LINES).flatMap(([line, stations]) => stations.map((s) => `${line} - ${s}`));

export const EXTRA_COLLECTIONS: readonly ExtraCollection[] = [
  { id: "ubahn", name: "U-Bahn", values: UBAHN_STATIONS },
];

export const extraCollection = (id: string): ExtraCollection | undefined => EXTRA_COLLECTIONS.find((c) => c.id === id);

/** Validates an `extra` object: known collection ids only, each value from that collection. Returns the error or null. */
export function validateExtra(v: unknown): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "extra must be an object";
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const c = extraCollection(k);
    if (!c) return `unknown extra collection "${k}"`;
    if (typeof val !== "string" || !c.values.includes(val)) return `invalid ${c.name} value`;
  }
  return null;
}

/** "U-Bahn: U1 - Kurfürstendamm · ..." */
export function extraLabel(extra: Record<string, string> | null | undefined): string {
  if (!extra) return "";
  return Object.entries(extra).map(([k, v]) => `${extraCollection(k)?.name ?? k}: ${v}`).join(" · ");
}
