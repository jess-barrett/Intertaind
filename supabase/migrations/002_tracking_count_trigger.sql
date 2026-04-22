-- Keep media_items.tracking_count in sync with user_media row counts.
-- Run this in the Supabase SQL editor.
--
-- After this migration:
--   * Inserting a row in user_media atomically increments tracking_count
--   * Deleting a row atomically decrements it (floored at 0)
--   * A one-time backfill recomputes tracking_count for all existing media
--
-- All "Popular" sorts and counts on the app use this column, so this is what
-- makes popularity actually work.

-- The function itself
CREATE OR REPLACE FUNCTION update_tracking_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE media_items
    SET tracking_count = COALESCE(tracking_count, 0) + 1
    WHERE id = NEW.media_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE media_items
    SET tracking_count = GREATEST(COALESCE(tracking_count, 0) - 1, 0)
    WHERE id = OLD.media_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires after every insert/delete on user_media
DROP TRIGGER IF EXISTS user_media_tracking_count_trigger ON user_media;
CREATE TRIGGER user_media_tracking_count_trigger
AFTER INSERT OR DELETE ON user_media
FOR EACH ROW
EXECUTE FUNCTION update_tracking_count();

-- One-time backfill: recompute tracking_count for every media item.
-- Safe to re-run; idempotent.
UPDATE media_items m
SET tracking_count = COALESCE(subquery.count, 0)
FROM (
  SELECT media_id, COUNT(*) AS count
  FROM user_media
  GROUP BY media_id
) AS subquery
WHERE m.id = subquery.media_id;

-- Also zero out any media items that have no user_media rows
-- (in case they had stale values from before the trigger).
UPDATE media_items
SET tracking_count = 0
WHERE tracking_count IS NULL
   OR id NOT IN (SELECT DISTINCT media_id FROM user_media);
