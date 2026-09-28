# Day mode and offline days (phone)

The **Day** tab (`apps/mobile/src/screens/Day.tsx`, step-through in `StepThrough.tsx`) is for the shooting day itself, with the phone mounted on the camera. It opens on today when a day is planned for today.

## Flow

1. **Days list**: the active project's shooting days from `GET /api/days` (planned in the dashboard [Plan](schedule.md)), as Upcoming and Past (dimmed). Pull to refresh.
   - Each row has a date block (accent with a TODAY tag for today), the title, shots · locations, and the offline state: Online only · Saving n / m · Offline · up to date · Offline copy out of date.
   - Long-press a row: make (or update) it offline.
2. **Day overview**: header with back, the date and shot count.
   - "Now: dusk until 19:06" on today (otherwise the day's dawn and dusk times).
   - The **daylight timeline**: phases with icons, the day's shootable windows as a green band under it, a now marker on today.
   - Sunrise/sunset, the notes.
   - The **offline control** (below).
   - Shots grouped by location in plan order: each group shows its combined window; each row shows a fit thumbnail, the name, the light requirement and the planned time (red with "outside window" when it falls outside).
   - Tap a row to step through from it, or "Start from the first shot" (pinned).
3. **Step-through**: immersive (no tab bar, no header, status bar hidden, the screen kept on with `expo-keep-awake`).
   - Landscape: **Prev** as a 96 dp column at the left thumb, **Next** as a 112 dp accent column at the right thumb; both are disabled (dashed) at the ends.
   - The photo (fit mode by default; the mode is in the Details sheet and remembered in `stepMode.v1`) with a "3 / 9" badge. Sequences have a "Photo 2 / 5 ›" button that cycles. Swipe on the photo = prev/next shot.
   - The info panel: name, location, planned time, window and light requirement (green, or red with an alert when the plan falls outside).
   - Portrait: the photo on top, the info below, and Prev | Next as a 120 dp bar at the bottom (1 : 1.4).
   - **Details** (ⓘ sheet): planned time and window, location, tags, rig, extra fields, the planned shot's notes, the frame mode, Show on map (online only), Leave step-through. Android back also leaves.

Light is computed on the phone (`@fielder/vocab` `dayLight`), so it works offline.

## Offline

- **Make offline** (the overview's control, or long-press in the list) stores the day and its shots with all metadata, and downloads every photo to `Documents/offline-photos/` (`apps/mobile/src/offline.ts`, `File.downloadFileAsync` with the auth header). The control shows:
  - progress (n / m photos) while it runs; the rest of the screen stays usable
  - "Offline · up to date" with **Remove** (photos shared with another offline day stay; Remove confirms)
  - "Offline copy out of date" with **Update offline** when the plan changed on the server (`updated_at` differs)
  - "Saving stopped at n / m" with **Try again** when a download failed
- Without a connection (the days request fails) the tab shows only the days saved on the phone, with the offline banner, and their stored shots. Step-through needs nothing from the network.
- `ShotFrame` (every photo on the phone) uses the local copy when one exists. The Shots grid falls back to the shots of offline days when the server can't be reached.
- Capturing works offline anyway: shots queue ([capture](capture.md)). Projects and extra-field definitions are cached, so tagging works too. Map tiles are **not** cached; maps show "Map needs a connection".

Storage: kv key `offlineDays.v1` (day id → `{ day, shots, projectName, savedAt }`).
