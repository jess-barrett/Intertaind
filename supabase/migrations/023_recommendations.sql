-- Quick recommendations — one-shot "if you liked X, try Y" pairings.
-- Lighter-weight than a full curated list: a single source media, a
-- single recommended target, an optional one-line note. Surfaced on
-- each media page as a community-pairings section, the inverse view
-- ("recommended FOR fans of this") on the same media's page, and on
-- the recommender's profile.
--
-- Why a dedicated table (vs reusing `lists` with a flag): the hot path
-- on every media page is "show recs for THIS media", which here is a
-- single-table indexed seek on a narrow row. Reusing `lists` would
-- force a JOIN with `list_items` for every read and pollute the lists
-- table with mostly 1-item rows that every "real list" query then has
-- to filter out. See PR description / chat plan for the full tradeoff
-- write-up.

CREATE TABLE IF NOT EXISTS recommendations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_media_id      uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  recommended_media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  note                 text CHECK (note IS NULL OR char_length(note) <= 280),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_recommend CHECK (source_media_id <> recommended_media_id),
  CONSTRAINT unique_rec UNIQUE (user_id, source_media_id, recommended_media_id)
);

-- Hot indexes — every media page hits one of these. Covering ORDER BY
-- created_at DESC means LIMIT-based paging stays index-only.
CREATE INDEX IF NOT EXISTS recommendations_source_idx
  ON recommendations(source_media_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendations_target_idx
  ON recommendations(recommended_media_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendations_user_idx
  ON recommendations(user_id, created_at DESC);

-- Denormalize counts onto media_items so listing surfaces (media cards,
-- search results) can show "recommended N times" without an aggregate.
-- Same pattern used for tracking_count, lists_count, etc.
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS recommendations_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_for_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_recommendations_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE media_items
      SET recommendations_count = COALESCE(recommendations_count, 0) + 1
      WHERE id = NEW.source_media_id;
    UPDATE media_items
      SET recommended_for_count = COALESCE(recommended_for_count, 0) + 1
      WHERE id = NEW.recommended_media_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE media_items
      SET recommendations_count = GREATEST(COALESCE(recommendations_count, 0) - 1, 0)
      WHERE id = OLD.source_media_id;
    UPDATE media_items
      SET recommended_for_count = GREATEST(COALESCE(recommended_for_count, 0) - 1, 0)
      WHERE id = OLD.recommended_media_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recommendations_counts_trigger ON recommendations;
CREATE TRIGGER recommendations_counts_trigger
AFTER INSERT OR DELETE ON recommendations
FOR EACH ROW
EXECUTE FUNCTION update_recommendations_counts();

-- RLS — readable by anyone for public profiles, owner-only for private.
-- Same shape as activity_log_select_public_or_owner (migration 008).
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recommendations_select_public_or_owner" ON recommendations;
CREATE POLICY "recommendations_select_public_or_owner"
  ON recommendations FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = recommendations.user_id
        AND profiles.is_private = false
    )
  );

DROP POLICY IF EXISTS "recommendations_insert_self" ON recommendations;
CREATE POLICY "recommendations_insert_self"
  ON recommendations FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "recommendations_delete_self" ON recommendations;
CREATE POLICY "recommendations_delete_self"
  ON recommendations FOR DELETE
  USING (user_id = auth.uid());
