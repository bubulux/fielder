# Known issues and risks

Things that may go wrong but are not fixed (or not verified on a device) yet. Add an entry when a change leaves a risk you couldn't rule out; remove it when it is fixed or tested. Newest first.

| Since | Area | What can happen | Why it is left | Where |
| --- | --- | --- | --- | --- |
| 2026-10-06 (#13) | Phone · upload queue | A long sequence (more than 12 photos, sent in parts) that is approved or re-tagged **while its parts are uploading** might end up on the server with the old tags or state. It should be caught by `sent` / `editedAfterSend` and the follow-up PATCH, but this was never tested on a phone. | Accepted for now; test when it matters. | `uploads.ts` `flush`, `localShots.ts` `updateQueued` |
| 2026-10-06 (#13) | Phone · upload queue | When the follow-up PATCH after an upload is rejected (it retries without extra fields first), the shot keeps the tags it was uploaded with. Only the debug log says so; the user is not told. | The photos are safe; a stuck shot would be worse. | `uploads.ts` `followUp` |
| 2026-10-06 (#13) | Phone · offline edits | An edit kept on the phone that the server rejects later (e.g. a deleted shot, an extra field the project no longer uses) is dropped. Only the debug log says so. | Rare; edits are not captures. | `localShots.ts` `flushEdits` |
| 2026-10-06 (#13) | Phone · offline project | "Keep on this phone" downloads every photo of the project with no size limit and no check of free space (the estimate assumes about 250 KB a photo). A failed download stops the copy; finished photos stay. | Projects are small so far. | `offline.ts` `saveProjectOffline` |
| 2026-10-06 (#13) | Phone · offline | Maps (Shots map, Show on map, Correct / Set position) need a connection: tiles are not cached. In offline mode, photos without a local copy stay black. | Tile caching is a separate feature. | `LeafletView.tsx`, `ShotFrame.tsx` |
| 2026-10-06 (#13) | Phone · GPS Low | Low precision takes the phone's last known position up to 30 min old, which can be a different place than the shot. The fix age is stored (`device.gps_fix_age_ms`) but not shown as a warning. | The trade-off of a mode that never waits. | `Viewfinder.tsx` `getPosition` |
| 2026-10-06 (#16) | Dashboard · bulk edit | Undo after a bulk move puts the shots back into their project but not back on the shooting days they left. | Days are not snapshotted. | `BulkEdit.tsx` `undo` |
