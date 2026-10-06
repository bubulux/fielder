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
| Shot size | one of `ews, ws, mws, ms, mcu, cu, ecu` (Extreme wide … Extreme close-up; lists show the abbreviation) |
| Camera support | one of `static` (locked-off) `, handheld, steadicam, gimbal, dolly, slider, crane` (jib) `, drone, vehicle` (mount) |
| Movement | any subset of `pan, tilt, push_in, pull_out, tracking, pedestal` (boom) `, orbit, zoom`. Support and movement are separate on purpose: a Steadicam shot can pan and push in. `cameraLabel()` gives "WS · Steadicam · Pan / Push in". |
| Extra | the project's [extra fields](extra-fields.md) |

The light model feeds the [schedule](schedule.md): phases are defined by sun elevation.

## Shot view and Review (dashboard)

The shot view (`ShotView.tsx`) replaces the old dialog. It covers the main area (the sidebar keeps its collapsed or expanded state) and keeps the list it was opened from, from Shots, the map, Plan or ⌘K. Review (`Review.tsx`) uses the same layout.

- **Toolbar**:
  - Shot view: back (Esc) to where it was opened from, "7 of 212" with the list's description (state · view or project · sort), and ←/→.
  - Review: "3 of 14 · newest first" with a progress bar, and ←/→. The order is a link that switches to oldest first (also `O`), remembered in `localStorage["reviewOrder"]`.
  - Both: the **stage switch** Photo · Rigs (`R`) · Position, and the frame-mode switch. The frame mode starts from the global mode; a change sticks for ←/→ until the view closes (`viewMode`/`reviewMode` in `App.tsx`). `M` cycles it.
- **Stage**:
  - **Photo**: the photo as large as fits, with prev/next buttons beside it and nothing drawn over the picture (rig and lens are in the inspector). The foot has the photo strip for sequences (`,` `.`) and the actions Download crop (cropped in the browser), Original, Show on map, and Delete (confirm dialog, offering Archive instead).
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
    - Shot size and Support: comboboxes; Movement: chips (any number).
    - Extra fields: saved 0.7 s after the last change.
  - **Position** of the photo on stage, with "Correct". A photo captured without GPS says "No position · captured without GPS" and offers "Set position" (the same map stage, starting at another photo of the shot or Berlin).
  - **Shot**: captured, photos, uploaded, and the **shooting days** it is planned on, which link to Plan.
  - **Camera** of the photo on stage: rig, body, format, sensor, lens + FF-equivalent, FOV, time, GPS accuracy, fix age and altitude, phone.
  - **Raw metadata**: collapsed, with Copy.
- **Review queue**: unreviewed shots of the scope, newest first (switchable); ←/→ step, there is no Skip. After Approve/Archive the next shot takes the same position. Ends on "Nothing to review" (Browse approved shots · Plan a day).

## Review on the phone

The **Review** tab (`screens/Review.tsx`) takes the same queue (unreviewed, oldest first, no skip), photo first, with the decision at the thumb:
- The photo spans the width (up to 262 dp), with the SEQ badge and "Photo i / n" for sequences and the photo strip under it. **Swipe** on the photo = next/prev shot; the strip moves between photos. **Double-tap** opens the photo full screen (mode switch on an opaque card; swipe = photos).
- The frame-view switch (remembered in `reviewMode.v1`).
- The summary:
  - the name (or the rig when untagged), the state and location
  - the tags line and the extra fields
  - rig · lens · capture time
  - **Edit** (pencil) opens the edit sheet: the same tag editor as after a capture, Save pinned; a failure keeps the sheet open with the error.
  - **⋯** opens Shot details, Show on map, Correct position and Delete (a confirm with **Archive** as the safe alternative).
- **Pinned**: Prev · "n of m" · Next, then **Archive | Approve**. A decision shows "Approved · Undo" (4 s); the next shot takes the same position.
- States: skeleton while loading; "Nothing to review" with the project's totals and **Browse shots**; a load error with Try again (pull to refresh too). Offline: the banner, and the decisions are disabled (they need the server); the loaded queue stays browsable.
- Landscape: the photo fills the left with the mode switch floating on it; a 292 dp side panel holds the strip, the summary and the decisions at the bottom.

**Shot details** (Shots → a shot, or ⋯ → Shot details; `screens/ShotDetails.tsx`) is a full screen:
- the photo (swipe = the neighbours in the list it was opened from), strip and frame view
- the summary, **Tags** with Edit, **Position** per photo (coordinates, ±accuracy or "corrected") with Show on map and Correct, **Camera** per photo, and **Raw metadata** (expands)
- ⋯ holds Delete
- Pinned: the two states that aren't the current one (unreviewed → Archive | Approve; approved → Back to review | Archive; archived → Back to review | Approve)

## Buttons ([design](../design.md))

- Action buttons are rounded rectangles and carry an icon.
- Tabs, segmented switches and chips are pills; the selected one is filled, bold and checked.
- Approve is green. Archive and Back to review are neutral grey with a border. Secondary actions are outlined. Delete is a red outline (solid red only inside a confirmation).
- Mobile `Button` kinds: `primary | approve | archive | secondary | ghost | danger | dangerSolid` (solid red only inside a confirm sheet).

## Tag editing UI

- **Dashboard**: the inspector (above). The combobox (`ui/Combobox.tsx`):
  - Type to filter; matches at the start rank first. The typed text is marked in yellow in each match (also in ⌘K).
  - The list takes the width of its options; when that would spill past the right edge of its panel, it opens from the input's right edge.
  - ↑/↓ move, Enter or Tab take the highlighted entry (Tab also moves on), Esc cancels.
  - "Create “…”" makes a new location.
  - The same combobox is used for the project box, rig and format pickers, and the filter builder's single values.
- **Phone** (`components/TagEditor.tsx`, one editor for Tag, the Review edit sheet and the Shot-details edit):
  - Name, INT/EXT (segmented) and light (chips + Artificial) are edited in place.
  - Location, weather and every extra field are 64 dp rows (`FieldRow`) showing the value, the LAST tag (kept from the last capture) and a chevron; a tap opens a focused sheet:
    - **Location**: search auto-focused; "Create “…”" first when the name is new; with an empty query the last used first, then by shots there.
    - **Weather**: a 2-column grid.
    - **Extra fields**: `OptionSheet` (chips up to 12 options, a search list above, checkboxes + "Done (n)" when several are allowed); numbers and text in their own sheet; booleans as a switch row.
  - Groups expand in place (20 dp indent per level); a filled group starts collapsed showing its summary.
  - A dependent select that a parent change cleared shows "Pick again" until chosen.

## View modes (how the rig frame is drawn on a photo)

`mask` (neutral dark mask outside the frame), `frame` (border only), `fit` (crop to exactly the frame), `raw`.

- **Fit** always shows exactly the rig frame. Where the rig saw more than the phone (fraction > 1) the rest stays black, like the live view (`frameLayout` in `apps/dashboard/src/format.ts`, `FramedImage.tsx` on the phone).
- **Dashboard**: the Shots toolbar switch sets the global mode (`localStorage["maskMode"]`) for the grid, list, map and Plan thumbnails. The shot view and Review have their own switch (above).
- **Phone**: Review, Shots (shared by grid and map) and step-through remember their own mode (`reviewMode.v1`, `shotsMode.v1`, `stepMode.v1`); Shot details starts from the Shots mode.
