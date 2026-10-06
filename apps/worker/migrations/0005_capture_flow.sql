-- Issue #13: camera language on the shot, and photos without a position (GPS off on the phone).

-- Shot size and camera support are single choices, movement any subset (ids in @fielder/vocab).
ALTER TABLE shots ADD COLUMN shot_size TEXT;
ALTER TABLE shots ADD COLUMN camera_support TEXT;
ALTER TABLE shots ADD COLUMN movement TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(movement) AND json_type(movement) = 'array');

-- lat/lon become nullable. SQLite cannot drop NOT NULL in place, so the table is rebuilt with the
-- same columns (plus a check that both or neither are set) and every row is copied over.
-- Nothing references photos, so dropping the old table cascades nowhere.
PRAGMA defer_foreign_keys = true;

CREATE TABLE photos_new (
  id                  TEXT PRIMARY KEY,
  shot_id             TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL,
  timestamp           TEXT NOT NULL,
  lat                 REAL,                             -- NULL when captured without GPS
  lon                 REAL,
  gps_accuracy_m      REAL,
  preset_id           TEXT REFERENCES presets(id) ON DELETE SET NULL,
  lens_mm             REAL NOT NULL,
  r2_object_key       TEXT NOT NULL UNIQUE,
  width               INTEGER,
  height              INTEGER,
  framing             TEXT CHECK (framing IS NULL OR json_valid(framing)),
  device              TEXT CHECK (device IS NULL OR json_valid(device)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  position_corrected  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shot_id, ordinal),
  CHECK ((lat IS NULL) = (lon IS NULL))
);
INSERT INTO photos_new (id, shot_id, ordinal, timestamp, lat, lon, gps_accuracy_m, preset_id, lens_mm, r2_object_key, width, height, framing, device, created_at, position_corrected)
  SELECT id, shot_id, ordinal, timestamp, lat, lon, gps_accuracy_m, preset_id, lens_mm, r2_object_key, width, height, framing, device, created_at, position_corrected FROM photos;
DROP TABLE photos;
ALTER TABLE photos_new RENAME TO photos;
CREATE INDEX photos_shot_idx   ON photos (shot_id, ordinal);
CREATE INDEX photos_preset_idx ON photos (preset_id);
