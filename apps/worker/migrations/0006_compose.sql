-- Issue #12: shot descriptions, overlays (drawing + look over one photo) and sketches (free canvas on a shot).
-- Vector data is JSON (shape in @fielder/vocab compose.ts); the flattened render lives in R2 under render_key.

ALTER TABLE shots ADD COLUMN description TEXT;

CREATE TABLE overlays (
  id            TEXT PRIMARY KEY,
  photo_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  drawing       TEXT NOT NULL CHECK (json_valid(drawing)),
  presentation  TEXT NOT NULL CHECK (json_valid(presentation)),
  render_key    TEXT UNIQUE,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT
);
CREATE INDEX overlays_photo_idx ON overlays (photo_id, position);

CREATE TABLE sketches (
  id            TEXT PRIMARY KEY,
  shot_id       TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT,                                   -- free text; @fielder/vocab SKETCH_KINDS are suggestions
  description   TEXT,
  drawing       TEXT NOT NULL CHECK (json_valid(drawing)),
  aspect        REAL NOT NULL DEFAULT 1.7777778,        -- canvas width / height
  render_key    TEXT UNIQUE,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT
);
CREATE INDEX sketches_shot_idx ON sketches (shot_id, position);
