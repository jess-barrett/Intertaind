-- Denormalize completed + in-progress counts onto media_items so the
-- MediaCard's media-type-specific stats row (Watched / Currently
-- watching / Read / Currently reading / Played) doesn't need a per-card
-- query. Mirrors the existing tracking_count pattern from migration 002.

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS completed_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_progress_count integer NOT NULL DEFAULT 0;

-- Trigger function: handle INSERT, DELETE, and status transitions on
-- UPDATE. Each branch only touches the column relevant to its status,
-- so a `want → completed` move increments completed_count without
-- ever touching in_progress_count.
CREATE OR REPLACE FUNCTION update_status_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      UPDATE media_items
      SET completed_count = COALESCE(completed_count, 0) + 1
      WHERE id = NEW.media_id;
    ELSIF NEW.status = 'in_progress' THEN
      UPDATE media_items
      SET in_progress_count = COALESCE(in_progress_count, 0) + 1
      WHERE id = NEW.media_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      UPDATE media_items
      SET completed_count = GREATEST(COALESCE(completed_count, 0) - 1, 0)
      WHERE id = OLD.media_id;
    ELSIF OLD.status = 'in_progress' THEN
      UPDATE media_items
      SET in_progress_count = GREATEST(COALESCE(in_progress_count, 0) - 1, 0)
      WHERE id = OLD.media_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Decrement the bucket the row was leaving
    IF OLD.status = 'completed' THEN
      UPDATE media_items
      SET completed_count = GREATEST(COALESCE(completed_count, 0) - 1, 0)
      WHERE id = OLD.media_id;
    ELSIF OLD.status = 'in_progress' THEN
      UPDATE media_items
      SET in_progress_count = GREATEST(COALESCE(in_progress_count, 0) - 1, 0)
      WHERE id = OLD.media_id;
    END IF;
    -- Increment the bucket it's entering
    IF NEW.status = 'completed' THEN
      UPDATE media_items
      SET completed_count = COALESCE(completed_count, 0) + 1
      WHERE id = NEW.media_id;
    ELSIF NEW.status = 'in_progress' THEN
      UPDATE media_items
      SET in_progress_count = COALESCE(in_progress_count, 0) + 1
      WHERE id = NEW.media_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_media_status_counts_trigger ON user_media;
CREATE TRIGGER user_media_status_counts_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_media
FOR EACH ROW
EXECUTE FUNCTION update_status_counts();

-- One-time backfill from current data. Idempotent.
UPDATE media_items m
SET completed_count = COALESCE(subq.c, 0)
FROM (
  SELECT media_id, COUNT(*) AS c
  FROM user_media
  WHERE status = 'completed'
  GROUP BY media_id
) AS subq
WHERE m.id = subq.media_id;

UPDATE media_items m
SET in_progress_count = COALESCE(subq.c, 0)
FROM (
  SELECT media_id, COUNT(*) AS c
  FROM user_media
  WHERE status = 'in_progress'
  GROUP BY media_id
) AS subq
WHERE m.id = subq.media_id;

-- Zero out any nulls left from before the trigger existed
UPDATE media_items SET completed_count   = 0 WHERE completed_count   IS NULL;
UPDATE media_items SET in_progress_count = 0 WHERE in_progress_count IS NULL;
