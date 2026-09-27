# Dashboard overview

`apps/dashboard/src/App.tsx` holds the global state:
- data: shots of all projects, projects, rigs, locations, views, field definitions
- the active project
- the global view mode and the gallery layout

Tabs are in the URL hash.

| Tab | File | What |
| --- | --- | --- |
| Gallery | `App.tsx` | Grid or list (switch in the header, remembered). State filter chips (all/unreviewed/approved/archived with counts). Sequences show a "▤ n" badge. The list layout has row selection with select-all and bulk delete. |
| Review | `Review.tsx` | See [review and tagging](review-and-tagging.md) |
| Map | `MapView.tsx` | Leaflet + OSM, one marker per shot at its cover photo, coloured by state. The popup has a framed thumbnail and "Open details". "Show on map" from the dialog focuses a shot. |
| Schedule | `Schedule.tsx` | [Shooting days](schedule.md) |
| Views | `Views.tsx`, `FilterBuilder.tsx`, `ViewsResults.tsx` | Filter builder: nested all/any groups of rules over state, project, name, location, INT/EXT, light (set), artificial, weather, rig, lens, FF-equivalent, photos in shot, date, and extra fields. Results as grid or map. Save as named views (shared by all projects). The model is `packages/vocab/src/filter.ts` (`evaluateFilter`, `validateFilter`). |
| Projects | `Projects.tsx` | [Projects](projects.md) |
| Fields | `Fields.tsx` | [Extra fields](extra-fields.md) |
| Rigs | `Rigs.tsx` | Rig table and editor (camera body/format or custom sensor, speedbooster, lens range), with how many shots used each rig |
| Locations | `Locations.tsx` | Rename or delete locations; shot and approved counts |

The header also has the project switcher, the global view-mode switch (mask/frame/fit/raw) and ↻ reload.

## Shared pieces

- `ShotInfo.tsx`: title, facts, state buttons, in-place tag editing, position correction. Used by the dialog and Review.
- `Framed.tsx`: a photo with its frame (optional frame override).
- `Combobox.tsx`: the type-to-search select.
- `format.ts`: `cover`, labels, frame geometry, `filterable(shot)` for filters.
- `api.ts`: types and calls. A `401` reloads the page (Access login).
- Styles in `styles.css`, with CSS variables at the top (`--accent`, `--ok`, `--danger`, `--btn`, …).
