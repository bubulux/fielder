-- Issue #19: a location can have a position (its pin), and a shot can take its position from its
-- location instead of its photos' GPS. The photos keep their own lat/lon either way.
ALTER TABLE locations ADD COLUMN lat REAL;
ALTER TABLE locations ADD COLUMN lon REAL;
ALTER TABLE shots ADD COLUMN position_from_location INTEGER NOT NULL DEFAULT 0;
