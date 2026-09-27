-- Shooting schedule: a project's shooting days and the shots planned for each, in order.
CREATE TABLE shooting_days (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,                        -- YYYY-MM-DD (local date of the shoot)
  title       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);
CREATE INDEX shooting_days_project_idx ON shooting_days (project_id, date);

CREATE TABLE day_shots (
  day_id        TEXT NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
  shot_id       TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  planned_time  TEXT,                               -- HH:MM, optional
  notes         TEXT,
  PRIMARY KEY (day_id, shot_id)
);
CREATE INDEX day_shots_shot_idx ON day_shots (shot_id);
