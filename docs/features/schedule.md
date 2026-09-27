# Schedule (shooting days)

Dashboard **Schedule** tab (`apps/dashboard/src/Schedule.tsx`), per project. It plans which scouted shots are shot on which day, against the available light.

## Using it

- Left: the project's shooting days (past ones dimmed), "New day" (defaults to next Saturday). Changes **autosave** 600 ms after the last edit, per day, and are saved immediately when leaving the tab.
- A day: date, title, notes, then:
  - **Light timeline** for the day at the centre of its shots (Berlin when empty): coloured phases, sunrise/sunset, dawn/dusk times, max sun elevation.
  - **Forecast row** from Open-Meteo (`weather.ts`, about 16 days ahead, hourly): grey bar = cloud cover, blue = chance of rain ≥ 30 %, temperature every 3 h, hover for details. Outside the horizon it says so.
  - **Planned shots**, grouped by location in day order. Each shot has:
    - a thumbnail (opens the dialog)
    - its light requirement and **shootable window(s)**
    - a bar with the window in green
    - an optional planned time, flagged red when it falls outside the window
    - ↑/↓/✕ to reorder or remove
    Each location header shows the combined window. "Sort by planned time".
  - **Add shots**: approved shots (untick to see all) not yet on the day, grouped by location, filterable by location, each with its window for that date. Click a card to add it, or "add all" for a location.
- "All projects" cannot plan: pick a project.

## Light math (`packages/vocab/src/daylight.ts`, tested)

- `sunElevation(date, lat, lon)`: low-precision solar position with no dependencies (also runs offline on the phone). It matches published Berlin sunrise/sunset within 3 minutes.
- `dayLight(dayStart, lat, lon, hours)` samples each minute and returns phases by elevation:
  - `night` below `NIGHT_BELOW = -6°` (end of civil twilight)
  - `dawn` / `dusk` between −6° and `DAY_ABOVE = +6°`, before or after solar noon (blue hour + golden hour)
  - `day` above +6°
  It also returns sunrise/sunset (−0.833°) and noon. The thresholds are tunable constants.
- `shootableWindows(day, light)`: the union of the phases in the shot's `light`. An empty `light` (artificial only, or nothing set) means all day. The Artificial flag does not widen a shot that has phases.
- `localDay("YYYY-MM-DD")` gives local midnight and the day length (23/25 h on DST switches) in the viewer's time zone. The app assumes the viewer and the location share a time zone.

## Storage

`shooting_days` + `day_shots` (ordered, `planned_time` HH:MM, notes). `PUT /api/days/:id` replaces the whole day. Shots of another project, or deleted ones, are dropped silently. A shot moved to another project leaves the old project's days. See [api](../api.md).

The phone reads the same days in its [Day tab](day-mode-offline.md).
