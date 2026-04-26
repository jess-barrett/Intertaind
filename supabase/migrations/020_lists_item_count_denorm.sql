-- Denormalize the per-list item count onto `lists` so cards on the
-- discovery page can show "X items" without a per-card aggregate query.
-- Mirrors the same pattern as like_count / saves_count.

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_list_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists
    SET item_count = COALESCE(item_count, 0) + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists
    SET item_count = GREATEST(COALESCE(item_count, 0) - 1, 0)
    WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_items_item_count_trigger ON list_items;
CREATE TRIGGER list_items_item_count_trigger
AFTER INSERT OR DELETE ON list_items
FOR EACH ROW
EXECUTE FUNCTION update_list_item_count();

-- Backfill from current state. Idempotent.
UPDATE lists l
SET item_count = COALESCE(sub.c, 0)
FROM (
  SELECT list_id, COUNT(*) AS c
  FROM list_items
  GROUP BY list_id
) AS sub
WHERE l.id = sub.list_id;

UPDATE lists SET item_count = 0 WHERE item_count IS NULL;
