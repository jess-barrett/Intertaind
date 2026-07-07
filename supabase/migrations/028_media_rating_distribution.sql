-- Denormalized rating distribution for the ratings histogram.
--
-- The histogram (web + mobile) needs the count of ratings in each of the
-- 10 half-star buckets (rating 1..10 → 0.5..5.0 stars). Web previously
-- fetched EVERY `user_media.rating` row for a title and bucketed them in
-- JS on each page load — fine at small scale, but a popular title could
-- pull tens of thousands of rows just to draw 10 bars. At Intertaind's
-- target scale that read is untenable, so we denormalize the 10 bucket
-- counts onto `media_items` and maintain them in the SAME trigger that
-- already keeps `avg_rating` + `rating_count` (migration 025). Both apps
-- then read the distribution O(1) alongside the media row they already
-- fetch — no per-view aggregation anywhere.
--
-- Shape: `integer[]` of length 10, 1-indexed to match the DB rating scale
-- — `rating_distribution[k]` = number of ratings equal to `k` (k in
-- 1..10), so index 1 = 0.5★ … index 10 = 5.0★. Postgres codegen types
-- `integer[]` as `number[]`, which is exactly what `RatingsHistogram`
-- consumes.

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS rating_distribution integer[] NOT NULL
  DEFAULT ARRAY[0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

-- Extend the existing aggregate trigger to compute the distribution in
-- the SAME single pass as avg + count. `CREATE OR REPLACE` keeps the
-- existing trigger binding (`user_media_rating_aggregate_trigger`)
-- intact — only the function body changes.
CREATE OR REPLACE FUNCTION sync_media_item_rating_aggregate()
RETURNS TRIGGER AS $$
DECLARE
  affected_media_id uuid;
  v_avg numeric;
  v_count bigint;
  v_dist integer[];
BEGIN
  affected_media_id := COALESCE(NEW.media_id, OLD.media_id);

  -- One scan over this title's ratings → average (÷2 for the 0–5 scale),
  -- total count, and the 10 half-star bucket counts. Aggregates over an
  -- empty set yield AVG NULL (→ 0), COUNT 0, and all-zero FILTER counts,
  -- so the last rating being removed resets the row cleanly.
  SELECT
    COALESCE(AVG(rating)::numeric / 2.0, 0),
    COUNT(*),
    ARRAY[
      COUNT(*) FILTER (WHERE rating = 1),
      COUNT(*) FILTER (WHERE rating = 2),
      COUNT(*) FILTER (WHERE rating = 3),
      COUNT(*) FILTER (WHERE rating = 4),
      COUNT(*) FILTER (WHERE rating = 5),
      COUNT(*) FILTER (WHERE rating = 6),
      COUNT(*) FILTER (WHERE rating = 7),
      COUNT(*) FILTER (WHERE rating = 8),
      COUNT(*) FILTER (WHERE rating = 9),
      COUNT(*) FILTER (WHERE rating = 10)
    ]::integer[]
  INTO v_avg, v_count, v_dist
  FROM user_media
  WHERE media_id = affected_media_id
    AND rating IS NOT NULL;

  UPDATE media_items
  SET
    avg_rating = v_avg,
    rating_count = v_count,
    rating_distribution = v_dist
  WHERE id = affected_media_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- One-time backfill of the new column for titles that already have
-- ratings (avg_rating + rating_count were already backfilled in 025).
-- Rows with no ratings keep the all-zero default.
UPDATE media_items mi
SET rating_distribution = stats.dist
FROM (
  SELECT
    media_id,
    ARRAY[
      COUNT(*) FILTER (WHERE rating = 1),
      COUNT(*) FILTER (WHERE rating = 2),
      COUNT(*) FILTER (WHERE rating = 3),
      COUNT(*) FILTER (WHERE rating = 4),
      COUNT(*) FILTER (WHERE rating = 5),
      COUNT(*) FILTER (WHERE rating = 6),
      COUNT(*) FILTER (WHERE rating = 7),
      COUNT(*) FILTER (WHERE rating = 8),
      COUNT(*) FILTER (WHERE rating = 9),
      COUNT(*) FILTER (WHERE rating = 10)
    ]::integer[] AS dist
  FROM user_media
  WHERE rating IS NOT NULL
  GROUP BY media_id
) stats
WHERE mi.id = stats.media_id;
