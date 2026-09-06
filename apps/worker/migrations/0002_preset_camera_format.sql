-- Rigs are now composed as camera body + recording format (+ speedbooster).
-- Sensor dimensions stay the source of truth for the math; ids are for UX/history.
ALTER TABLE presets ADD COLUMN camera_id TEXT;
ALTER TABLE presets ADD COLUMN format_id TEXT;
ALTER TABLE presets ADD COLUMN updated_at TEXT;
