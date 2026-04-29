-- Series completion status — populated when Wikidata has the data
-- (currently the only source we trust for this signal). Values:
--   'ongoing'   — series is active, more books expected
--   'complete'  — series concluded, final book published
--   'cancelled' — series abandoned before completion
--   'hiatus'    — author paused, may resume (rare in current data)
--   null        — unknown / no signal from any source
--
-- No new index — we don't query by status, only read it on the
-- detail-page render in tandem with series_id / series_name.

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS series_status text;
