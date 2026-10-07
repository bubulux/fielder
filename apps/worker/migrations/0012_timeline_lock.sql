-- Issue #31 follow-up: a timeline can lock one presentation mode for every clip
-- (null = each clip keeps its own presentation).

ALTER TABLE timelines ADD COLUMN lock_mode TEXT CHECK (lock_mode IS NULL OR lock_mode IN ('mask', 'frame', 'fit', 'off'));
