-- Allow authenticated users to create and edit their own profile row.
-- Reads are already governed by migration 004's public-or-owner policy;
-- this adds the missing write paths so /auth/setup-username (OAuth
-- finalize) and /settings (profile edits) work under RLS.

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
