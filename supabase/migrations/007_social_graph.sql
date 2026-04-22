-- Social graph: follows, follow requests, blocks, notifications.
-- Adds denormalized follower/following counts to profiles (maintained by
-- triggers, same pattern as tracking_count / favorites_count).
-- Extends RLS so private profiles are visible to accepted followers, and
-- mutual blocks are enforced at the database layer.

-- ─── Tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follows (
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx  ON follows(follower_id);

CREATE TABLE IF NOT EXISTS follow_requests (
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, target_id),
  CHECK (requester_id <> target_id)
);
CREATE INDEX IF NOT EXISTS follow_requests_target_idx ON follow_requests(target_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('follow', 'follow_request', 'follow_accepted')),
  actor_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_recent_idx
  ON notifications(user_id, read_at NULLS FIRST, created_at DESC);

-- ─── Denormalized counts ──────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS followers_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS following_count int NOT NULL DEFAULT 0;

-- ─── Triggers ─────────────────────────────────────────────────────────

-- follows insert/delete → maintain counts + create 'follow' notification
CREATE OR REPLACE FUNCTION handle_follows_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    INSERT INTO notifications (user_id, type, actor_id)
    VALUES (NEW.following_id, 'follow', NEW.follower_id);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
      SET followers_count = GREATEST(followers_count - 1, 0)
      WHERE id = OLD.following_id;
    UPDATE profiles
      SET following_count = GREATEST(following_count - 1, 0)
      WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS follows_change_trigger ON follows;
CREATE TRIGGER follows_change_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION handle_follows_change();

-- follow_requests insert → create 'follow_request' notification
CREATE OR REPLACE FUNCTION handle_follow_request_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id)
  VALUES (NEW.target_id, 'follow_request', NEW.requester_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS follow_request_insert_trigger ON follow_requests;
CREATE TRIGGER follow_request_insert_trigger
AFTER INSERT ON follow_requests
FOR EACH ROW EXECUTE FUNCTION handle_follow_request_insert();

-- ─── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE follows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;

-- follows: involved parties can see; follower manages own rows
DROP POLICY IF EXISTS "follows_select_involved" ON follows;
CREATE POLICY "follows_select_involved"
  ON follows FOR SELECT
  USING (follower_id = auth.uid() OR following_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM profiles p
           WHERE (p.id = follows.follower_id OR p.id = follows.following_id)
             AND p.is_private = false
         ));

DROP POLICY IF EXISTS "follows_insert_self" ON follows;
CREATE POLICY "follows_insert_self"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "follows_delete_self" ON follows;
CREATE POLICY "follows_delete_self"
  ON follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- follow_requests: both parties can see + delete; requester inserts
DROP POLICY IF EXISTS "follow_requests_select_involved" ON follow_requests;
CREATE POLICY "follow_requests_select_involved"
  ON follow_requests FOR SELECT
  USING (requester_id = auth.uid() OR target_id = auth.uid());

DROP POLICY IF EXISTS "follow_requests_insert_self" ON follow_requests;
CREATE POLICY "follow_requests_insert_self"
  ON follow_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "follow_requests_delete_involved" ON follow_requests;
CREATE POLICY "follow_requests_delete_involved"
  ON follow_requests FOR DELETE
  TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());

-- blocks: only blocker can see/manage
DROP POLICY IF EXISTS "blocks_all_self" ON blocks;
CREATE POLICY "blocks_all_self"
  ON blocks FOR ALL
  TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- notifications: user manages own
DROP POLICY IF EXISTS "notifications_select_self" ON notifications;
CREATE POLICY "notifications_select_self"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_self" ON notifications;
CREATE POLICY "notifications_update_self"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Extend existing RLS: accepted-follower visibility + mutual blocks ─

-- profiles: public OR self OR accepted follower; minus mutual blocks
DROP POLICY IF EXISTS "profiles_select_public_or_owner" ON profiles;
CREATE POLICY "profiles_select_public_or_owner"
  ON profiles FOR SELECT
  USING (
    (
      is_private = false
      OR id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = auth.uid() AND following_id = profiles.id
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = profiles.id AND blocked_id = auth.uid())
         OR (blocker_id = auth.uid() AND blocked_id = profiles.id)
    )
  );

-- user_media: same rule keyed off the owning user
DROP POLICY IF EXISTS "user_media_select_public_or_owner" ON user_media;
CREATE POLICY "user_media_select_public_or_owner"
  ON user_media FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_media.user_id
          AND (
            p.is_private = false
            OR EXISTS (
              SELECT 1 FROM follows
              WHERE follower_id = auth.uid() AND following_id = p.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = user_media.user_id AND blocked_id = auth.uid())
           OR (blocker_id = auth.uid() AND blocked_id = user_media.user_id)
      )
    )
  );

-- shelves: ditto
DROP POLICY IF EXISTS "shelves_select_public_or_owner" ON shelves;
CREATE POLICY "shelves_select_public_or_owner"
  ON shelves FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = shelves.user_id
          AND (
            p.is_private = false
            OR EXISTS (
              SELECT 1 FROM follows
              WHERE follower_id = auth.uid() AND following_id = p.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = shelves.user_id AND blocked_id = auth.uid())
           OR (blocker_id = auth.uid() AND blocked_id = shelves.user_id)
      )
    )
  );

-- shelf_items: via shelf
DROP POLICY IF EXISTS "shelf_items_select_public_or_owner" ON shelf_items;
CREATE POLICY "shelf_items_select_public_or_owner"
  ON shelf_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shelves s
      WHERE s.id = shelf_items.shelf_id
        AND (
          s.user_id = auth.uid()
          OR (
            EXISTS (
              SELECT 1 FROM profiles p
              WHERE p.id = s.user_id
                AND (
                  p.is_private = false
                  OR EXISTS (
                    SELECT 1 FROM follows
                    WHERE follower_id = auth.uid() AND following_id = p.id
                  )
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM blocks
              WHERE (blocker_id = s.user_id AND blocked_id = auth.uid())
                 OR (blocker_id = auth.uid() AND blocked_id = s.user_id)
            )
          )
        )
    )
  );

-- activity_log: same pattern
DROP POLICY IF EXISTS "activity_log_select_public_or_owner" ON activity_log;
CREATE POLICY "activity_log_select_public_or_owner"
  ON activity_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = activity_log.user_id
          AND (
            p.is_private = false
            OR EXISTS (
              SELECT 1 FROM follows
              WHERE follower_id = auth.uid() AND following_id = p.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = activity_log.user_id AND blocked_id = auth.uid())
           OR (blocker_id = auth.uid() AND blocked_id = activity_log.user_id)
      )
    )
  );

-- ─── Backfill counts from any existing data ───────────────────────────
UPDATE profiles p
SET followers_count = (SELECT count(*) FROM follows WHERE following_id = p.id),
    following_count = (SELECT count(*) FROM follows WHERE follower_id = p.id);
