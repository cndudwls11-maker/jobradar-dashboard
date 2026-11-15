ALTER TABLE preferences
  ADD COLUMN locations_json TEXT NOT NULL DEFAULT '[]';