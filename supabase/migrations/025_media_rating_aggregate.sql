-- Sync trigger for `media_items.avg_rating` + `media_items.rating_count`.
--
-- Both columns existed (with an index on avg_rating from migration 001)
-- but nothing populated them from user ratings. user_media.rating is on
-- a 1–10 scale (each step = 0.5 stars); media_items.avg_rating is on a
-- 0–5 scale to match the visualizer expectations (histogram + series
-- graph). We divide by 2 in the aggregate.
--
-- Pattern matches the recommendations counts trigger in migration 023:
-- AFTER INSERT/UPDATE/DELETE recompute from scratch (cheap because the
-- index on user_media.media_id makes the aggregate fast).

CREATE OR REPLACE FUNCTION sync_media_item_rating_aggregate()
RETURNS TRIGGER AS $$
DECLARE
  affected_media_id uuid;
BEGIN
  affected_media_id := COALESCE(NEW.media_id, OLD.media_id);

  UPDATE media_items
  SET
    avg_rating = COALESCE((
      SELECT AVG(rating)::numeric / 2.0
      FROM user_media
      WHERE media_id = affected_media_id
        AND rating IS NOT NULL
    ), 0),
    rating_count = COALESCE((
      SELECT COUNT(*)
      FROM user_media
      WHERE media_id = affected_media_id
        AND rating IS NOT NULL
    ), 0)
  WHERE id = affected_media_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_media_rating_aggregate_trigger ON user_media;
CREATE TRIGGER user_media_rating_aggregate_trigger
AFTER INSERT OR UPDATE OF rating OR DELETE ON user_media
FOR EACH ROW
EXECUTE FUNCTION sync_media_item_rating_aggregate();

-- One-time backfill so existing user ratings show up immediately.
-- Uses a single subquery so we never touch rows that have no ratings —
-- those keep avg_rating = 0 / rating_count = 0 (which they already are).
UPDATE media_items mi
SET
  avg_rating = stats.avg,
  rating_count = stats.cnt
FROM (
  SELECT
    media_id,
    (AVG(rating)::numeric / 2.0) AS avg,
    COUNT(*) AS cnt
  FROM user_media
  WHERE rating IS NOT NULL
  GROUP BY media_id
) stats
WHERE mi.id = stats.media_id;
