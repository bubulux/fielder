-- Issue #12, part 2: timelines. A project has any number of named timelines; a clip holds one photo
-- (optionally seen through one of its overlays), how it is presented (frame mode + rig frame) and
-- how long it stays. Deleting a photo's shot removes its clips; deleting an overlay keeps the clip
-- (it then shows the photo as is).

CREATE TABLE timelines (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);
CREATE INDEX timelines_project_idx ON timelines (project_id, created_at);

CREATE TABLE timeline_clips (
  id            TEXT PRIMARY KEY,
  timeline_id   TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  photo_id      TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  overlay_id    TEXT REFERENCES overlays(id) ON DELETE SET NULL,
  presentation  TEXT NOT NULL CHECK (json_valid(presentation)),
  duration_ms   INTEGER NOT NULL CHECK (duration_ms BETWEEN 100 AND 3600000),
  notes         TEXT
);
CREATE INDEX timeline_clips_timeline_idx ON timeline_clips (timeline_id, position);
CREATE INDEX timeline_clips_photo_idx    ON timeline_clips (photo_id);
