-- Speeds up the per-credit lookup on the person page:
--   SELECT * FROM media_items
--    WHERE external_ids->>'tmdb_id' IN ($1, $2, ..., $N);
--
-- Without an index, that scans the full table; with a GIN index on the
-- whole JSONB column, Postgres can use the @> containment operator
-- (which the IN-list translates to under the hood) for fast lookups.
-- Same index also helps any future external_ids->>'igdb_id' /
-- 'google_books_id' queries.

CREATE INDEX IF NOT EXISTS media_items_external_ids_gin_idx
  ON media_items USING gin (external_ids);
