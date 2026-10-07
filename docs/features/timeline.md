# Timeline

Second half of [GitHub issue #12](https://github.com/bubulux/fielder/issues/12). A **timeline** is a rough cut of a project out of its scouted photos: clips in order, each with a hold time ("Vorstopp"), played back to see which shots carry a sequence. Dashboard only; the phone does not read timelines.

## Model

A project has any number of named timelines. A **clip** holds:
- one **photo** (of a shot in the project); a sequence contributes one clip per photo, so each photo gets its own hold time
- optionally one **overlay** of that photo ([compose](compose.md)): the clip then shows the overlay's render instead of the photo
- a **presentation** (frame mode plus the rig frame, the same shape as an overlay's), so the same photo can appear raw, framed or fitted, with any rig and lens
- `duration_ms` (100 ms .. 1 h), entered in seconds with one decimal
- notes

The same photo can be in a timeline several times. Deleting a shot removes its clips everywhere (the shot's delete dialog says "Used in n timelines"); deleting an overlay keeps the clip, which then shows the photo as is. A shot moved to another project leaves that project's timelines, like it leaves its shooting days.

## Using it (`apps/dashboard/src/Timeline.tsx`, route `#/timeline/<id>`)

- **Left**: the project's timelines with length and clip count; **New** (`⇧N`) makes "Cut n". "All projects" cannot cut: pick a project first.
- **Head**: name, total length, save status, menu (Delete timeline…). Changes **autosave** 600 ms after the last edit and at once when leaving the page; the server's answer replaces the clip list, so clips of deleted photos disappear on the next save.
- **Preview**: the selected clip, large, in its presentation (the overlay's render when one is chosen). Transport: first · previous · **Play/Pause** (`Space`) · next · last, the playhead clock over the total, "clip n of m · 3.0 s", and **Add shots** (`N`).
  Playback steps through the clips at their hold times (100 ms ticks) and stops at the end; Play at the end starts over.
- **Strip**: one block per clip, its width proportional to the hold time (44 px a second, at least 64 px), with a thumbnail, the shot's title (and photo number for sequences; a layers icon marks an overlay), the hold time, and a red playhead on the current clip. A ruler marks the seconds. Click selects, double-click opens the shot view with the timeline's shots as its list.
- **Clip panel** (right, for the selected clip): thumbnail, **Hold time** (−0.5 s · field · +0.5 s; `D` focuses it), **Show as** (Photo as is, or one of the photo's overlays; picking an overlay adopts the presentation it was drawn in), **Presentation** (frame mode and a **Framing**: As captured or a saved framing of the photo, see [framing](rig-explorer.md); a clip follows its framing's edits and starts on the root), notes, Move earlier/later (`Alt+←/→`), Duplicate, Open shot (`↵`), Remove (`Del`).
- **Add shots** panel: the project's shots grouped by location, "Approved only" ticked by default, "Add all" per location. Each added clip starts at 3.0 s in the view's current frame mode with the rig the photo was shot with.
- Keys: `←/→` clip, `Home`/`End`, `Space`, `Alt+←/→`, `D`, `Del`, `N`, `⇧N`, `↵`. `G T` goes to Timeline from anywhere.

The inspector's **Shot** section lists the timelines a shot is in (links).

## Storage

`timelines` + `timeline_clips` (`apps/worker/src/timelines.ts`). `PUT /api/timelines/:id` replaces the whole timeline; clips whose photo is not in the project are dropped silently, an overlay that does not belong to the clip's photo is nulled. See [api](../api.md) and [data model](../data-model.md).

## Not done

- No export (video or image sequence) and no transitions or audio: the timeline is for deciding, not for delivery.
- No drag-and-drop in the strip; reordering is by keys and buttons.
