-- Issue #31: placeholder clips. A timeline can reserve time for a shot that does not exist yet:
-- a clip without a photo, carrying a title instead. photo_id and presentation become nullable,
-- which SQLite only allows by rebuilding the table (nothing references timeline_clips, so the
-- copy is safe; the data is kept).

CREATE TABLE timeline_clips_new (
  id            TEXT PRIMARY KEY,
  timeline_id   TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  photo_id      TEXT REFERENCES photos(id) ON DELETE CASCADE,
  overlay_id    TEXT REFERENCES overlays(id) ON DELETE SET NULL,
  presentation  TEXT CHECK (presentation IS NULL OR json_valid(presentation)),
  duration_ms   INTEGER NOT NULL CHECK (duration_ms BETWEEN 100 AND 3600000),
  notes         TEXT,
  -- What a placeholder says it wants; photo clips carry no title.
  title         TEXT,
  -- Either a photo clip (photo + presentation) or a placeholder (title, no overlay/presentation).
  CHECK ((photo_id IS NOT NULL AND presentation IS NOT NULL) OR (photo_id IS NULL AND title IS NOT NULL AND overlay_id IS NULL AND presentation IS NULL))
);

INSERT INTO timeline_clips_new (id, timeline_id, position, photo_id, overlay_id, presentation, duration_ms, notes)
  SELECT id, timeline_id, position, photo_id, overlay_id, presentation, duration_ms, notes FROM timeline_clips;

DROP TABLE timeline_clips;
ALTER TABLE timeline_clips_new RENAME TO timeline_clips;

CREATE INDEX timeline_clips_timeline_idx ON timeline_clips (timeline_id, position);
CREATE INDEX timeline_clips_photo_idx    ON timeline_clips (photo_id);
