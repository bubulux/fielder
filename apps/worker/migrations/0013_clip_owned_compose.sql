-- Issue #31, inline editing: overlays and sketches made in a timeline belong to that timeline's clip
-- until they are promoted to the shot. A clip-owned row carries timeline_id + clip_id (the clip has
-- no FK: a timeline PUT replaces its clips, and the Worker deletes the rows of clips that go away).
-- A sketch clip is a clip without a photo that shows a sketch (timeline_clips.sketch_id).

ALTER TABLE overlays ADD COLUMN timeline_id TEXT REFERENCES timelines(id) ON DELETE CASCADE;
ALTER TABLE overlays ADD COLUMN clip_id TEXT;
CREATE INDEX overlays_timeline_idx ON overlays (timeline_id, clip_id);

-- A sketch is owned by a shot or by a timeline clip, so shot_id becomes nullable. SQLite needs a
-- rebuild for that; nothing references sketches yet, and every row is copied.
CREATE TABLE sketches_new (
  id            TEXT PRIMARY KEY,
  shot_id       TEXT REFERENCES shots(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT,
  description   TEXT,
  drawing       TEXT NOT NULL CHECK (json_valid(drawing)),
  aspect        REAL NOT NULL DEFAULT 1.7777778,
  render_key    TEXT UNIQUE,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT,
  timeline_id   TEXT REFERENCES timelines(id) ON DELETE CASCADE,
  clip_id       TEXT,
  CHECK ((shot_id IS NOT NULL AND timeline_id IS NULL AND clip_id IS NULL) OR (shot_id IS NULL AND timeline_id IS NOT NULL AND clip_id IS NOT NULL))
);
INSERT INTO sketches_new (id, shot_id, name, kind, description, drawing, aspect, render_key, position, created_at, updated_at)
  SELECT id, shot_id, name, kind, description, drawing, aspect, render_key, position, created_at, updated_at FROM sketches;
DROP TABLE sketches;
ALTER TABLE sketches_new RENAME TO sketches;
CREATE INDEX sketches_shot_idx ON sketches (shot_id, position);
CREATE INDEX sketches_timeline_idx ON sketches (timeline_id, clip_id);

-- Deleting the sketch turns its clip into a placeholder (it keeps its title).
ALTER TABLE timeline_clips ADD COLUMN sketch_id TEXT REFERENCES sketches(id) ON DELETE SET NULL;
