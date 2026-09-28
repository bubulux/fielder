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

## Shot view and Review (dashboard)

The shot view (`ShotView.tsx`) replaces the old dialog. It covers the main area (the sidebar becomes a rail) and keeps the list it was opened from, from Shots, the map, Plan or ⌘K. Review (`Review.tsx`) uses the same layout.

- **Toolbar**:
  - Shot view: back (Esc) to where it was opened from, "7 of 212" with the list's description (state · view or project · sort), and ←/→.
  - Review: "3 of 14 · oldest first" with a progress bar, and ←/→.
  - Both: the **stage switch** Photo · Rigs (`R`) · Position, and the frame-mode switch. The frame mode starts from the global mode; a change sticks for ←/→ until the view closes (`viewMode`/`reviewMode` in `App.tsx`). `M` cycles it.
- **Stage**:
  - **Photo**: the photo as large as fits, with a rig · lens tag and prev/next buttons on the image. The foot has the photo strip for sequences (`,` `.`) and the actions Download crop (cropped in the browser), Original, Show on map, and Delete (confirm dialog, offering Archive instead).
  - **Rigs**: the [rig explorer](rig-explorer.md).
  - **Position**: the [position correction](positions.md) map.
- **Inspector** (`Inspector.tsx`, 380 px, scrolls on its own):
  - the name, state marker and a summary line
  - the decision buttons: unreviewed → Approve (`A`) · Archive (`E`); approved → Back to review · Archive; archived → Back to review · Approve. A toast confirms, with **Undo**.
  - **Tags**, edited in place and **saved per change**, with a status (Saving… · Saved · Not saved + Retry):
    - Project: a combobox. When moving the shot would take it off shooting days, a warning names how many, and Move confirms.
    - Name: saved on Enter or leaving the field; Esc reverts.
    - Location: a combobox, "Create “…”" makes a new one.
    - INT/EXT: INT · EXT · –.
    - Light: chips plus Artificial.
    - Weather: a combobox.
    - Extra fields: saved 0.7 s after the last change.
  - **Position** of the photo on stage, with "Correct".
  - **Shot**: captured, photos, uploaded, and the **shooting days** it is planned on, which link to Plan.
  - **Camera** of the photo on stage: rig, body, format, sensor, lens + FF-equivalent, FOV, time, GPS accuracy, fix age and altitude, phone.
  - **Raw metadata**: collapsed, with Copy.
- **Review queue**: unreviewed shots of the scope, oldest first; ←/→ step, there is no Skip. After Approve/Archive the next shot takes the same position. Ends on "Nothing to review" (Browse approved shots · Plan a day).

## Review on the phone

- **Phone Review tab** (`screens/Review.tsx`): same idea, with Prev/Next in the top bar, in-place editing and a photo strip.

## Buttons ([design](../design.md))

- Action buttons are rounded rectangles and carry an icon.
- Tabs, segmented switches and chips are pills; the selected one is filled, bold and checked.
- Approve is green. Archive and Back to review are neutral grey with a border. Secondary actions are outlined. Delete is a red outline (solid red only inside a confirmation).
- Mobile `Button` kinds: `primary | approve | archive | ghost | danger`.

## Tag editing UI

- **Dashboard**: the inspector (above). The combobox (`Combobox.tsx`):
  - Type to filter; matches at the start rank first.
  - ↑/↓ move, Enter or Tab take the highlighted entry (Tab also moves on), Esc cancels.
  - "Create “…”" makes a new location.
  - The same combobox is used for the project box, rig and format pickers, and the filter builder's single values.
- **Phone** (`components/TagsForm.tsx`): search-or-create location list, chips for the rest, extra fields via `ExtraEditor`.

## View modes (how the rig frame is drawn on a photo)

`mask` (neutral dark mask outside the frame), `frame` (border only), `fit` (crop to exactly the frame), `raw`.

- **Fit** always shows exactly the rig frame. Where the rig saw more than the phone (fraction > 1) the rest stays black, like the live view (`frameLayout` in `apps/dashboard/src/format.ts`, `FramedImage.tsx` on the phone).
- **Dashboard**: the Shots toolbar switch sets the global mode (`localStorage["maskMode"]`) for the grid, list, map and Plan thumbnails. The shot view and Review have their own switch (above).
- **Phone**: each screen has its own switch.
