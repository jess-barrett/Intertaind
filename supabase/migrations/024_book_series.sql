-- Series tagging for books. Three columns on media_items vs a separate
-- table because most books are in 0 or 1 series; the simpler shape
-- carries us through v1 and we can split into a join table later if
-- multi-series support becomes a real need.
--
-- `series_id` is internal and source-prefixed:
--   - "gb:{seriesId}"   when Google Books has a stable series id
--   - "ol:{slug}"       when only Open Library identifies the series
--                       (slug = lowercase + non-alphanumeric → "-")
-- That keeps the id stable across enrichment runs even when the upstream
-- has no native id of its own.

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS series_id        text,
  ADD COLUMN IF NOT EXISTS series_name      text,
  ADD COLUMN IF NOT EXISTS series_position  integer;

-- Partial index — only series-tagged rows participate. The graph query
-- on /media/[id] is `WHERE series_id = X ORDER BY series_position`, which
-- this index covers directly.
CREATE INDEX IF NOT EXISTS media_items_series_idx
  ON media_items (series_id, series_position)
  WHERE series_id IS NOT NULL;
