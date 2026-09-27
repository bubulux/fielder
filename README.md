# Fielder

Personal shot-scouting viewfinder and shoot planner: point the phone at a scene, pick the rig (sensor + speedbooster) and lens you plan to shoot with, and see the real field of view as an overlay. Snapshots with GPS and framing metadata land in a private web dashboard, organised by project, where shooting days are planned against the daylight and forecast.

Single user. Everything runs on Cloudflare; the phone app is a sideloaded Android APK built with EAS.

## Layout

| Path | What |
| --- | --- |
| `packages/fov-math` | Pure TypeScript: sensor/speedbooster/lens presets, FOV, crop factor, overlay geometry, re-framing a photo for another rig. Tested with `node --test`. |
| `packages/vocab` | Shared vocabularies, the filter model, extra-field definitions and the sun/daylight math. Tested with `node --test`. |
| `apps/worker` | Cloudflare Worker: JSON API (`/api/projects`, `/api/shots`, …), R2 image proxy, and the dashboard as static assets. Verifies the Cloudflare Access JWT on every request. |
| `apps/dashboard` | Vite + Preact + Leaflet SPA. Built into `dist/` and served by the Worker. |
| `apps/mobile` | Expo SDK 57 app. Camera preview, overlay, capture, offline upload queue. |

## Infrastructure (all created, see `.secrets/` locally for identifiers)

- **Worker** `fielder-api` at https://fielder-api.fielder-worker.workers.dev — API and dashboard on one hostname.
- **R2** bucket `fielder-shots` (WEUR), **D1** database `fielder-db` (WEUR), migrations in `apps/worker/migrations/`.
- **Cloudflare Access** (team `weathered-salad-6072`): app "Fielder" on the Worker hostname with a single policy: Allow for the one allow-listed email via One-time PIN. No service tokens exist.
- **Expo/EAS** project `@bubulux/fielder`; the only production env var is `EXPO_PUBLIC_API_URL`.

No Google Cloud project is involved. Auth is Cloudflare Access only, for both clients:

- **Dashboard**: Access session cookie, set by the One-time PIN login.
- **Phone**: the app opens `/auth/mobile` in an in-app WebView; Access shows the same PIN login, then the Worker page hands the Access JWT to the app (`postMessage`). The app keeps it in the Android keystore (`expo-secure-store`) and sends it as the `cf-access-token` header, which Access validates at the edge. The session lasts as long as the Access app session (720 h); afterwards the app shows the login again. Shots captured while signed out queue on the phone. The APK contains no credential.

## Everyday commands

```sh
pnpm install                       # 7-day dependency cooldown is enforced (pnpm-workspace.yaml)
pnpm -C packages/fov-math test
pnpm -C packages/vocab test
pnpm -C apps/mobile exec tsc -p .  # mobile typecheck
pnpm -C apps/mobile eas build --platform android --profile apk   # new APK (cloud build)

pnpm -C apps/worker run deploy     # builds dashboard, deploys Worker + assets
pnpm -C apps/worker run migrate:remote
```

Local development of API + dashboard without Access in front:

```sh
pnpm dev:init       # once per checkout: writes the gitignored dev files, applies D1 migrations
pnpm dev            # worker on :8787 + dashboard on :5173 (proxies /api and /health to 8787)
```

Individual targets, if you want them in separate terminals:

```sh
pnpm dev:worker     # wrangler dev            -> http://localhost:8787
pnpm dev:dashboard  # vite                    -> http://localhost:5173
pnpm dev:mobile     # expo start --go --tunnel -> Expo Go on the phone
```

The root `Makefile` wraps the same scripts, so `make dev`, `make init`, `make worker`,
`make dashboard` and `make mobile` all work; plain `make` lists them. `package.json` stays
the source of truth. Ubuntu images for WSL ship without make — `sudo apt install make`.

`dev:init` is re-runnable and never overwrites an existing file. It creates
`apps/worker/.dev.vars` (`ACCESS_DEV_BYPASS="true"`, which makes the worker treat every
request as `dev@localhost`), `apps/mobile/.env.local`, and an empty `apps/dashboard/dist`
— `wrangler dev` refuses to boot without the directory named by `assets.directory`, even
though Vite serves the UI in this loop.

`dev:mobile` talks to the **deployed** worker, not the local one: the phone reaches Metro
over the exp.direct tunnel, but `EXPO_PUBLIC_API_URL` points at
`fielder-api.fielder-worker.workers.dev`. Worker changes therefore need a deploy before the
phone sees them; the dashboard at :5173 is the fast loop for API work.

## Local APK builds (no EAS quota)

EAS free plan allows a limited number of cloud Android builds per month. The same APK can be built locally in WSL with the same keystore (fetched from Expo):

```bash
export JAVA_HOME=$(ls -d ~/tools/jdk-17*) ANDROID_HOME=~/Android/Sdk ANDROID_SDK_ROOT=~/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/cmake/3.22.1/bin:$PATH
export EXPO_PUBLIC_API_URL=https://fielder-api.fielder-worker.workers.dev
cd apps/mobile && pnpm build:apk:local     # writes ~/fielder-builds/fielder-<commit>.apk
```

Toolchain installed on 2026-09-13: Temurin JDK 17 in `~/tools`, Android SDK in `~/Android/Sdk` (platform 36, build-tools 36.0.0, NDK 27.1.12297006, cmake 3.22.1, platform-tools), installed with `sdkmanager` from the command-line tools. A build takes about 10 minutes.

## Mobile development loop (no APK per change)

Run Metro with a tunnel, because WSL2 in NAT mode is not reachable from the phone over LAN:

```sh
pnpm dev:mobile                  # expo start --go --tunnel; reads apps/mobile/.env.local
```

Open **Expo Go** on the phone and enter the URL Metro prints (an `exp://….exp.direct` host).
JS changes hot-reload. Every native module this app uses ships inside Expo Go, so no custom
build is needed for day-to-day work; the `app.json` config plugins only set permission prompt
texts, which Expo Go replaces with its own generic ones.

`.env.local` (gitignored, written by `pnpm dev:init`) carries the same EXPO_PUBLIC_* values as
the EAS production environment. Without `EXPO_PUBLIC_API_URL` the login WebView loads the bare
path `/auth/mobile` against `file://` and fails with `net::ERR_ACCESS_DENIED`.

Adding a native module that Expo Go does not bundle switches the loop back to a **dev client**:
build it once with `pnpm -C apps/mobile build:dev-client` (EAS profile `dev-client`), then use
`pnpm -C apps/mobile start:dev-client`. Native changes (new Expo modules, app.json
plugins/permissions) need a fresh dev-client build; JS changes do not.

If the tunnel fails with `Cannot read properties of undefined (reading 'body')`, a previous
ngrok session is still registered; wait 30 s or set `EXPO_TUNNEL_SUBDOMAIN` to a new value.

## Features

- **Projects**: every shot belongs to one. Both clients ask which project to work on and remember it; the dashboard can also browse all projects at once. Locations, rigs, views and extra-field definitions are shared.
- **Capture (phone)**: rig + lens overlay, human-view frame (cycle 35/43/50 or toggle one value, see Setup), flashlight, **sequence mode** (every photo while it is on becomes one shot; red SEQ badge), **direct upload** (skip the tag form), high-accuracy GPS with the accuracy in the HUD, offline upload queue.
- **Review**: phone and dashboard, prev/next (arrow keys on the web), details edited in place, sequences shown as a photo strip (`,` and `.` step through it on the web).
- **Positions** can be corrected by dragging a pin (dashboard dialog and phone detail sheet), per photo or for a whole sequence.
- **Extra fields**: JSON definitions (text, number, yes/no, select, nested groups, selects whose options depend on a sibling) on the dashboard's Fields tab, importable from an AI (copy the prompt there); each project picks its fields.
- **Rig explorer** (dashboard dialog → Explore rigs): frame an existing photo with any rig + lens, lens strip per rig, A/B compare.
- **Schedule** (dashboard): shooting days per project, shots per location, light phases from the sun position (night < −6°, dawn/dusk −6°…+6°, day > +6°), sunrise/sunset, Open-Meteo hourly forecast (~16 days ahead), each shot's shootable window vs. its planned time.
- **Day mode** (phone): the planned days, their light, and big prev/next stepping through the shots; "Make offline" stores a day with all its photos for use without a connection.
- **Debug log** (phone, Setup → Debug log): records API calls, uploads, sync, captures, GPS and errors; share it as text.

## Data model

`projects(id, name UNIQUE (case-insensitive), notes, created_at, updated_at)`
`presets(id, name, camera_id, format_id, sensor_width_mm, sensor_height_mm, speedbooster_factor, lens_min_mm, lens_max_mm, created_at, updated_at)`
`locations(id, name UNIQUE (case-insensitive), created_at, updated_at)`
`shots(id, project_id, location_id, name, int_ext, light JSON array, artificial, weather, state, extra JSON, captured_at, created_at, updated_at)`
`photos(id, shot_id, ordinal, timestamp, lat, lon, gps_accuracy_m, position_corrected, preset_id, lens_mm, r2_object_key, width, height, framing JSON, device JSON, created_at)`
`field_definitions(id, key UNIQUE, definition JSON, …)`, `project_fields(project_id, field_id, position)`
`shooting_days(id, project_id, date, title, notes, …)`, `day_shots(day_id, shot_id, position, planned_time, notes)`
`views(id, name, filter JSON, created_at, updated_at)`

- A **shot** is the unit of scouting metadata and review; it owns one or more **photos** (one per normal capture, many for a sequence). Rig, lens, framing and GPS are per photo; the first photo is the shot's cover.
- `state` is `unreviewed` (default on upload) → `approved` or `archived`. Archived keeps the photos; delete removes them.
- All tags are optional on upload and editable afterwards (`PATCH /api/shots/:id`). `light` is any subset of `dawn, day, dusk, night` (the phases the shot works in); `artificial` is a separate flag, independent of INT/EXT; with no phase set a shot fits any time of day.
- `extra` holds the values of the project's extra fields (groups are nested objects). Edits are validated against the project's definitions; uploads are only pruned, so a phone with stale definitions never loses a capture.
- `framing` is the rig/lens/FOV snapshot at capture time incl. `frame` = rig frame relative to the photo (the rig explorer re-frames from it). `device` holds the phone model, EXIF focal lengths and GPS extras.
- The schema was reset on 2026-09-27 (`0001_baseline.sql`); prototype data from before was dropped.

## API

`GET/PUT/DELETE /api/projects[/:id]`, `PUT /api/projects/:id/fields`, `GET/PUT/DELETE /api/presets[/:id]`, `GET/PUT/DELETE /api/locations[/:id]` (project and location PUTs answer 409 + `existing_id` on a name clash),
`GET /api/shots?project_id=&state=&location_id=` (keyset-paginated, photos included), `POST /api/shots` (multipart `metadata` JSON + one `photo.<id>` file per photo; idempotent, so a retry or a continued sequence only adds missing photos), `PATCH /api/shots/:id` (tags, state and/or project), `DELETE /api/shots/:id`, `GET /api/photos/:id/image`, `PATCH /api/photos/:id` (position; `all_in_shot`),
`GET/PUT/DELETE /api/fields[/:id]`, `POST /api/fields/import`, `GET /api/days?project_id=`, `GET/PUT/DELETE /api/days/:id`, `GET/PUT/DELETE /api/views[/:id]`, `GET /auth/mobile` (phone sign-in page), `GET /health`.

## Secrets and rotation

- The phone holds only a per-device Access session token obtained by PIN login; nothing is baked into the APK. To cut a device off, revoke its session in Zero Trust (Access → Users) or shorten the app session.
- The service token that early builds used was revoked on 2026-09-13; APKs from before that date can no longer reach the API.
- `.secrets/` holds `access-app.json` (Access app id / AUD, not secret) and `cf-access-token`, a short-lived scoped Cloudflare API token (Access: Apps and Policies + Service Tokens, Edit) used only for Access administration from the CLI; renew it when needed. It is gitignored. Never commit it.
- Wrangler's OAuth login lacks `account:read`; the account id is pinned in `apps/worker/wrangler.jsonc`.
