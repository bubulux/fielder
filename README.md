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
- **Cloudflare Access** (team `weathered-salad-6072`): app "Fielder" on the Worker hostname. Policy: Allow for the one allow-listed email via One-time PIN. (The former Service Auth policy / `fielder-mobile` service token is no longer used by the app and should be removed once the PIN login on the phone is confirmed.)
- **Expo/EAS** project `@bubulux/fielder`; production env var `EXPO_PUBLIC_API_URL` (the `EXPO_PUBLIC_CF_ACCESS_*` vars are obsolete and can be deleted).

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
echo 'ACCESS_DEV_BYPASS="true"' > apps/worker/.dev.vars   # gitignored, dev only
pnpm -C apps/worker run migrate:local
pnpm -C apps/worker dev            # http://localhost:8787
pnpm -C apps/dashboard dev         # http://localhost:5173, proxies /api to 8787
```

## Mobile development loop (no APK per change)

Install the **dev client** APK once (EAS profile `dev-client`). Then run Metro with a tunnel,
because WSL2 in NAT mode is not reachable from the phone over LAN:

```sh
pnpm -C apps/mobile start        # expo start --dev-client --tunnel; reads apps/mobile/.env.local
```

Open the dev client on the phone and enter the URL Metro prints (an `https://….ngrok.io` or
`….exp.direct` host). JS changes hot-reload. Only native changes (new Expo modules, app.json
plugins/permissions) need a new dev-client build. `.env.local` (gitignored) carries the same
EXPO_PUBLIC_* values as the EAS production environment.

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
- Legacy: the `fielder-mobile` service token and the `EXPO_PUBLIC_CF_ACCESS_*` EAS vars are unused since the PIN login shipped; delete the Service Auth policy and token in Zero Trust → Access → Service Auth and `eas env:delete` the two vars.
- `.secrets/` holds local copies of identifiers and the temporary Cloudflare API token used for setup. It is gitignored. Never commit it.
- Wrangler's OAuth login lacks `account:read`; the account id is pinned in `apps/worker/wrangler.jsonc`.
