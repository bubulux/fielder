# Fielder

Personal shot-scouting viewfinder: point the phone at a scene, pick the rig (sensor + speedbooster) and lens you plan to shoot with, and see the real field of view as an overlay. Snapshots with GPS and framing metadata land in a private web dashboard with a map.

Single user. Everything runs on Cloudflare; the phone app is a sideloaded Android APK built with EAS.

## Layout

| Path | What |
| --- | --- |
| `packages/fov-math` | Pure TypeScript: sensor/speedbooster/lens presets, FOV, crop factor, overlay geometry. Tested with `node --test`. |
| `apps/worker` | Cloudflare Worker: JSON API (`/api/presets`, `/api/shots`), R2 image proxy, and the dashboard as static assets. Verifies the Cloudflare Access JWT on every request. |
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

## Data model

`presets(id, name, camera_id, format_id, sensor_width_mm, sensor_height_mm, speedbooster_factor, lens_min_mm, lens_max_mm, created_at, updated_at)`
`locations(id, name UNIQUE (case-insensitive), district, created_at, updated_at)`
`shots(id, timestamp, lat, lon, preset_id, lens_mm, r2_object_key, extra_metadata JSON, name, light, weather, int_ext, location_id, state, created_at)`

- `state` is `unreviewed` (default on upload) → `approved` or `archived` (Review tab on phone and web). Archived keeps the photo; delete removes it.
- `name`, `light`, `weather`, `int_ext`, `location_id` are required on upload (the phone's capture form) and editable afterwards (`PATCH /api/shots/:id`). Vocabularies live in `packages/vocab` (shared by worker, app and dashboard); districts are the 12 Berlin boroughs and belong to the location.
- `extra_metadata` is additive and free-form. The phone writes `framing` (full rig/lens/FOV snapshot at capture time incl. `frame` = rig frame relative to the photo), `phone`, `gps`, `image`.

## API

`GET/PUT/DELETE /api/presets[/:id]`, `GET/PUT/DELETE /api/locations[/:id]` (PUT answers 409 + `existing_id` on a name clash),
`GET /api/shots?state=&location_id=` (keyset-paginated), `POST /api/shots` (multipart `image` + `metadata` JSON), `PATCH /api/shots/:id` (tags and/or state), `DELETE /api/shots/:id`, `GET /api/shots/:id/image`, `GET /auth/mobile` (phone sign-in page), `GET /health`.

## Secrets and rotation

- The phone holds only a per-device Access session token obtained by PIN login; nothing is baked into the APK. To cut a device off, revoke its session in Zero Trust (Access → Users) or shorten the app session.
- The service token that early builds used was revoked on 2026-09-13; APKs from before that date can no longer reach the API.
- `.secrets/` holds `access-app.json` (Access app id / AUD, not secret) and `cf-access-token`, a short-lived scoped Cloudflare API token (Access: Apps and Policies + Service Tokens, Edit) used only for Access administration from the CLI; renew it when needed. It is gitignored. Never commit it.
- Wrangler's OAuth login lacks `account:read`; the account id is pinned in `apps/worker/wrangler.jsonc`.
