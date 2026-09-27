-- User-defined extra fields (see @fielder/vocab fields.ts). One row per top-level field; the JSON
-- holds the whole tree. Definitions are global; project_fields says which ones a project uses.
CREATE TABLE field_definitions (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL,
  definition  TEXT NOT NULL CHECK (json_valid(definition)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);
CREATE UNIQUE INDEX field_definitions_key_idx ON field_definitions (key);

CREATE TABLE project_fields (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_id    TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, field_id)
);
