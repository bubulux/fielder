# API

All routes live in `apps/worker/src/` and are registered in `index.ts`. Every request passes Cloudflare Access and the JWT check first. Errors are JSON `{ "error": "…" }` with a 4xx/5xx status. Ids are UUIDs chosen by the client unless noted.

## Projects (`projects.ts`, `fields.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/projects` | Each with `shot_count` and `field_ids` (ordered) |
| PUT | `/api/projects/:id` | `{ name, notes? }` upsert. Name clash → `409 { existing_id }` |
| DELETE | `/api/projects/:id` | Only when empty, else `409` |
| PUT | `/api/projects/:id/fields` | `{ field_ids: [...] }` replaces the project's extra-field selection |

## Shots and photos (`shots.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/shots?project_id=&state=&location_id=&limit=&before=&before_id=` | Newest first, keyset pagination on `(captured_at, id)`, `next` cursor. Photos embedded. |
| GET | `/api/shots/:id` | |
| POST | `/api/shots` | Multipart: `metadata` (JSON) + one `photo.<photoId>` file per photo not yet stored. See below. |
| PATCH | `/api/shots/:id` | Any of `name, light, artificial, weather, int_ext, shot_size, camera_support, movement, location_id, extra, description, position_from_location, state, project_id`. `extra` is validated against the project's fields. Moving to another project removes the shot from the old project's shooting days and timelines. |
| PATCH | `/api/shots` | Bulk edit: `{ ids: uuid[] (≤ 500), set?: { any single-PATCH field except extra }, extra?: { key: value \| null } }`. Only the given fields change. `extra` is per key and merged into each shot's values (groups child by child, null clears, dependent selects that no longer fit are dropped), then the edited keys are checked against each shot's (new) project. Unknown ids → 404, any error → nothing written (one transaction). Moving removes the shots from the old project's shooting days. Returns `{ shots }`. |
| DELETE | `/api/shots/:id` | Deletes photos, overlays and sketches (cascade) and their R2 objects |
| GET | `/api/photos/:id/image` | Image from R2, immutable caching, supports conditional requests |
| PATCH | `/api/photos/:id` | `{ lat, lon, all_in_shot? }` position correction (also sets a position on photos captured without one); sets `position_corrected` |

`POST /api/shots` metadata:

```json
{ "id": "<shot uuid>", "project_id": "…", "name": null, "location_id": null, "int_ext": null,
  "light": ["dusk"], "artificial": false, "weather": null, "shot_size": "ws", "camera_support": null, "movement": ["pan"],
  "extra": {}, "state": "unreviewed",
  "photos": [{ "id": "…", "ordinal": 0, "timestamp": "ISO", "lat": 52.5, "lon": 13.4, "gps_accuracy_m": 5, "position_corrected": false,
               "preset_id": null, "lens_mm": 24, "width": 1280, "height": 960, "framing": {…}, "device": {…} }] }
```

- Idempotent. An existing shot keeps its tags (they may have been edited since); only photos not stored yet are added. That is how retries and chunked sequence uploads work (the phone sends 12 photos per request, the server allows 60).
- `lat`/`lon` may be null or missing (captured without GPS); half a position is dropped. `position_corrected` marks a position set by hand on the phone before upload. `state` carries a review decision made on the phone before upload; anything invalid becomes `unreviewed`.
- `photos[].source`: `camera` (default), `upload` or `drawn` (dashboard-made, [new shot](features/new-shot.md)); for the last two `lens_mm` is optional and stored as 0.
- Lenient on purpose: unknown `preset_id`/`location_id` become null, names over 120 characters are cut, `extra` is only pruned, not validated.
- `201` for a new shot, `200` for an existing one; `duplicate: true` when nothing was added.

## Framings (`framings.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/api/framings/:id` | Upsert `{ photo_id, name, rig_id?, lens_mm, frame: { width_fraction, height_fraction, x?, y? }, root? }`. The centre is clamped to the photo; `root: true` also makes it the photo's root. A framing cannot move to another photo (`409`). Returns `{ shot }`. |
| DELETE | `/api/framings/:id` | A deleted root falls back to as captured. Returns `{ deleted, shot }` |
| PUT | `/api/photos/:id/root` | `{ framing_id: uuid \| null }` (null = as captured) → `{ shot }` |

Overlay and timeline-clip presentations accept `frame.x`/`frame.y` and `framing_id`.

## Overlays and sketches (`compose.ts`)

Shots embed both lists without the drawing; see [compose](features/compose.md) for the model.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/overlays/:id` | With `drawing` |
| PUT | `/api/overlays/:id` | Upsert. JSON `{ photo_id, name, description?, drawing, presentation, position? }`, or `multipart/form-data` with `metadata` (that JSON) and `render` (jpeg/png/webp ≤ 6 MB, the flattened image). `drawing` is validated by `validateDrawing(v, true)` (a look is required), `presentation` by `validatePresentation`. An overlay cannot move to another photo (`409`). Returns `{ overlay, shot }`; `201` when new. |
| PATCH | `/api/overlays/:id` | `{ name?, description?, position? }` → `{ overlay, shot }` |
| DELETE | `/api/overlays/:id` | Removes the render too → `{ deleted, shot }` |
| GET | `/api/overlays/:id/render` | The render; `render_url` on the overlay carries `?v=<updated_at>`, so it is cached as immutable |
| GET / PUT / PATCH / DELETE | `/api/sketches/:id` | Same, with `{ shot_id, name, kind?, description?, drawing (look null), aspect (0.25..4), position? }`; PATCH takes `kind` too |
| GET | `/api/sketches/:id/render` | |

## Timelines (`timelines.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/timelines?project_id=` | Each with `clips: [{ id, photo_id, shot_id, overlay_id, presentation, duration_ms, notes, title }]` in order. A placeholder clip has `photo_id`/`shot_id`/`overlay_id`/`presentation` null and a `title`. |
| GET | `/api/timelines/:id` | |
| PUT | `/api/timelines/:id` | `{ project_id, name, notes?, clips: [...] }` replaces the whole timeline (≤ 500 clips). A clip is `{ id, photo_id, overlay_id?, presentation, duration_ms, notes? }` or a placeholder `{ id, title, duration_ms, notes? }`. Clips whose photo is not in the project are dropped silently; an overlay that is not the photo's is nulled. |
| DELETE | `/api/timelines/:id` | |

## Locations, rigs, views

| Method | Path | Notes |
| --- | --- | --- |
| GET / PUT / DELETE | `/api/locations[/:id]` | `{ name, lat?, lon? }`: without `lat`/`lon` the stored pin is kept, `null` for both removes it; `shot_count`, `approved_count`; clash → `409 { existing_id }`; delete nulls `shots.location_id` |
| GET / PUT / DELETE | `/api/presets[/:id]` | Rigs: `name, camera_id, format_id, sensor_width_mm, sensor_height_mm, speedbooster_factor, lens_min_mm, lens_max_mm` |
| GET / PUT / DELETE | `/api/views[/:id]` | `{ name, filter }`, filter validated by `validateFilter` |

## Extra fields (`fields.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/fields` | `{ fields: [{ id, key, definition, … }] }` |
| PUT | `/api/fields/:id` | `{ definition }`, validated by `validateFieldDef`; key clash → 409 |
| POST | `/api/fields/import` | `{ fields: [def, …] }` (or a bare array): new keys created, existing keys replaced; all validated first. Returns the full list plus `created`/`updated`. |
| DELETE | `/api/fields/:id` | Stored values on shots stay |

## Shooting days (`days.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/days?project_id=` | Days ordered by date, each with `shots: [{ shot_id, planned_time, notes }]` in order |
| GET | `/api/days/:id` | |
| PUT | `/api/days/:id` | `{ project_id, date, title?, notes?, shots: [...] }` replaces the whole day. Shots not (or no longer) in the project are dropped silently. |
| DELETE | `/api/days/:id` | |

## Other

- `GET /auth/mobile`: page that hands the Access JWT to the phone's WebView (`auth.ts`).
- `GET /health`: D1 and R2 reachability plus the caller's identity.
