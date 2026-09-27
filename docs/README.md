# Fielder docs

Reference documentation for the whole app. Start with [architecture](architecture.md), then read the feature page for whatever you are changing.

## Project

| Page | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Repo layout, stack per app, how data flows from the phone to the dashboard, auth |
| [data-model.md](data-model.md) | D1 tables, the shot/photo split, JSON columns, migrations |
| [api.md](api.md) | Every Worker endpoint, with request and response shapes |
| [development.md](development.md) | Local dev loops, checks, deploy, migrations, APK builds |
| [infrastructure.md](infrastructure.md) | Cloudflare resources, Access, EAS, secrets |

## Features

| Page | What it covers |
| --- | --- |
| [features/projects.md](features/projects.md) | Projects, the active project on both clients, "All projects" |
| [features/capture.md](features/capture.md) | Phone viewfinder: rigs, lenses, overlay, human view, flashlight, sequences, direct upload, upload queue |
| [features/review-and-tagging.md](features/review-and-tagging.md) | Review flow, tags (light model, INT/EXT, weather, location), view modes (mask/frame/fit/raw) |
| [features/extra-fields.md](features/extra-fields.md) | User-defined fields as JSON, AI import, per-project selection |
| [features/positions.md](features/positions.md) | GPS acquisition and manual pin correction |
| [features/rig-explorer.md](features/rig-explorer.md) | Re-framing a photo for other rigs and lenses |
| [features/schedule.md](features/schedule.md) | Shooting days, daylight phases, forecast, shootable windows |
| [features/day-mode-offline.md](features/day-mode-offline.md) | Phone "Day" tab and offline days |
| [features/dashboard.md](features/dashboard.md) | Dashboard tabs: gallery, map, views/filters, rigs, locations, fields |
| [features/debug-log.md](features/debug-log.md) | The phone's background debug log |

## History

- Before 2026-09-27: prototype with one shot = one photo, districts and a hard-coded U-Bahn list.
- 2026-09-27: rework from [GitHub issue #1](https://github.com/bubulux/fielder/issues/1). Schema reset to `0001_baseline.sql` (prototype data dropped), then all features above. The implementation plan is in the git history of branch `rework/phase-1-projects-photos`.
