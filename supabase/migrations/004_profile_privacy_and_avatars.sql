-- Profile editing support:
--   1. Add is_private flag so users can hide their profile/shelves/activity
--      from non-followers.
--   2. Tighten RLS so private profiles are only visible to their owner.
--   3. Create an `avatars` storage bucket for user-uploaded profile images.

-- ─── 1. is_private column ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_private_idx ON profiles(is_private);

-- ─── 2. RLS: respect is_private on profile and shelf reads ─────────────
-- profiles: public rows readable by everyone; private rows only by owner.
DROP POLICY IF EXISTS "profiles_select_public_or_owner" ON profiles;
CREATE POLICY "profiles_select_public_or_owner"
  ON profiles FOR SELECT
  USING (
    is_private = false
    OR id = auth.uid()
  );

-- user_media: only visible when the owning profile is public, or viewer is
-- the owner. (Keeps shelf grids hidden on private profiles.)
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

-- shelves: same pattern — private profiles hide their shelves.
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

-- shelf_items: visible only when the containing shelf is visible.
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

-- activity_log: same rule — private users don't leak activity.
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

-- ─── 3. Avatars storage bucket ─────────────────────────────────────────
-- Public bucket so <img src="..."> works without signed URLs. Uploads are
-- gated by RLS: a user can only write to a path prefixed with their own
-- user id (e.g. "<uid>/avatar.png").
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (bucket is public).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload/update/delete their own avatar files.
-- Path convention: "{user_id}/anything" — first segment of the name must
-- equal the caller's uid.
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
