import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { dayLight, lightLabel, localDay, PHASE_ICONS, shootableWindows, type DayLight, type Interval } from "@fielder/vocab";
import { deleteDay, fetchDays, putDay, type DayShot, type Shot, type ShootingDay } from "./api";
import { Combobox } from "./Combobox";
import { cover, shotTitle } from "./format";
import { Framed, type MaskMode } from "./Framed";
import { Empty, ErrorLine, Icon } from "./ui";
import { fetchForecast, weatherText, type HourForecast } from "./weather";

interface Props {
  projectId: string;
  /** The project's shots. */
  shots: Shot[];
  mask: MaskMode;
  onOpen: (s: Shot, list: Shot[]) => void;
}

const BERLIN = { lat: 52.52, lon: 13.405 };
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
          <div class="views-head"><strong>Shooting days</strong><button class="f-btn f-btn--sm" onClick={() => void create()}><Icon name="plus" />New day</button></div>
          {!days ? <div class="meta">Loading…</div> : days.length === 0 ? <div class="meta">No shooting days yet.</div> : days.map((d) => (
            <button key={d.id} class={`view-item ${d.id === selectedId ? "active" : ""} ${d.date < today ? "past" : ""}`} onClick={() => setSelectedId(d.id)}>
              <span>{dateLabel(d.date)}{d.title ? <span class="meta"> · {d.title}</span> : null}</span>
              <span class="count" title={`${d.shots.length} shots planned`}>{d.shots.length}</span>
            </button>
          ))}
        </div>
        <div class="views-save">
          <span class={saving === "error" ? "warn" : "meta"}><Icon name={saving === "error" ? "alert" : saving === "idle" ? "check" : "cloud-upload-outline"} /> {saving === "pending" || saving === "saving" ? "Saving…" : saving === "error" ? "Not saved" : "All changes saved"}</span>
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>
      </aside>
      <section class="views-main">
        {day ? <DayEditor key={day.id} day={day} shots={shots} mask={mask} onChange={change} onDelete={() => void remove(day)} onOpen={onOpen} />
          : <Empty icon="calendar-blank-outline" title={days && days.length ? "Pick a day" : "No shooting days yet"}>{days && days.length ? null : "Create a shooting day to start planning."}</Empty>}
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
        <input type="date" class="day-date" value={day.date} onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange({ ...day, date: v }); }} />
        <input class="grow" placeholder="Title, e.g. Park + U-Bahn" value={day.title ?? ""} onInput={(e) => onChange({ ...day, title: (e.target as HTMLInputElement).value || null })} />
        <button class="f-btn f-btn--danger" onClick={onDelete}><Icon name="delete-outline" />Delete day</button>
      </div>
      <textarea class="day-notes" rows={2} placeholder="Notes for the day (call time, permits, crew…)" value={day.notes ?? ""} onInput={(e) => onChange({ ...day, notes: (e.target as HTMLTextAreaElement).value || null })} />

      <Timeline light={light} forecast={forecast} start={start} hours={hours} />

      <div class="day-shots">
        <div class="panel-title"><Icon name="format-list-numbered" />Planned shots</div>
        {groups.length === 0 && <div class="meta">No shots planned yet.</div>}
        {groups.map((g, gi) => {
          const union = mergeIntervals(g.items.flatMap(({ shot }) => shootableWindows(light, shot.light)));
          return (
            <div class="loc-group" key={`${g.name}-${gi}`}>
              <div class="loc-head"><Icon name="map-marker-outline" /><strong>{g.name}</strong><span class="meta num">{g.items.length} shot{g.items.length === 1 ? "" : "s"} · light fits {windowsText(union)}</span></div>
              {g.items.map(({ ds, shot, index }) => {
                const w = shootableWindows(light, shot.light);
                const fits = plannedFits(ds.planned_time, start, w);
                return (
                  <div class="plan-row" key={shot.id}>
                    <div class="thumb" onClick={() => onOpen(shot, planned.map((x) => x.shot))}><Framed photo={cover(shot)} mode={mask} /></div>
                    <div class="plan-main">
                      <div class="plan-title">{shotTitle(shot)}{shot.photos.length > 1 && <span class="meta"> · {shot.photos.length} photos</span>}</div>
                      <div class="meta num">{lightLabel(shot.light, shot.artificial) || "No light requirement"} · {windowsText(w)}</div>
                      <WindowBar light={light} windows={w} planned={ds.planned_time} fits={fits} start={start} hours={hours} />
                      {!fits && <span class="f-tl__warn"><Icon name="alert" />Planned {ds.planned_time} is outside the window</span>}
                    </div>
                    <label class={`plan-time ${fits ? "" : "bad"}`}>Planned<input type="time" value={ds.planned_time ?? ""} onInput={(e) => setShots(day.shots.map((x) => (x === ds ? { ...x, planned_time: (e.target as HTMLInputElement).value || null } : x)))} /></label>
                    <div class="plan-actions">
                      <button class="f-btn f-btn--secondary f-btn--icon f-btn--sm" title="Earlier" aria-label="Earlier" disabled={index === 0} onClick={() => move(index, -1)}><Icon name="arrow-up" /></button>
                      <button class="f-btn f-btn--secondary f-btn--icon f-btn--sm" title="Later" aria-label="Later" disabled={index === day.shots.length - 1} onClick={() => move(index, 1)}><Icon name="arrow-down" /></button>
                      <button class="f-btn f-btn--danger f-btn--icon f-btn--sm" title="Remove from the day" aria-label="Remove from the day" onClick={() => setShots(day.shots.filter((x) => x !== ds))}><Icon name="close" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div class="form-actions">
        <button class={adding ? "f-btn f-btn--secondary" : "f-btn"} onClick={() => setAdding(!adding)}><Icon name={adding ? "chevron-up" : "plus"} />{adding ? "Hide shot picker" : "Add shots"}</button>
        {planned.some((x) => x.ds.planned_time) && <button class="f-btn f-btn--secondary" onClick={() => setShots([...day.shots].sort((a, b) => (a.planned_time ?? "99").localeCompare(b.planned_time ?? "99")))}><Icon name="sort-clock-ascending-outline" />Sort by planned time</button>}
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

/** Whether a planned HH:MM on the day falls inside one of the windows (no time planned counts as fitting). */
function plannedFits(planned: string | null, start: Date, windows: Interval[]): boolean {
  if (!planned) return true;
  const at = atTime(start, planned);
  return windows.some((w) => at >= w.start && at < w.end);
}
function atTime(start: Date, hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(start); d.setHours(h, m, 0, 0); return d;
}

/** The day's light phases, sunrise/sunset and now, with the hourly forecast on the same time axis below. */
function Timeline({ light, forecast, start, hours }: { light: DayLight; forecast: HourForecast[] | null | "loading"; start: Date; hours: number }) {
  const x = (d: Date) => `${pctOf(d, start, hours)}%`;
  const w = (a: Date, b: Date) => pctOf(b, start, hours) - pctOf(a, start, hours);
  const ticks = Array.from({ length: Math.floor(hours / 3) + 1 }, (_, i) => new Date(start.getTime() + i * 3 * 3_600_000));
  const now = new Date();
  const showNow = now >= start && now.getTime() < start.getTime() + hours * 3_600_000;
  const twilight = light.phases.filter((p) => p.phase === "dawn" || p.phase === "dusk");
  return (
    <div class="panel">
      <div class="panel-title"><Icon name="weather-sunset" />Light and forecast</div>
      <div class="tl-grid">
        <span class="f-wx__lbl"><Icon name="white-balance-sunny" />Light</span>
        <div class="f-tl__track">
          {light.phases.map((p) => {
            const width = w(p.start, p.end);
            return (
              <div key={p.start.toISOString()} class={`f-tl__seg f-tl__seg--${p.phase}`} title={`${p.phase} ${hhmm(p.start)}–${hhmm(p.end)}`} style={{ left: x(p.start), width: `${width}%` }}>
                {width > 4 && <Icon name={PHASE_ICONS[p.phase]} />}{width > 9 && p.phase}
              </div>
            );
          })}
          <div class="f-tl__overlay">
            {light.sunrise && <div class="f-tl__mark f-tl__mark--sun" style={{ left: x(light.sunrise) }} title={`Sunrise ${hhmm(light.sunrise)}`} />}
            {light.sunset && <div class="f-tl__mark f-tl__mark--sun" style={{ left: x(light.sunset) }} title={`Sunset ${hhmm(light.sunset)}`} />}
            {showNow && <div class="f-tl__mark f-tl__mark--now" style={{ left: x(now) }} title={`Now ${hhmm(now)}`} />}
          </div>
        </div>
        <span />
        <div class="f-tl__ticks">{ticks.map((t, i) => <span key={t.toISOString()} style={{ left: x(t), transform: i === 0 ? "none" : i === ticks.length - 1 && pctOf(t, start, hours) >= 99 ? "translateX(-100%)" : undefined }}>{hhmm(t)}</span>)}</div>
        {forecast === "loading" ? <><span /><span class="f-loading meta"><span class="f-spinner" />Loading forecast…</span></>
          : forecast === null ? <><span /><div class="f-wx__none"><Icon name="calendar-question" />No forecast for this date yet: Open-Meteo reaches about 16 days ahead.</div></>
          : (
            <>
              <span class="f-wx__lbl"><Icon name="weather-cloudy" />Cloud</span>
              <div class="wx-track wx-cloud">
                {forecast.map((h) => <div key={h.time.toISOString()} class="f-wx__cloud" style={{ left: x(h.time), width: `${100 / hours}%` }} title={hourTitle(h)}><i style={{ top: "auto", right: 0, height: `${h.cloudPct}%` }} /></div>)}
              </div>
              <span class="f-wx__lbl"><Icon name="weather-rainy" />Rain</span>
              <div class="wx-track wx-rain">
                {forecast.map((h) => <div key={h.time.toISOString()} class="f-wx__rain" style={{ left: x(h.time), width: `${100 / hours}%` }} title={hourTitle(h)}><i class={(h.precipProb ?? 0) < 30 ? "is-low" : ""} style={{ height: `${Math.max(h.precipProb ?? 0, 8)}%` }} /></div>)}
              </div>
              <span class="f-wx__lbl"><Icon name="thermometer" />Temp</span>
              <div class="wx-track wx-temp">
                {forecast.filter((h) => h.time.getHours() % 3 === 0).map((h) => <span key={h.time.toISOString()} class="f-wx__temp" style={{ left: x(h.time) }} title={hourTitle(h)}>{Math.round(h.tempC)}°</span>)}
              </div>
            </>
          )}
      </div>
      <div class="f-tl__keys num">
        {light.sunrise && <span><Icon name="weather-sunset-up" />Sunrise <b>{hhmm(light.sunrise)}</b></span>}
        {light.sunset && <span><Icon name="weather-sunset-down" />Sunset <b>{hhmm(light.sunset)}</b></span>}
        {twilight.map((p) => <span key={p.start.toISOString()}>{p.phase === "dawn" ? "Dawn" : "Dusk"} <b>{hhmm(p.start)}–{hhmm(p.end)}</b></span>)}
        <span>Sun max <b>{light.maxElevation.toFixed(0)}°</b></span>
        {Array.isArray(forecast) && <span class="meta">Rain bars from 30 %. Hover for details.</span>}
      </div>
    </div>
  );
}

const hourTitle = (h: HourForecast) => `${hhmm(h.time)}: ${weatherText(h.code)}, ${Math.round(h.tempC)} °C, cloud ${h.cloudPct} %${h.precipProb != null ? `, rain ${h.precipProb} %` : ""}`;

function WindowBar({ light, windows, planned, fits, start, hours }: { light: DayLight; windows: Interval[]; planned: string | null; fits: boolean; start: Date; hours: number }) {
  const plannedAt = planned ? atTime(start, planned) : null;
  return (
    <div class="win-bar">
      {light.phases.map((p) => <div key={p.start.toISOString()} class={`win-phase phase-${p.phase}`} style={{ left: `${pctOf(p.start, start, hours)}%`, width: `${pctOf(p.end, start, hours) - pctOf(p.start, start, hours)}%` }} />)}
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
        <label class="labelled">Location<Combobox options={locations} value={location} onChange={setLocation} placeholder="All locations" /></label>
        <label class="check"><input type="checkbox" checked={onlyApproved} onChange={() => setOnlyApproved(!onlyApproved)} /> Approved only</label>
      </div>
      {candidates.length === 0 && <div class="meta">No more shots to add{onlyApproved ? " (approve shots in Review first, or untick “Approved only”)" : ""}.</div>}
      {[...byLocation.entries()].map(([name, list]) => (
        <div key={name} class="picker-group">
          <div class="loc-head"><Icon name="map-marker-outline" /><strong>{name}</strong> <button class="f-linkbtn" onClick={() => onAdd(list.map((s) => s.id))}>Add all {list.length}</button></div>
          <div class="picker-grid">
            {list.map((s) => {
              const w = shootableWindows(light, s.light);
              return (
                <button key={s.id} class="picker-card" onClick={() => onAdd([s.id])} title="Add to the day">
                  <Framed photo={cover(s)} mode={mask} />
                  <div class="title">{shotTitle(s)}</div>
                  <div class={`meta num ${w.length ? "" : "warn"}`}>{!w.length && <Icon name="alert" />} {lightLabel(s.light, s.artificial) || "Any light"} · {w.length ? windowsText(w) : "no fitting light"}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
