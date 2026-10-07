-- Issue #27: shots that do not come from the phone camera. A photo is either captured on the phone
-- (camera), an uploaded image (upload), or a sketch drawn on the dashboard (drawn). Non-camera
-- photos have no rig framing; lens_mm stays NOT NULL (the table is referenced by overlays and
-- timeline clips, so it is not rebuilt) and is stored as 0 for them.
ALTER TABLE photos ADD COLUMN source TEXT NOT NULL DEFAULT 'camera';
