# Day mode and offline days (phone)

The **Day** tab (`apps/mobile/src/screens/ShootDay.tsx`, formerly "Prep") is for the shooting day itself, with the phone mounted on the camera.

## Flow

1. **Days list**: the active project's shooting days from `GET /api/days` (planned in the dashboard [Schedule](schedule.md)). Each shows its shot count and offline state. Pull to refresh.
2. **Day overview**:
   - a light bar with a "now" marker when the day is today, sunrise/sunset, dawn/dusk times, "Now: dusk until 19:12", and the day's notes
   - shots grouped by location in plan order, with planned time, light requirement and shootable window
   Tap a shot, or "Start from the first shot".
3. **Step through**: big ◀ ▶ buttons (the old Prep UX), fit mode by default. The header shows the position, name, location, planned time and window. Sequences: "photo 1/5 ›" cycles through their photos. The ⓘ sheet shows details and the planned shot's notes.

Light is computed on the phone (`@fielder/vocab` `dayLight`), so it works offline.

## Offline

- **Make offline** (days list) stores the day, its shots with all metadata, and downloads every photo image to `Documents/offline-photos/` (`apps/mobile/src/offline.ts`, `File.downloadFileAsync` with the auth header). A progress count shows while it runs.
- When the plan changes on the server (`updated_at` differs) the button becomes **Update offline**. **✓ offline** removes the copy (photos shared with another offline day stay).
- Without a connection (the days request fails) the tab shows the days saved on the phone, with an "Offline" banner, and their stored shots.
- `ShotFrame` (every photo on the phone) uses the local copy when one exists, so offline photos also show in the gallery.
- Capturing works offline anyway: shots queue ([capture](capture.md)). Projects and extra-field definitions are cached, so tagging works too. Map tiles are **not** cached.

Storage: kv key `offlineDays.v1` (day id → `{ day, shots, projectName, savedAt }`).
