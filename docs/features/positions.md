# GPS and position correction

## Acquisition (phone, `Viewfinder.tsx`)

- While the Shoot tab is on screen, `watchPositionAsync` runs at `Accuracy.BestForNavigation` (every second). The latest fix is kept warm and its accuracy shown in the HUD ("GPS ±5 m", orange above 20 m).
- On Android the app asks once to turn on Google Location Accuracy (`enableNetworkProviderAsync`). Wi-Fi/cell assistance gives much faster and tighter fixes. This is the main "setting that improves GPS"; the rest depends on the phone and on sky view.
- At capture:
  1. a watched fix younger than 15 s is used as is;
  2. otherwise it waits up to 8 s for a `Highest` fix;
  3. then falls back to the last watched or last known (≤ 10 min) position;
  4. with none at all the capture is refused.
- Stored per photo: `lat`, `lon`, `gps_accuracy_m`, and in `device` altitude, heading and fix age.

## Manual correction

- **Dashboard** (`PositionEditor.tsx`): the shot view or Review → stage **Position** (or the inspector’s Position → Correct). The stage becomes a map at zoom 18 with the reported accuracy circle and the original position. Drag the pin or click the map; the bar shows the coordinates and the distance moved. Save position (Enter) or Cancel (Esc).
- **Phone** (`components/PositionPicker.tsx`): Gallery → shot → Correct position. Same idea on a Leaflet map in a WebView.
- For a sequence, "All n photos of this shot" moves every photo (default on).
- API: `PATCH /api/photos/:id { lat, lon, all_in_shot }`. It sets `photos.position_corrected = 1`, keeps the original `gps_accuracy_m`, and the UI shows "corrected" instead of the accuracy.

Maps use the cover photo's position for a shot (dashboard Shots › Map, `MapView.tsx`; phone `MapScreen.tsx`).
