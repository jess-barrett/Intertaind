-- Make the profile ROW (identity) publicly readable, independent of privacy.
--
-- Migration 008 gated `profiles` SELECT on `is_private = false OR id = auth.uid()`,
-- so a PRIVATE profile's row was invisible to everyone but its owner. That
-- broke the standard social pattern: on a private account you should still see
-- the profile CARD (avatar, name, @handle, bio, follower/following + media
-- counts) so you can find them and tap "Follow"/"Request" — only their CONTENT
-- (what they've tracked, shelves, activity, lists) is private.
--
-- Here we open the profile ROW to all readers. The CONTENT tables
-- (user_media / shelves / shelf_items / activity_log) KEEP their "public OR
-- owner" gate from 008 — private profiles' content stays hidden from
-- non-owners. (Follower-based visibility of that content is a separate, later
-- change via SECURITY DEFINER helpers, per 008's note.)
--
-- RLS-only change — no schema change, so no `pnpm gen:types` needed.

DROP POLICY IF EXISTS "profiles_select_public_or_owner" ON profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);
