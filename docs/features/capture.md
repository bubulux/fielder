# Capture (phone viewfinder)

The Shoot tab (`apps/mobile/src/screens/Viewfinder.tsx`) is a viewfinder for a cinema camera: the phone camera preview with the frame of the chosen rig + lens drawn on top.

## Rigs and lenses

- **Rigs** (presets) are a camera body + recording format + speedbooster, or a custom sensor. Bodies and formats are in `packages/fov-math/src/cameras.ts`: BMPCC 4K/6K, generic FF, S35, APS-C, MFT, 1".
  - Optionally a lens range, e.g. an 18–35 zoom.
  - Edited on the phone (`components/PresetSheet.tsx`, "Rig" button) or in the dashboard Rigs tab.
  - Rigs live on the server; `presetSync.ts` pushes offline edits and pulls the list.
- **Lens**: the carousel strip (`LensCarousel.tsx`) steps through `LENS_PRESETS_MM` (12–135 mm), clamped to the rig's range (`lens.ts`). Tap the value for `LensSheet` to enter any focal length.
- **Math** (`packages/fov-math/src/fov.ts`, `apps/mobile/src/framing.ts`):
  - Effective focal length = lens × speedbooster; the crop factor is by diagonal against 36×24; the FOV is computed per axis.
  - The phone's own FOV comes from its 35 mm-equivalent focal length, set in Setup (Motorola Edge 50 Pro, default 25 mm, `phone.ts`).
  - The frame size is the ratio of tan(fov/2) values.
  - When the rig sees more than the phone, the live image is shrunk and the frame drawn dashed.

## Controls

Portrait: a panel under the preview with the lens strip, then Rig · Human · Fit · Light, then Seq · Shutter · Uploads (the capture-time controls under the thumb). Landscape: the lens strip on the left, and the same controls in a panel on the right. All chrome is opaque; a control that is on is filled with the accent colour and has a bold label.

| Button | What |
| --- | --- |
| Rig | Pick or edit rigs |
| Human | Cyan reference frame for roughly what a person sees. Setup → Human view button: **cycle** (off → 35 → 43 → 50 → off) or **toggle** (off ↔ the chosen value). |
| Fit | Digital zoom so the rig frame fills the screen |
| Shutter | Capture. Red ring and disc with the photo count while a sequence is running. Dashed when it can't fire (no project, rig or camera). |
| Light | Flashlight on/off (`CameraView enableTorch`). Manual, not a flash; not remembered across launches. |
| Seq | Sequence mode on/off. The label shows the photo count. Disabled while a capture is in progress. |
| Uploads | Pending count as a badge (red when a shot is stuck); tap to retry (including stuck shots) |

The HUD is a row of solid chips over the preview: project, rig and lens, FF-equivalent and FOV, **GPS accuracy** (amber when worse than 20 m or missing; see [positions](positions.md)), and warnings in amber. It can be hidden in Setup. At its right, the **Sun/Set button** switches the theme in one tap (it shows AUTO while following the phone; see [design](../design.md)). Setup is its own tab (`screens/Setup.tsx`) with the theme (Auto / Sun / Set), phone calibration, rig orientation (landscape/portrait), orientation lock, frame border and blackout style (the neutral 62 % black is the default), account, uploads and the debug log.

## What a capture produces

`takePictureAsync` and a GPS fix run in parallel. The photo is resized to 1280 px JPEG (the full-size temp file is deleted) and gets `PhotoMetadata`: id, ordinal, timestamp, lat/lon, accuracy, lens, preset id, size, the `framing` snapshot and `device` ([data model](../data-model.md)). Without a GPS fix the capture is refused.

It then becomes a **draft** (`CaptureDraft = { shotId, photos: DraftPhoto[] }`), with its photos moved into `draft-photos/` (`sequence.ts`, `keepPhoto`):
- **Normal:** the tag form (`screens/ShotReview.tsx`) opens: name, location (search or create), INT/EXT, light, weather, the project's extra fields. Upload or Discard. Light, weather, INT/EXT and location are remembered for the next capture; the name is not.
- **Direct upload** (Setup → Capture): no form; the shot is queued untagged, to be tagged later in the dashboard. If queuing fails, the form opens instead.
- **Sequence mode:** every capture while Seq is on is appended to one shot (`addToSequence`). A red "SEQ · n" badge with a dot sits on the preview. Turning Seq off turns the set into one draft: the tag form (showing a photo strip), or the queue with direct upload.

Drafts and running sequences are stored in the kv-store (`captureDraft.v1`, `sequence.v1`), so an app kill loses nothing: the form or the sequence comes back on the next launch. A capture that finishes after Seq was switched off becomes a single shot, never part of the ended sequence.

## Upload queue (`apps/mobile/src/uploads.ts`)

- `enqueue` copies the photos to `pending-photos/` and stores the entry (`pendingUploads.v2`). It then deletes the draft files.
- `flush()`: syncs projects, field definitions and locations, then uploads oldest first. Big sequences go 12 photos per request (the server appends to the same shot). The shutter never waits for it.
- **Network or auth errors** stop the round; it is retried at the next capture, sign-in, app start or manual retry.
- **Rejections (4xx)** increase `attempts`. After 3 the entry is `stuck`: skipped automatically, listed in Setup → Uploads with the error, and retried or discarded by hand. Files are never deleted for a rejection.
- **A missing photo file** means the remaining photos are uploaded and the missing ones dropped.
- `usePendingCount()` (storage.ts) and `onFlushed()` let screens react.
