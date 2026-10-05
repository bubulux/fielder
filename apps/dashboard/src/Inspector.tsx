import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { INT_EXT, label, lightLabel, WEATHER, type Extra, type FieldDef } from "@fielder/vocab";
import { existingIdOf, fetchDays, patchShot, putLocation, type Location, type Photo, type Project, type Shot, type ShootingDay, type ShotState } from "./api";
import { ExtraEditor } from "./ExtraEditor";
import { coords, fovLabel, placeLabel, rigDescription, shotTitle } from "./format";
import { Button, Combobox, Icon, Input, LightChips, SaveStatus, Seg, StateMarker, type SaveState } from "./ui";

// Shooting days per project, fetched on demand for the "Days" fact and the move warning.
const daysCache = new Map<string, Promise<ShootingDay[]>>();
export const projectDays = (projectId: string) => {
  let p = daysCache.get(projectId);
  if (!p) { p = fetchDays(projectId).catch(() => []); daysCache.set(projectId, p); }
  return p;
};
/** Call after a day was saved or deleted so the next read is fresh. */
export const invalidateDays = (projectId?: string) => (projectId ? daysCache.delete(projectId) : daysCache.clear());

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

interface Props {
  shot: Shot;
  /** The photo on the stage; camera facts are per photo. */
  photo: Photo;
  projects: Project[];
  /** Extra-field definitions of the shot's project. */
  fields: readonly FieldDef[];
  locations: Location[];
  onLocations: (l: Location[]) => void;
  onUpdated: (s: Shot) => void;
  onState: (state: ShotState) => void;
  stateBusy: boolean;
  onCorrect: () => void;
  onOpenDay: (projectId: string, dayId: string) => void;
}

/** Right-hand inspector of the shot view and Review: decision, tags (saved per change), facts. */
export function Inspector({ shot, photo, projects, fields, locations, onLocations, onUpdated, onState, stateBusy, onCorrect, onOpenDay }: Props) {
  const [save, setSave] = useState<SaveState>("idle");
  const last = useRef<Parameters<typeof patchShot>[1] | null>(null);
  const [name, setName] = useState(shot.name ?? "");
  const [extra, setExtra] = useState<Extra>(shot.extra);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [days, setDays] = useState<ShootingDay[]>([]);
  const [raw, setRaw] = useState(false);
  const extraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setName(shot.name ?? ""); setExtra(shot.extra); setMoveTo(null); setSave("idle"); }, [shot.id]);
  useEffect(() => { let live = true; void projectDays(shot.project_id).then((d) => { if (live) setDays(d.filter((x) => x.shots.some((s) => s.shot_id === shot.id))); }); return () => { live = false; }; }, [shot.id, shot.project_id]);

  async function patch(p: Parameters<typeof patchShot>[1]) {
    last.current = p;
    setSave("saving");
    try { onUpdated(await patchShot(shot.id, p)); setSave("saved"); } catch { setSave("error"); }
  }
  const retry = () => { if (last.current) void patch(last.current); };
  const commitName = () => { const n = name.trim() || null; if (n !== (shot.name ?? null)) void patch({ name: n }); };
  const changeExtra = (v: Extra) => {
    setExtra(v);
    setSave("dirty");
    if (extraTimer.current) clearTimeout(extraTimer.current);
    extraTimer.current = setTimeout(() => void patch({ extra: v }), 700);
  };
  async function setLocation(id: string | null, createName?: string) {
    if (createName) {
      setSave("saving");
      try {
        const created = await putLocation({ id: crypto.randomUUID(), name: createName });
        onLocations([...locations, created].sort((a, b) => a.name.localeCompare(b.name)));
        id = created.id;
      } catch (err) {
        const existing = existingIdOf(err);
        if (!existing) { setSave("error"); return; }
        id = existing;
      }
    }
    void patch({ location_id: id });
  }
  const pickProject = (v: string | null) => {
    if (!v || v === shot.project_id) { setMoveTo(null); return; }
    if (days.length === 0) void patch({ project_id: v });
    else setMoveTo(v);
  };

  const unrev = shot.state === "unreviewed";
  const f = photo.framing ?? {};
  const dev = photo.device ?? {};
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name, hint: l.shot_count ? `${l.shot_count}` : undefined }));
  const projectName = projects.find((p) => p.id === shot.project_id)?.name ?? shot.project_name ?? "";

  return (
    <aside class="f-panel inspector" aria-label="Inspector">
      <div class="f-panel__body f-panel__body--flush">
        <div class="f-sec" style={{ gap: "10px" }}>
          <div class="inspector__title"><h1>{shotTitle(shot)}</h1><StateMarker state={shot.state} lg /></div>
          <span class="meta" style={{ fontSize: "var(--text-small)" }}>{[placeLabel(shot) || "No location", label(shot.int_ext).toUpperCase(), lightLabel(shot.light, shot.artificial)].filter(Boolean).join(" · ")}</span>
          <div class="btn-row" style={{ flexWrap: "nowrap" }}>
            {unrev ? (
              <>
                <Button kind="approve" icon="check-circle" kbd="A" style={{ flex: 1 }} disabled={stateBusy} onClick={() => onState("approved")}>Approve</Button>
                <Button kind="archive" icon="archive" kbd="E" style={{ flex: 1 }} disabled={stateBusy} onClick={() => onState("archived")}>Archive</Button>
              </>
            ) : (
              <>
                <Button kind="archive" icon="undo-variant" kbd={shot.state === "archived" && "E"} style={{ flex: 1 }} disabled={stateBusy} onClick={() => onState("unreviewed")}>Back to review</Button>
                {shot.state === "approved"
                  ? <Button kind="archive" icon="archive" kbd="E" style={{ flex: 1 }} disabled={stateBusy} onClick={() => onState("archived")}>Archive</Button>
                  : <Button kind="approve" icon="check-circle" kbd="A" style={{ flex: 1 }} disabled={stateBusy} onClick={() => onState("approved")}>Approve</Button>}
              </>
            )}
          </div>
        </div>

        <div class="f-sec">
          <div class="f-sec__head"><Icon name="tag-outline" />Tags<span class="f-sec__aside"><SaveStatus state={save} onRetry={retry} /></span></div>
          <div class="f-formgrid">
            <label>Project</label>
            <div class="f-field">
              <Combobox small options={projects.map((p) => ({ value: p.id, label: p.name }))} value={moveTo ?? shot.project_id} clearable={false} onChange={pickProject} onCancel={() => setMoveTo(null)} />
              {moveTo && (
                <div class="move-warn">
                  <span class="f-field__help" style={{ color: "var(--warn-ink)", fontWeight: 600, display: "flex", gap: "4px" }}><Icon name="alert" />Leaves {days.length} shooting day{days.length === 1 ? "" : "s"} in {projectName}.</span>
                  <div class="btn-row" style={{ gap: "6px" }}>
                    <Button size="sm" onClick={() => { const v = moveTo; setMoveTo(null); void patch({ project_id: v }); }}>Move</Button>
                    <Button kind="ghost" size="sm" onClick={() => setMoveTo(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
            <label for="ins-name">Name</label>
            <Input sm id="ins-name" value={name} maxLength={120} placeholder="e.g. Bridge from the east bank" onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setName(shot.name ?? ""); (e.target as HTMLInputElement).blur(); } }} />
            <label>Location</label>
            <Combobox small icon="map-marker-outline" options={locationOptions} value={shot.location_id} placeholder="Search or create…" onChange={(v) => void setLocation(v)} onCreate={(t) => void setLocation(null, t)} />
            <label>INT/EXT</label>
            <Seg label="INT/EXT" value={shot.int_ext ?? "none"} onChange={(v) => void patch({ int_ext: v === "none" ? null : v })} options={[...INT_EXT.map((v) => ({ id: v, label: label(v).toUpperCase() })), { id: "none", label: "–", title: "Not set" }]} />
            <label style={{ alignSelf: "start", paddingTop: "8px" }}>Light</label>
            <LightChips light={shot.light} artificial={shot.artificial} onChange={(l, a) => void patch({ light: l, artificial: a })} />
            <label>Weather</label>
            <Combobox small options={WEATHER.map((v) => ({ value: v, label: label(v) }))} value={shot.weather} placeholder="—" onChange={(v) => void patch({ weather: v })} />
          </div>
          {fields.length > 0 && (
            <>
              <div class="f-sec__head" style={{ marginTop: "4px", color: "var(--text-dim)" }}>Extra · {projectName}</div>
              <div class="inspector__extra"><ExtraEditor defs={fields} value={extra} onChange={changeExtra} /></div>
            </>
          )}
        </div>

        <div class="f-sec">
          <div class="f-sec__head"><Icon name="crosshairs-gps" />Position<span class="f-sec__aside"><Button kind="secondary" size="sm" style={{ height: "26px" }} onClick={onCorrect}>Correct</Button></span></div>
          <dl class="f-facts">
            <dt>{shot.photos.length > 1 ? `Photo ${photo.ordinal + 1}` : "Photo"}</dt>
            <dd><a href={`https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lon}#map=17/${photo.lat}/${photo.lon}`} target="_blank" rel="noreferrer">{coords(photo)}</a></dd>
            <dt>Accuracy</dt><dd>{photo.position_corrected ? "corrected by hand" : photo.gps_accuracy_m != null ? `±${Math.round(photo.gps_accuracy_m)} m` : "unknown"}</dd>
          </dl>
        </div>

        <div class="f-sec">
          <div class="f-sec__head"><Icon name="information-outline" />Shot</div>
          <dl class="f-facts">
            <dt>Captured</dt><dd>{stamp(shot.captured_at)}</dd>
            <dt>Photos</dt><dd>{shot.photos.length}{shot.photos.length > 1 ? " · sequence" : ""}</dd>
            <dt>Uploaded</dt><dd>{stamp(shot.created_at)}</dd>
            <dt>Days</dt><dd>{days.length === 0 ? <span class="meta">not planned</span> : days.map((d, i) => <Fragment key={d.id}>{i > 0 && ", "}<a href="#" onClick={(e) => { e.preventDefault(); onOpenDay(shot.project_id, d.id); }}>{dayLabel(d.date)}</a></Fragment>)}</dd>
          </dl>
        </div>

        <div class="f-sec">
          <div class="f-sec__head"><Icon name="camera-outline" />Camera{shot.photos.length > 1 ? ` · photo ${photo.ordinal + 1} of ${shot.photos.length}` : ""}</div>
          <dl class="f-facts">
            <dt>Rig</dt><dd>{[photo.preset_name ?? (f.preset_name as string | undefined) ?? "deleted / unsynced", rigDescription(photo)].filter(Boolean).join(" · ")}</dd>
            <dt>Lens</dt><dd>{photo.lens_mm} mm{typeof f.full_frame_equivalent_mm === "number" ? ` · FF ${f.full_frame_equivalent_mm} mm` : ""}</dd>
            <dt>FOV</dt><dd>{fovLabel(photo).replace(/^[^·]*mm FF-eq · /, "") || "n/a"}{typeof f.rig_orientation === "string" ? ` · ${f.rig_orientation}` : ""}</dd>
            <dt>Time</dt><dd>{new Date(photo.timestamp).toLocaleTimeString()}</dd>
            <dt>GPS</dt><dd>{[photo.gps_accuracy_m != null ? `±${Math.round(photo.gps_accuracy_m)} m` : null, typeof dev.gps_fix_age_ms === "number" ? `fix ${Math.round(dev.gps_fix_age_ms / 1000)} s old` : null, typeof dev.gps_altitude_m === "number" ? `${Math.round(dev.gps_altitude_m)} m alt.` : null].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Phone</dt><dd>{[dev.phone_model, typeof f.phone_equivalent_focal_mm === "number" ? `${f.phone_equivalent_focal_mm} mm equiv.` : null].filter(Boolean).join(" · ") || "—"}</dd>
          </dl>
        </div>

        <div class={raw ? "f-sec" : "f-sec is-collapsed"}>
          <button type="button" class="f-sec__head sec-toggle" aria-expanded={raw} onClick={() => setRaw(!raw)}>
            <Icon name={raw ? "chevron-down" : "chevron-right"} />Raw metadata<span class="f-sec__aside">framing · device</span>
          </button>
          {raw && (
            <>
              <pre class="raw">{JSON.stringify({ id: shot.id, photo: photo.id, framing: photo.framing, device: photo.device }, null, 2)}</pre>
              <Button kind="secondary" size="sm" icon="content-copy" style={{ alignSelf: "flex-start" }} onClick={() => void navigator.clipboard.writeText(JSON.stringify({ framing: photo.framing, device: photo.device }, null, 2))}>Copy</Button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
