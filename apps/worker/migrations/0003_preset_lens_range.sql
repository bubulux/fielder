-- Optional lens range per rig (e.g. 18-35 for a zoom). NULL = any lens.
ALTER TABLE presets ADD COLUMN lens_min_mm REAL;
ALTER TABLE presets ADD COLUMN lens_max_mm REAL;
