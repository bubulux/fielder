# Data model

D1 (SQLite) database `fielder-db`, schema in `apps/worker/migrations/`. Images live in R2 bucket `fielder-shots` under `photos/<photoId>.<ext>`.

## Migrations

| File | What |
| --- | --- |
| `0001_baseline.sql` | Schema reset of 2026-09-27: projects, presets, locations, shots, photos, views |
| `0002_photo_position_corrected.sql` | `photos.position_corrected` |
| `0003_field_definitions.sql` | `field_definitions`, `project_fields` |
| `0004_shooting_days.sql` | `shooting_days`, `day_shots` |
| `0005_capture_flow.sql` | `shots.shot_size`, `camera_support`, `movement`; `photos` rebuilt with nullable `lat`/`lon` (copied row by row, both or neither set) |

Add a new numbered file for every change; never edit one that was applied to production. Apply with `pnpm -C apps/worker migrate:local` / `migrate:remote` (see [development](development.md)).

## Tables

`projects(id, name UNIQUE NOCASE, notes, created_at, updated_at)`

`presets(id, name, camera_id, format_id, sensor_width_mm, sensor_height_mm, speedbooster_factor, lens_min_mm, lens_max_mm, created_at, updated_at)`: rigs. Sensor dimensions are the source of truth for the math; `camera_id`/`format_id` refer to `packages/fov-math/src/cameras.ts` (null = custom sensor).

`locations(id, name UNIQUE NOCASE, created_at, updated_at)`: shared by all projects. No district (removed in the rework).

`shots(id, project_id → projects RESTRICT, location_id → locations SET NULL, name, int_ext, light JSON array, artificial 0/1, weather, shot_size, camera_support, movement JSON array, state, extra JSON object, captured_at, created_at, updated_at)`
- `state`: `unreviewed` (on upload) → `approved` / `archived`.
- `light`: subset of `dawn, day, dusk, night`, stored in that canonical order. Empty = no requirement.
- Camera language (`packages/vocab`): `shot_size` one of `ews, ws, mws, ms, mcu, cu, ecu`; `camera_support` one of `static, handheld, steadicam, gimbal, dolly, slider, crane, drone, vehicle`; `movement` any subset of `pan, tilt, push_in, pull_out, tracking, pedestal, orbit, zoom` in that order. `cameraLabel()` gives "WS · Steadicam · Pan / Push in".
- `artificial`: lit artificially, independent of phases and INT/EXT.
- `captured_at`: earliest photo timestamp; recomputed when photos are added. Lists sort and paginate on `(captured_at, id)`.
- `extra`: values of the project's extra fields ([extra fields](features/extra-fields.md)).

`photos(id, shot_id → shots CASCADE, ordinal UNIQUE per shot, timestamp, lat, lon (both NULL when captured without GPS), gps_accuracy_m, position_corrected, preset_id → presets SET NULL, lens_mm, r2_object_key UNIQUE, width, height, framing JSON, device JSON, created_at)`

`views(id, name, filter JSON, …)`: saved dashboard filters (model in `packages/vocab/src/filter.ts`).

`field_definitions(id, key UNIQUE, definition JSON, …)` and `project_fields(project_id, field_id, position)`.

`shooting_days(id, project_id → CASCADE, date YYYY-MM-DD, title, notes, …)` and `day_shots(day_id, shot_id, position, planned_time HH:MM, notes)`.

## JSON shapes on photos

`framing` (written by the phone at capture, `Viewfinder.tsx`):

```json
{ "preset_name": "6K FULL", "camera_id": "bmpcc6k", "format_id": "6k",
  "sensor_width_mm": 23.1, "sensor_height_mm": 12.99, "speedbooster_factor": 1,
  "lens_mm": 24, "rig_orientation": "landscape",
  "effective_focal_mm": 24, "full_frame_equivalent_mm": 39.2, "hfov_deg": 51.4, "vfov_deg": 30.3,
  "frame": { "width_fraction": 0.6, "height_fraction": 0.45 },
  "phone_equivalent_focal_mm": 25 }
```

`frame` is the rig frame relative to the photo, centred. Fractions > 1 mean the rig saw more than the phone. Everything that draws a frame (dashboard `Framed.tsx`, mobile `FramedImage.tsx`) and the [rig explorer](features/rig-explorer.md) works from it. The framing snapshot also preserves the rig if the preset is deleted later.

`device`: phone model, EXIF focal lengths, GPS altitude/heading, `gps_fix_age_ms`.

## API shapes

The Worker returns a shot with its photos embedded (`shotToApi` in `apps/worker/src/shots.ts`); `light` as array, `artificial` as boolean, `extra` as object, plus joined `project_name`, `location_name` and per photo `preset_name` and `image_url`. Client types: `apps/dashboard/src/api.ts`, `apps/mobile/src/api.ts`.
