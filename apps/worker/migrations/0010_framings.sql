-- Issue #29: re-framing. A framing is a rig + lens (its size) placed somewhere on a photo (its
-- centre); a photo can have several and one of them as root, which every view shows. The
-- as-captured frame stays in photos.framing and is never edited; root_framing_id NULL means it.
CREATE TABLE framings (
  id          TEXT PRIMARY KEY,
  photo_id    TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rig_id      TEXT REFERENCES presets(id) ON DELETE SET NULL,  -- NULL = the rig the photo was captured with
  lens_mm     REAL NOT NULL,
  frame       TEXT NOT NULL CHECK (json_valid(frame)),         -- { width_fraction, height_fraction, x, y }
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);
CREATE INDEX framings_photo_idx ON framings (photo_id, position);

ALTER TABLE photos ADD COLUMN root_framing_id TEXT REFERENCES framings(id) ON DELETE SET NULL;
