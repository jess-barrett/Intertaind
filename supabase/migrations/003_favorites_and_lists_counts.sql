-- Denormalize favorite and list counts onto media_items for fast popularity
-- and discovery-card stats. Maintained via triggers so reads stay O(1).

-- 1. Add the columns (idempotent)
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS favorites_count integer NOT NULL DEFAULT 0;

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS lists_count integer NOT NULL DEFAULT 0;

-- 2. Favorites trigger — maintain media_items.favorites_count in sync
-- with user_media.is_favorite.
CREATE OR REPLACE FUNCTION update_favorites_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_favorite THEN
    UPDATE media_items
    SET favorites_count = COALESCE(favorites_count, 0) + 1
    WHERE id = NEW.media_id;
  ELSIF TG_OP = 'DELETE' AND OLD.is_favorite THEN
    UPDATE media_items
    SET favorites_count = GREATEST(COALESCE(favorites_count, 0) - 1, 0)
    WHERE id = OLD.media_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_favorite = false AND NEW.is_favorite = true THEN
      UPDATE media_items
      SET favorites_count = COALESCE(favorites_count, 0) + 1
      WHERE id = NEW.media_id;
    ELSIF OLD.is_favorite = true AND NEW.is_favorite = false THEN
      UPDATE media_items
      SET favorites_count = GREATEST(COALESCE(favorites_count, 0) - 1, 0)
      WHERE id = NEW.media_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_media_favorites_count_trigger ON user_media;
CREATE TRIGGER user_media_favorites_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_media
FOR EACH ROW
EXECUTE FUNCTION update_favorites_count();

-- 3. Lists trigger — maintain media_items.lists_count
CREATE OR REPLACE FUNCTION update_lists_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE media_items
    SET lists_count = COALESCE(lists_count, 0) + 1
    WHERE id = NEW.media_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE media_items
    SET lists_count = GREATEST(COALESCE(lists_count, 0) - 1, 0)
    WHERE id = OLD.media_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_items_lists_count_trigger ON list_items;
CREATE TRIGGER list_items_lists_count_trigger
AFTER INSERT OR DELETE ON list_items
FOR EACH ROW
EXECUTE FUNCTION update_lists_count();

-- 4. One-time backfill
UPDATE media_items m
SET favorites_count = COALESCE(subquery.count, 0)
FROM (
  SELECT media_id, COUNT(*) AS count
  FROM user_media
  WHERE is_favorite = true
  GROUP BY media_id
) AS subquery
WHERE m.id = subquery.media_id;

UPDATE media_items
SET favorites_count = 0
WHERE favorites_count IS NULL;

UPDATE media_items m
SET lists_count = COALESCE(subquery.count, 0)
FROM (
  SELECT media_id, COUNT(*) AS count
  FROM list_items
  GROUP BY media_id
) AS subquery
WHERE m.id = subquery.media_id;

UPDATE media_items
SET lists_count = 0
WHERE lists_count IS NULL;
