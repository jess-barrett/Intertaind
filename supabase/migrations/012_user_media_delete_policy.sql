-- Ensure the owning user can DELETE their own user_media rows.
-- The Wishlist toggle in MediaCardActions calls removeTracking, but if RLS
-- silently rejects the delete the activity row never gets removed and the
-- popup keeps lighting Wishlist back up after a refresh.

DROP POLICY IF EXISTS "user_media_delete_self" ON user_media;
CREATE POLICY "user_media_delete_self"
  ON user_media FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Belt-and-suspenders: ensure INSERT/UPDATE policies also exist with the
-- standard owner-only rule, in case the dashboard-created table doesn't
-- have them either.
DROP POLICY IF EXISTS "user_media_insert_self" ON user_media;
CREATE POLICY "user_media_insert_self"
  ON user_media FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_media_update_self" ON user_media;
CREATE POLICY "user_media_update_self"
  ON user_media FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
