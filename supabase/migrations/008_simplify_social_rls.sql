-- Emergency rollback of migration 007's compound RLS. The policies that
-- reference both `follows` and `blocks` inside the profiles/user_media
-- checks interact badly with each table's own RLS (blocks is only visible
-- to the blocker, so the NOT EXISTS subquery behaves unexpectedly).
--
-- Here we go back to migration 004's simpler "public OR owner" policy for
-- profiles/user_media/shelves/shelf_items/activity_log. Private profiles
-- are once again visible only to their owner. Follower-based visibility
-- for private profiles + block-based invisibility will be re-added in a
-- later migration using SECURITY DEFINER helper functions that don't
-- recurse into their own RLS.
--
-- This migration is SAFE to run on top of 007 — it only replaces the
-- problem policies. The new social tables, columns, and triggers stay.

DROP POLICY IF EXISTS "profiles_select_public_or_owner" ON profiles;
CREATE POLICY "profiles_select_public_or_owner"
  ON profiles FOR SELECT
  USING (is_private = false OR id = auth.uid());

DROP POLICY IF EXISTS "user_media_select_public_or_owner" ON user_media;
CREATE POLICY "user_media_select_public_or_owner"
  ON user_media FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = user_media.user_id
        AND profiles.is_private = false
    )
  );

DROP POLICY IF EXISTS "shelves_select_public_or_owner" ON shelves;
CREATE POLICY "shelves_select_public_or_owner"
  ON shelves FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = shelves.user_id
        AND profiles.is_private = false
    )
  );

DROP POLICY IF EXISTS "shelf_items_select_public_or_owner" ON shelf_items;
CREATE POLICY "shelf_items_select_public_or_owner"
  ON shelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shelves
      WHERE shelves.id = shelf_items.shelf_id
        AND (
          shelves.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = shelves.user_id
              AND profiles.is_private = false
          )
        )
    )
  );

DROP POLICY IF EXISTS "activity_log_select_public_or_owner" ON activity_log;
CREATE POLICY "activity_log_select_public_or_owner"
  ON activity_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = activity_log.user_id
        AND profiles.is_private = false
    )
  );
