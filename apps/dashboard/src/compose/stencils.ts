/**
 * Stencil glyphs for lighting diagrams and floor plans: stroke-only SVG paths in a 24 × 24 box
 * centred on (12, 12). The same path data draws them in the SVG editor and on the render canvas
 * (Path2D), so there is no icon font involved and the render matches the screen.
 */
import type { Stencil } from "@fielder/vocab";

export const STENCIL_PATHS: Record<Stencil, string> = {
  // A camera seen from above: body with the lens pointing right.
  camera: "M3 7h11v10H3z M14 10l7-3v10l-7-3z M6 7V5h5v2",
  // A lamp head with rays.
  light: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1l2.1-2.1 M17 7l2.1-2.1",
  // Head and shoulders.
  actor: "M12 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M5 21v-2a7 7 0 0 1 14 0v2",
  // A pole with a flag (a mark, a position).
  flag: "M5 22V3 M5 3h13l-3 4 3 4H5",
};
export const STENCIL_BOX = 24;
/** Stroke width in glyph units. */
export const STENCIL_STROKE = 2;
