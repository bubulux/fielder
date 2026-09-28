# Review and tagging

## Tags on a shot

All optional, editable at any time (`PATCH /api/shots/:id`). The vocabularies are in `packages/vocab/src/vocab.ts`.

| Tag | Values |
| --- | --- |
| Name | free text, max 120 |
| Location | a shared named place (no district); created from the tag form by typing a new name |
| INT/EXT | `int`, `ext` |
| Light | any subset of `dawn`, `day`, `dusk`, `night`: every phase the shot works in. Plus the separate **Artificial** flag (lit artificially, independent of INT/EXT; an INT shot looking out of a window can still need dusk). No phase set means any time works. Display via `lightLabel()`, e.g. "Dusk / Night + Artificial". |
| Weather | `none, sunny, partly_cloudy, cloudy, rainy, stormy, foggy, snow` |
| Extra | the project's [extra fields](extra-fields.md) |

The light model feeds the [schedule](schedule.md): phases are defined by sun elevation.

## Review

- **Dashboard Review tab** (`apps/dashboard/src/Review.tsx`):
  - Unreviewed shots of the active project, oldest first.
  - **←/→** or Prev/Next step through the queue; there is no Skip. After Approve/Archive the next shot takes the same position.
  - Details are edited **in place** (`ShotInfo.tsx` + `TagsForm.tsx`), without opening the dialog.
  - Sequences show a **photo strip**; `,` and `.` step through its photos.
- **Phone Review tab** (`screens/Review.tsx`): same idea, with Prev/Next in the top bar, in-place editing and a photo strip.
- **Buttons** ([design](../design.md)):
  - Action buttons are rounded rectangles and carry an icon.
  - Tabs, segmented switches and chips are pills; the selected one is filled, bold and checked.
  - Approve is green. Archive and Back to review are neutral grey with a border. Secondary actions are outlined. Delete is a red outline. Mobile `Button` kinds: `primary | approve | archive | ghost | danger`.

## Tag editing UI

- **Dashboard** (`TagsForm.tsx`): location, INT/EXT and weather use `Combobox.tsx`. Type to filter; matches at the start rank first. ↑/↓ move, Enter or Tab take the highlighted entry (Tab also moves on), Esc cancels. "Create “…”" makes a new location. Light is chips plus an Artificial chip. The same combobox is used for the project box and the filter builder values.
- **Phone** (`components/TagsForm.tsx`): search-or-create location list, chips for the rest, extra fields via `ExtraEditor`.

## View modes (how the rig frame is drawn on a photo)

`mask` (neutral dark mask outside the frame), `frame` (border only), `fit` (crop to exactly the frame), `raw`.

- **Fit** always shows exactly the rig frame. Where the rig saw more than the phone (fraction > 1) the rest stays black, like the live view (`frameLayout` in `apps/dashboard/src/format.ts`, `FramedImage.tsx` on the phone).
- **Dashboard**: the header switch sets the global mode (`localStorage["maskMode"]`) for gallery, review, map and views. The shot dialog starts from it; a change inside the dialog sticks for prev/next until the dialog closes (`dialogMode` in `App.tsx`).
- **Phone**: each screen has its own chips.

## Shot dialog (dashboard, `ShotDetail.tsx`)

- ←/→ step through the list the shot was opened from; Esc closes.
- The panel shows facts and review buttons; the Camera facts are per photo.
- Footer:
  - Download crop (cropped to the frame in the browser)
  - Original
  - Show on map
  - Explore rigs ([rig explorer](rig-explorer.md))
  - Delete
- Raw metadata is expandable. The position can be corrected via "correct" ([positions](positions.md)).
