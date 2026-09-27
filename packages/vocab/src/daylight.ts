/**
 * Daylight phases for planning shooting days. Sun position uses the standard low-precision
 * solar formulas (about 0.01° here, far below what matters for light), no dependencies, so the
 * phone can compute it offline too.
 *
 * Phases are defined by sun elevation, which works at any latitude and season:
 *   night  below NIGHT_BELOW (civil twilight ends: too dark without lights)
 *   dawn   between NIGHT_BELOW and DAY_ABOVE in the morning (blue hour + golden hour)
 *   day    above DAY_ABOVE
 *   dusk   between DAY_ABOVE and NIGHT_BELOW in the evening
 */
import type { Light } from "./vocab.ts";

/** Elevation (deg) above which it is "day": the sun is out of the warm, low golden-hour light. */
export const DAY_ABOVE = 6;
/** Elevation (deg) below which it is "night": end of civil twilight. */
export const NIGHT_BELOW = -6;
/** Sunrise/sunset: centre of the sun at -0.833° (refraction + radius). */
const HORIZON = -0.833;

const RAD = Math.PI / 180;

/** Sun elevation above the horizon in degrees. */
export function sunElevation(at: Date, lat: number, lon: number): number {
  const d = at.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude (deg)
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24;
  const hourAngle = (gmstHours * 15 + lon) * RAD - ra;
  const la = lat * RAD;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(hourAngle)) / RAD;
}

export interface Interval { start: Date; end: Date }
export interface PhaseInterval extends Interval { phase: Light }

export interface DayLight {
  phases: PhaseInterval[];
  sunrise: Date | null;
  sunset: Date | null;
  /** Highest elevation of the day and when. */
  noon: Date;
  maxElevation: number;
}

/**
 * Phases over one day. `dayStart` is the instant the day begins (local midnight at the location,
 * as the caller defines it); the day is `hours` long (24, or 23/25 on DST switches).
 */
export function dayLight(dayStart: Date, lat: number, lon: number, hours = 24, stepMin = 1): DayLight {
  const steps = Math.round((hours * 60) / stepMin);
  const t = (i: number) => new Date(dayStart.getTime() + i * stepMin * 60_000);
  const elev: number[] = [];
  let noonI = 0;
  for (let i = 0; i <= steps; i++) {
    elev.push(sunElevation(t(i), lat, lon));
    if (elev[i] > elev[noonI]) noonI = i;
  }
  const phaseAt = (i: number): Light => (elev[i] < NIGHT_BELOW ? "night" : elev[i] > DAY_ABOVE ? "day" : i <= noonI ? "dawn" : "dusk");
  const phases: PhaseInterval[] = [];
  for (let i = 0; i < steps; i++) {
    const p = phaseAt(i);
    const last = phases.at(-1);
    if (last && last.phase === p) last.end = t(i + 1);
    else phases.push({ phase: p, start: t(i), end: t(i + 1) });
  }
  // Linear interpolation of the horizon crossing between two samples.
  const cross = (i: number) => new Date(t(i).getTime() + ((HORIZON - elev[i]) / (elev[i + 1] - elev[i])) * stepMin * 60_000);
  let sunrise: Date | null = null, sunset: Date | null = null;
  for (let i = 0; i < steps; i++) {
    if (!sunrise && elev[i] < HORIZON && elev[i + 1] >= HORIZON) sunrise = cross(i);
    if (elev[i] >= HORIZON && elev[i + 1] < HORIZON) sunset = cross(i);
  }
  return { phases, sunrise, sunset, noon: t(noonI), maxElevation: elev[noonI] };
}

/**
 * When a shot can be taken on a day: the union of the daylight phases it works in. With no phase
 * set (artificial light only, or nothing specified) it works any time. Returns merged, ordered intervals.
 */
export function shootableWindows(day: DayLight, light: readonly string[]): Interval[] {
  if (light.length === 0) return day.phases.length ? [{ start: day.phases[0].start, end: day.phases.at(-1)!.end }] : [];
  const out: Interval[] = [];
  for (const p of day.phases) {
    if (!light.includes(p.phase)) continue;
    const last = out.at(-1);
    if (last && last.end.getTime() === p.start.getTime()) last.end = p.end;
    else out.push({ start: p.start, end: p.end });
  }
  return out;
}

/** Local midnight of a YYYY-MM-DD date in the runtime's time zone, and the length of that day in hours. */
export function localDay(date: string): { start: Date; hours: number } {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const next = new Date(y, m - 1, d + 1);
  return { start, hours: Math.round((next.getTime() - start.getTime()) / 3_600_000) };
}
