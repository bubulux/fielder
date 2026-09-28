# Fielder — agent guide

Single-user tool for film location scouting and shoot planning:
- an Android phone app (Expo, runs in Expo Go) is a viewfinder that shows a cinema rig's frame and captures reference photos
- a Cloudflare Worker (D1 + R2) stores them
- a Preact dashboard reviews, organises and plans shooting days

The owner talks to you in English.

## Read first

- `docs/README.md`: index of all docs. `docs/architecture.md` gives the big picture in five minutes.
- Before changing a feature, read its page in `docs/features/`. **Update that page (and `docs/api.md` / `docs/data-model.md`) in the same commit when behaviour changes.**
- `apps/mobile/AGENTS.md`: Expo changed a lot; check the SDK 57 docs before using an Expo API.

## Map

| Path | What |
| --- | --- |
| `apps/worker/src` | API routes (`shots.ts`, `projects.ts`, `fields.ts`, `days.ts`, …), `http.ts` router + `assert*` helpers |
| `apps/worker/migrations` | D1 schema, numbered, additive |
| `apps/dashboard/src` | `App.tsx` (state, tabs), one file per tab/component, `ui.tsx` (design-system components), `design/` (tokens + component CSS), `styles.css` (layouts) |
| `apps/mobile/src` | `screens/` (Viewfinder, Review, Gallery, Map, ShootDay, Setup), `uploads.ts` (queue), `storage.ts` (kv), `api.ts` |
| `packages/vocab` | Shared vocabularies, filters, extra-field definitions, daylight math: anything both the Worker and a client must agree on |
| `packages/fov-math` | Camera/lens/FOV/overlay/reframe math |

## Core model in one paragraph

A **shot** holds the metadata (name, location, INT/EXT, light phases + artificial flag, weather, review state, extra fields) and owns 1..n **photos**; a sequence is one shot with many photos. Rig, lens, framing and GPS are per photo, and the first photo is the cover. Every shot belongs to a **project**; locations, rigs, views and field definitions are shared. Ids are client-generated UUIDs; PUTs are upserts.

## Rules of the house

- **Never lose a capture on the phone.**
  - Uploads are idempotent.
  - The server accepts stale references (it nulls them) rather than rejecting.
  - Rejected uploads stay queued as `stuck`.
  - Drafts and sequences are persisted.
  Keep it that way.
- **Shared rules go in `packages/vocab`** and are reused by the Worker. Interactive edits are validated strictly, uploads leniently.
- **Migrations**: a new numbered file for every change; never edit an applied one. Production holds real data now: ask before anything destructive.
- **Match the surrounding code**: terse doc comments on exported functions explaining *why*; plain CSS on the design tokens, never hard-coded colours (`docs/design.md`; both themes, Sun and Set, must stay high contrast); mobile UI from `components/ui.tsx`. No new dependencies without a reason (the sun math and combobox are hand-written on purpose).
- **Deploys to production are done by the owner** (`pnpm -C apps/worker run deploy`). You prepare, check and commit. You may apply additive remote migrations when asked. Commit only when asked or when working through an agreed plan; work on a branch.

## Verify before you say "done"

```sh
for p in packages/vocab packages/fov-math apps/worker apps/dashboard apps/mobile; do (cd $p && npx tsc -p .); done
pnpm -C packages/vocab test && pnpm -C packages/fov-math test && (cd apps/mobile && node --test src/*.test.ts)
(cd apps/dashboard && npx vite build)
(cd apps/mobile && npx expo export --platform android --output-dir /tmp/fielder-export)
```

For the API, run the local worker (`pnpm dev:worker`, no auth locally) and exercise it with `curl`. There is no browser automation. Say so when UI was not clicked through, and ask the owner to test on the phone. For phone bugs, ask for the debug log (Setup → Debug log → Share). More in `docs/development.md`.
