import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, deleteLocation, putLocation, type Location } from "./api";
import { useKeys } from "./keys";
import { confirmDialog, cx, ErrorLine, Icon, Kbd, toast } from "./ui";

interface Props {
  locations: Location[];
  onChange: (l: Location[]) => void;
  onShotsChanged: () => void;
  /** Open Shots filtered to this location (grid or map). */
  onShowShots: (locationId: string, layout: "grid" | "map") => void;
}

const sortByName = (list: Location[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Library › Locations: shared by all projects. Inline rename, counts that open Shots, delete with confirm. */
export function LocationsPage({ locations, onChange, onShotsChanged, onShowShots }: Props) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(0);
  const [edit, setEdit] = useState<{ id: string; name: string; error: string | null } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const shown = locations.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cur = shown[focus];
  useEffect(() => { if (focus >= shown.length) setFocus(Math.max(0, shown.length - 1)); }, [shown.length]);
  useEffect(() => { body.current?.children[focus]?.scrollIntoView({ block: "nearest" }); }, [focus]);

  async function save() {
    if (!edit) return;
    const name = edit.name.trim();
    const old = locations.find((l) => l.id === edit.id);
    if (!name || name === old?.name) { setEdit(null); return; }
    try {
      const saved = await putLocation({ id: edit.id, name });
      onChange(sortByName([...locations.filter((l) => l.id !== saved.id), saved]));
      setEdit(null);
      onShotsChanged();
    } catch (err) {
      setEdit({ ...edit, error: err instanceof ApiError && err.status === 409 ? `“${name}” already exists. Names are unique.` : (err as Error).message });
    }
  }
  async function remove(l: Location) {
    const ok = await confirmDialog({ title: `Delete “${l.name}”?`, body: l.shot_count ? `${l.shot_count} shot(s) lose their location. Their photos and tags are kept.` : "No shots use it.", confirmLabel: "Delete location", danger: true });
    if (!ok) return;
    try { await deleteLocation(l.id); onChange(locations.filter((x) => x.id !== l.id)); onShotsChanged(); toast("Location deleted"); } catch (e) { toast(`Delete failed: ${(e as Error).message}`, "danger"); }
  }
  useKeys({
    "/": () => search.current?.focus(),
    j: () => setFocus((f) => Math.min(shown.length - 1, f + 1)), k: () => setFocus((f) => Math.max(0, f - 1)),
    ArrowDown: () => setFocus((f) => Math.min(shown.length - 1, f + 1)), ArrowUp: () => setFocus((f) => Math.max(0, f - 1)),
    F2: () => { if (cur) setEdit({ id: cur.id, name: cur.name, error: null }); },
    Enter: () => { if (cur) onShowShots(cur.id, "grid"); },
    Delete: () => { if (cur) void remove(cur); },
  }, !edit);

  return (
    <>
      <div class="f-toolbar">
        <div class="f-toolbar__title"><span>Locations</span><span class="meta num" style={{ fontSize: "var(--text-body)" }}>{locations.length}</span></div>
        <span class="f-toolbar__sp" />
        <label class="f-input f-input--sm f-input--search"><i class="mdi mdi-magnify f-input__icon" aria-hidden="true" /><input ref={search} value={q} placeholder="Filter locations" aria-label="Filter locations" onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }} /><Kbd>/</Kbd></label>
      </div>
      <div class="f-scroll">
        <table class="f-table">
          <thead><tr><th>Name</th><th class="is-num">Shots</th><th class="is-num">Approved</th><th style={{ width: "1%" }} /></tr></thead>
          <tbody ref={body}>
            {shown.map((l, i) => {
              const editing = edit?.id === l.id;
              return (
                <tr key={l.id} class={cx(editing && "is-editing", i === focus && !editing && "is-focus")} onClick={() => setFocus(i)}>
                  <td class="is-strong is-wrap">
                    {editing ? (
                      <div class="f-field" style={{ maxWidth: "420px" }}>
                        <span class={cx("f-input f-input--sm is-focus", edit.error && "is-error")}>
                          <input autoFocus value={edit.name} aria-label="Location name" onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value, error: null })}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }} />
                          <span style={{ marginRight: "6px" }}><Kbd>↵</Kbd></span>
                        </span>
                        {edit.error && <ErrorLine>{edit.error}</ErrorLine>}
                      </div>
                    ) : l.name}
                  </td>
                  <td class="is-num"><a href="#" onClick={(e) => { e.preventDefault(); onShowShots(l.id, "grid"); }}>{l.shot_count}</a></td>
                  <td class="is-num">{l.approved_count}</td>
                  <td>
                    <div class="btn-row" style={{ gap: "2px", flexWrap: "nowrap" }}>
                      <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Rename (F2)" title="Rename (F2)" onClick={(e) => { e.stopPropagation(); setEdit({ id: l.id, name: l.name, error: null }); }}><Icon name="pencil-outline" /></button>
                      <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Show on map" title="Show on map" disabled={l.shot_count === 0} onClick={(e) => { e.stopPropagation(); onShowShots(l.id, "map"); }}><Icon name="map-marker-outline" /></button>
                      <button type="button" class="f-btn f-btn--ghost f-btn--sm f-btn--icon" aria-label="Delete…" title="Delete…" onClick={(e) => { e.stopPropagation(); void remove(l); }}><Icon name="delete-outline" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={4} class="is-dim">{locations.length ? "No location matches." : "No locations yet. They are created when a shot is tagged, here or on the phone."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
