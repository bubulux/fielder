import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { dayLight, lightLabel, localDay, shootableWindows, type DayLight, type Interval } from "@fielder/vocab";
import { deleteDay, fetchDays, putDay, type DayShot, type Shot, type ShootingDay } from "./api";
import { Combobox } from "./Combobox";
import { cover, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { fetchForecast, weatherText, type HourForecast } from "./weather";

interface Props {
  projectId: string;
  /** The project's shots. */
  shots: Shot[];
  mask: MaskMode;
  onOpen: (s: Shot, list: Shot[]) => void;
}

const BERLIN = { lat: 52.52, lon: 13.405 };
const PHASE_COLORS: Record<string, string> = { night: "#1c2340", dawn: "#e0925a", day: "#f2d36b", dusk: "#b8628a" };
const hhmm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const windowsText = (w: Interval[]) => (w.length ? w.map((x) => `${hhmm(x.start)}–${hhmm(x.end)}`).join(", ") : "not on this day");
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
/** YYYY-MM-DD in the viewer's time zone (toISOString would give the UTC date). */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return isoDate(d);
}
/** Centre of the shots' cover photos (for sun and weather), Berlin when there are none. */
function centroid(shots: Shot[]): { lat: number; lon: number } {
  if (shots.length === 0) return BERLIN;
  const ps = shots.map(cover);
  return { lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length };
}

/**
 * Plan shooting days: pick approved shots per location for a date, see the day's light phases
 * (computed) and the forecast (Open-Meteo, up to ~16 days ahead), and when each shot can be taken.
 */
export function Schedule({ projectId, shots, mask, onOpen }: Props) {
  const [days, setDays] = useState<ShootingDay[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDays(null); setSelectedId(null);
    fetchDays(projectId).then((d) => { setDays(d); setSelectedId(d.find((x) => x.date >= isoDate(new Date()))?.id ?? d.at(-1)?.id ?? null); }).catch((e: Error) => setError(e.message));
  }, [projectId]);

  // Edits are saved automatically shortly after the last change, per day; leaving the tab saves at once.
  const pendingSaves = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; day: ShootingDay }>());
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const save = (d: ShootingDay) => {
    pendingSaves.current.delete(d.id);
    setSaving("saving");
    putDay(d).then(() => { if (pendingSaves.current.size === 0) setSaving("idle"); }).catch((e: Error) => { setSaving("error"); setError(e.message); });
  };
  useEffect(() => () => { for (const { timer, day } of pendingSaves.current.values()) { clearTimeout(timer); void putDay(day).catch(() => {}); } pendingSaves.current.clear(); }, []);
  function change(d: ShootingDay) {
    setDays((cur) => (cur ?? []).map((x) => (x.id === d.id ? d : x)).sort((a, b) => a.date.localeCompare(b.date)));
    setSaving("pending");
    const prev = pendingSaves.current.get(d.id);
    if (prev) clearTimeout(prev.timer);
    pendingSaves.current.set(d.id, { day: d, timer: setTimeout(() => save(d), 600) });
  }
  async function create() {
    const d: ShootingDay = { id: crypto.randomUUID(), project_id: projectId, date: nextSaturday(), title: null, notes: null, shots: [], created_at: "", updated_at: null };
    try { const saved = await putDay(d); setDays((cur) => [...(cur ?? []), saved].sort((a, b) => a.date.localeCompare(b.date))); setSelectedId(saved.id); } catch (e) { setError((e as Error).message); }
  }
  async function remove(d: ShootingDay) {
    if (!confirm(`Delete the shooting day ${dateLabel(d.date)}${d.title ? ` (${d.title})` : ""}? The shots themselves stay.`)) return;
    try { await deleteDay(d.id); setDays((cur) => (cur ?? []).filter((x) => x.id !== d.id)); setSelectedId(null); } catch (e) { setError((e as Error).message); }
  }

  const day = days?.find((d) => d.id === selectedId) ?? null;
  const today = isoDate(new Date());
  return (
    <div class="schedule">
      <aside class="views-side">
        <div class="views-list">
          <div class="views-head"><strong>Shooting days</strong><button class="btn" onClick={() => void create()}>＋ New day</button></div>
          {!days ? <div class="meta">Loading…</div> : days.length === 0 ? <div class="meta">No shooting days yet.</div> : days.map((d) => (
            <button key={d.id} class={`view-item ${d.id === selectedId ? "active" : ""} ${d.date < today ? "past" : ""}`} onClick={() => setSelectedId(d.id)}>
              <span>{dateLabel(d.date)}{d.title ? <span class="meta"> · {d.title}</span> : null}</span>
              <span class="meta">{d.shots.length}</span>
            </button>
          ))}
        </div>
        <div class="views-save">
          <span class="meta">{saving === "pending" || saving === "saving" ? "Saving…" : saving === "error" ? "Not saved" : "All changes saved"}</span>
          {error && <div class="error">{error}</div>}
        </div>
      </aside>
      <section class="views-main">
        {day ? <DayEditor key={day.id} day={day} shots={shots} mask={mask} onChange={change} onDelete={() => void remove(day)} onOpen={onOpen} />
          : <div class="status">{days && days.length ? "Pick a day." : "Create a shooting day to start planning."}</div>}
      </section>
    </div>
  );
}

function DayEditor({ day, shots, mask, onChange, onDelete, onOpen }: { day: ShootingDay; shots: Shot[]; mask: MaskMode; onChange: (d: ShootingDay) => void; onDelete: () => void; onOpen: (s: Shot, list: Shot[]) => void }) {
  const [adding, setAdding] = useState(day.shots.length === 0);
  const byId = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const planned = day.shots.map((ds) => ({ ds, shot: byId.get(ds.shot_id) })).filter((x): x is { ds: DayShot; shot: Shot } => !!x.shot);
  const where = centroid(planned.length ? planned.map((x) => x.shot) : shots);
  const { start, hours } = localDay(day.date);
  const light = useMemo(() => dayLight(start, where.lat, where.lon, hours), [day.date, where.lat, where.lon]);
  const [forecast, setForecast] = useState<HourForecast[] | null | "loading">("loading");
  useEffect(() => {
    setForecast("loading");
    void fetchForecast(where.lat, where.lon, start, new Date(start.getTime() + hours * 3_600_000)).then(setForecast);
  }, [day.date, where.lat.toFixed(2), where.lon.toFixed(2)]);

  const setShots = (list: DayShot[]) => onChange({ ...day, shots: list });
  const move = (i: number, delta: number) => { const l = [...day.shots]; const [x] = l.splice(i, 1); l.splice(i + delta, 0, x); setShots(l); };
  // Group consecutive shots by location, keeping the day's order.
  const groups: { name: string; items: { ds: DayShot; shot: Shot; index: number }[] }[] = [];
  planned.forEach(({ ds, shot }) => {
    const index = day.shots.indexOf(ds);
    const name = shot.location_name ?? "No location";
    const last = groups.at(-1);
    if (last && last.name === name) last.items.push({ ds, shot, index });
    else groups.push({ name, items: [{ ds, shot, index }] });
  });

  return (
    <div class="day-editor">
      <div class="day-head">
        <input type="date" value={day.date} onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange({ ...day, date: v }); }} />
        <input class="grow" placeholder="Title, e.g. Park + U-Bahn" value={day.title ?? ""} onInput={(e) => onChange({ ...day, title: (e.target as HTMLInputElement).value || null })} />
        <button class="btn danger" onClick={onDelete}>Delete day</button>
      </div>
      <textarea class="day-notes" rows={2} placeholder="Notes for the day (call time, permits, crew…)" value={day.notes ?? ""} onInput={(e) => onChange({ ...day, notes: (e.target as HTMLTextAreaElement).value || null })} />

      <Timeline light={light} forecast={forecast} start={start} hours={hours} />

      <div class="day-shots">
        {groups.length === 0 && <div class="meta">No shots planned yet.</div>}
        {groups.map((g, gi) => {
          const union = mergeIntervals(g.items.flatMap(({ shot }) => shootableWindows(light, shot.light)));
          return (
            <div class="loc-group" key={`${g.name}-${gi}`}>
              <div class="loc-head"><strong>{g.name}</strong><span class="meta"> · {g.items.length} shot{g.items.length === 1 ? "" : "s"} · light fits {windowsText(union)}</span></div>
              {g.items.map(({ ds, shot, index }) => {
                const w = shootableWindows(light, shot.light);
                return (
                  <div class="plan-row" key={shot.id}>
                    <div class="thumb" onClick={() => onOpen(shot, planned.map((x) => x.shot))}><Framed photo={cover(shot)} mode={mask} /></div>
                    <div class="plan-main">
                      <div class="plan-title">{shotTitle(shot)}{shot.photos.length > 1 && <span class="meta"> · {shot.photos.length} photos</span>}</div>
                      <div class="meta">{lightLabel(shot.light, shot.artificial) || "no light requirement"} · {windowsText(w)}</div>
                      <WindowBar light={light} windows={w} planned={ds.planned_time} start={start} hours={hours} />
                    </div>
                    <label class="plan-time">Planned<input type="time" value={ds.planned_time ?? ""} onInput={(e) => setShots(day.shots.map((x) => (x === ds ? { ...x, planned_time: (e.target as HTMLInputElement).value || null } : x)))} /></label>
                    <div class="plan-actions">
                      <button class="btn outline" title="Earlier" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button class="btn outline" title="Later" disabled={index === day.shots.length - 1} onClick={() => move(index, 1)}>↓</button>
                      <button class="btn danger" title="Remove from the day" onClick={() => setShots(day.shots.filter((x) => x !== ds))}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" onClick={() => setAdding(!adding)}>{adding ? "Hide shot picker" : "＋ Add shots"}</button>
        {planned.some((x) => x.ds.planned_time) && <button class="btn outline" onClick={() => setShots([...day.shots].sort((a, b) => (a.planned_time ?? "99").localeCompare(b.planned_time ?? "99")))}>Sort by planned time</button>}
      </div>
      {adding && <ShotPicker shots={shots} light={light} taken={new Set(day.shots.map((x) => x.shot_id))} mask={mask} onAdd={(ids) => setShots([...day.shots, ...ids.map((shot_id) => ({ shot_id, planned_time: null, notes: null }))])} />}
    </div>
  );
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out.at(-1);
    if (last && x.start.getTime() <= last.end.getTime()) { if (x.end > last.end) last.end = x.end; }
    else out.push({ start: x.start, end: x.end });
  }
  return out;
}

const pctOf = (d: Date, start: Date, hours: number) => ((d.getTime() - start.getTime()) / (hours * 3_600_000)) * 100;

function Timeline({ light, forecast, start, hours }: { light: DayLight; forecast: HourForecast[] | null | "loading"; start: Date; hours: number }) {
  const ticks = Array.from({ length: Math.floor(hours / 3) + 1 }, (_, i) => new Date(start.getTime() + i * 3 * 3_600_000));
  return (
    <div class="timeline">
      <div class="tl-bar">
        {light.phases.map((p) => (
          <div key={p.start.toISOString()} class={`tl-seg ${p.phase}`} title={`${p.phase} ${hhmm(p.start)}–${hhmm(p.end)}`}
            style={{ left: `${pctOf(p.start, start, hours)}%`, width: `${pctOf(p.end, start, hours) - pctOf(p.start, start, hours)}%`, background: PHASE_COLORS[p.phase] }}>
            <span>{p.phase}</span>
          </div>
        ))}
      </div>
      <div class="tl-ticks">{ticks.map((t) => <span key={t.toISOString()} style={{ left: `${pctOf(t, start, hours)}%` }}>{hhmm(t)}</span>)}</div>
      <div class="tl-facts meta">
        {light.sunrise && <>Sunrise {hhmm(light.sunrise)} · </>}{light.sunset && <>Sunset {hhmm(light.sunset)} · </>}
        {light.phases.filter((p) => p.phase === "dawn" || p.phase === "dusk").map((p) => `${p.phase} ${hhmm(p.start)}–${hhmm(p.end)}`).join(" · ")}
        {" "}· sun max {light.maxElevation.toFixed(0)}°
      </div>
      <div class="tl-weather">
        {forecast === "loading" ? <span class="meta">Loading forecast…</span>
          : forecast === null ? <span class="meta">No forecast for this date yet (Open-Meteo reaches about 16 days ahead).</span>
          : forecast.map((h) => (
            <div key={h.time.toISOString()} class="tl-hour" style={{ left: `${pctOf(h.time, start, hours)}%`, width: `${100 / hours}%` }}
              title={`${hhmm(h.time)}: ${weatherText(h.code)}, ${Math.round(h.tempC)}°C, clouds ${h.cloudPct}%${h.precipProb != null ? `, rain ${h.precipProb}%` : ""}`}>
              <div class="cloud" style={{ opacity: 0.15 + (h.cloudPct / 100) * 0.85 }} />
              {h.precipProb != null && h.precipProb >= 30 && <div class="rain" style={{ height: `${h.precipProb}%` }} />}
              {h.time.getHours() % 3 === 0 && <span>{Math.round(h.tempC)}°</span>}
            </div>
          ))}
      </div>
      {Array.isArray(forecast) && <div class="meta">Forecast: grey = cloud cover, blue = chance of rain (≥ 30%), numbers = temperature. Hover for details.</div>}
    </div>
  );
}

function WindowBar({ light, windows, planned, start, hours }: { light: DayLight; windows: Interval[]; planned: string | null; start: Date; hours: number }) {
  let plannedAt: Date | null = null;
  if (planned) { const [h, m] = planned.split(":").map(Number); plannedAt = new Date(start); plannedAt.setHours(h, m, 0, 0); }
  const fits = !plannedAt || windows.some((w) => plannedAt! >= w.start && plannedAt! < w.end);
  return (
    <div class="win-bar">
      {light.phases.map((p) => <div key={p.start.toISOString()} class="win-phase" style={{ left: `${pctOf(p.start, start, hours)}%`, width: `${pctOf(p.end, start, hours) - pctOf(p.start, start, hours)}%`, background: PHASE_COLORS[p.phase] }} />)}
      {windows.map((w) => <div key={w.start.toISOString()} class="win-ok" style={{ left: `${pctOf(w.start, start, hours)}%`, width: `${pctOf(w.end, start, hours) - pctOf(w.start, start, hours)}%` }} />)}
      {plannedAt && <div class={`win-planned ${fits ? "" : "bad"}`} style={{ left: `${pctOf(plannedAt, start, hours)}%` }} title={fits ? "Planned time" : "Planned outside the shot's light"} />}
    </div>
  );
}

function ShotPicker({ shots, light, taken, mask, onAdd }: { shots: Shot[]; light: DayLight; taken: Set<string>; mask: MaskMode; onAdd: (ids: string[]) => void }) {
  const [location, setLocation] = useState<string | null>(null);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const candidates = shots.filter((s) => !taken.has(s.id) && (!onlyApproved || s.state === "approved") && (!location || (s.location_id ?? "none") === location));
  const locations = [...new Map(shots.map((s) => [s.location_id ?? "none", s.location_name ?? "No location"])).entries()].map(([value, label]) => ({ value, label }));
  const byLocation = new Map<string, Shot[]>();
  for (const s of candidates) { const k = s.location_name ?? "No location"; byLocation.set(k, [...(byLocation.get(k) ?? []), s]); }
  return (
    <div class="shot-picker">
      <div class="picker-head">
        <label>Location<Combobox options={locations} value={location} onChange={setLocation} placeholder="All locations" /></label>
        <label class="check"><input type="checkbox" checked={onlyApproved} onChange={() => setOnlyApproved(!onlyApproved)} /> Approved only</label>
      </div>
      {candidates.length === 0 && <div class="meta">No more shots to add{onlyApproved ? " (approve shots in Review first, or untick “Approved only”)" : ""}.</div>}
      {[...byLocation.entries()].map(([name, list]) => (
        <div key={name} class="picker-group">
          <div class="loc-head"><strong>{name}</strong> <button class="link" onClick={() => onAdd(list.map((s) => s.id))}>add all {list.length}</button></div>
          <div class="picker-grid">
            {list.map((s) => {
              const w = shootableWindows(light, s.light);
              return (
                <button key={s.id} class="picker-card" onClick={() => onAdd([s.id])} title="Add to the day">
                  <Framed photo={cover(s)} mode={mask} />
                  <div class="title">{shotTitle(s)}</div>
                  <div class={`meta ${w.length ? "" : "warn"}`}>{lightLabel(s.light, s.artificial) || "any light"} · {w.length ? windowsText(w) : "no fitting light"}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
