-- Optional "extra" tags: JSON object { collectionId: value } validated by the Worker against @fielder/vocab.
ALTER TABLE shots ADD COLUMN extra TEXT CHECK (extra IS NULL OR json_valid(extra));
