-- Sequence blocks in timelines (issue #37): a block's settings on its timeline (JSON array of
-- { id, mode, total_ms, split, edge_weight }), the membership on each clip. Existing clips stay loose.
ALTER TABLE timelines ADD COLUMN groups TEXT NOT NULL DEFAULT '[]';
ALTER TABLE timeline_clips ADD COLUMN group_id TEXT;
