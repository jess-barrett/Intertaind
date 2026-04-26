-- Phase 1 of the recommendation-lists rollout.
--
-- Adds the metadata fields needed to support the list types we ship to
-- users (curated, if-you-liked, genre, vibe, mood, cross-media), plus
-- per-item curator reasons. Adds list_likes + list_saves tables and
-- maintains denormalized counts on the parent list. Locks down all
-- list-related tables with RLS — they were wide open before.

-- 1. list_type enum
DO $$ BEGIN
  CREATE TYPE list_type AS ENUM (
    'curated',
    'if_you_liked',
    'genre',
    'vibe',
    'mood',
    'cross_media'
  );
EXCEPTION WHEN duplicate_object THEN
  -- already exists
END $$;

-- 2. Extend lists with metadata + saves count + source media + tags
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS list_type       list_type NOT NULL DEFAULT 'curated',
  ADD COLUMN IF NOT EXISTS source_media_id uuid REFERENCES media_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags            text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS saves_count     integer   NOT NULL DEFAULT 0;

-- 3. Per-item curator reason + creation timestamp
ALTER TABLE list_items
  ADD COLUMN IF NOT EXISTS reason     text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 4. list_likes — Letterboxd-style thumbs-up
CREATE TABLE IF NOT EXISTS list_likes (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

-- 5. list_saves — bookmark to revisit later, separate from likes
CREATE TABLE IF NOT EXISTS list_saves (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

-- 6. Triggers to keep lists.like_count + lists.saves_count denormalized.
-- Same pattern as `update_lists_count` from migration 003, but pointed
-- at the list aggregate instead of media_items.
CREATE OR REPLACE FUNCTION update_list_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists
    SET like_count = COALESCE(like_count, 0) + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists
    SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0)
    WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_likes_count_trigger ON list_likes;
CREATE TRIGGER list_likes_count_trigger
AFTER INSERT OR DELETE ON list_likes
FOR EACH ROW
EXECUTE FUNCTION update_list_likes_count();

CREATE OR REPLACE FUNCTION update_list_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists
    SET saves_count = COALESCE(saves_count, 0) + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists
    SET saves_count = GREATEST(COALESCE(saves_count, 0) - 1, 0)
    WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_saves_count_trigger ON list_saves;
CREATE TRIGGER list_saves_count_trigger
AFTER INSERT OR DELETE ON list_saves
FOR EACH ROW
EXECUTE FUNCTION update_list_saves_count();

-- 7. Trigger to bump lists.updated_at on any change
CREATE OR REPLACE FUNCTION lists_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lists_updated_at_trigger ON lists;
CREATE TRIGGER lists_updated_at_trigger
BEFORE UPDATE ON lists
FOR EACH ROW
EXECUTE FUNCTION lists_set_updated_at();

-- 8. Indexes — discovery filtering on public lists, FK lookups on items
CREATE INDEX IF NOT EXISTS lists_user_id_idx ON lists(user_id);
CREATE INDEX IF NOT EXISTS lists_list_type_public_idx
  ON lists(list_type)
  WHERE is_public = true;
CREATE INDEX IF NOT EXISTS lists_source_media_public_idx
  ON lists(source_media_id)
  WHERE is_public = true AND source_media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lists_tags_gin_idx
  ON lists USING gin(tags)
  WHERE is_public = true;
CREATE INDEX IF NOT EXISTS list_items_list_id_idx ON list_items(list_id);
CREATE INDEX IF NOT EXISTS list_items_media_id_idx ON list_items(media_id);

-- 9. RLS — lists were wide open before this migration. Lock down using
-- the same "public OR owner" pattern as profiles/shelves/etc.
ALTER TABLE lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_saves ENABLE ROW LEVEL SECURITY;

-- lists: visible if public or owned; mutable only by owner
DROP POLICY IF EXISTS "lists_select_public_or_owner" ON lists;
CREATE POLICY "lists_select_public_or_owner"
  ON lists FOR SELECT
  USING (is_public = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "lists_insert_owner" ON lists;
CREATE POLICY "lists_insert_owner"
  ON lists FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lists_update_owner" ON lists;
CREATE POLICY "lists_update_owner"
  ON lists FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lists_delete_owner" ON lists;
CREATE POLICY "lists_delete_owner"
  ON lists FOR DELETE
  USING (user_id = auth.uid());

-- list_items: visible iff parent list is visible, mutable iff owner
DROP POLICY IF EXISTS "list_items_select_visible_parent" ON list_items;
CREATE POLICY "list_items_select_visible_parent"
  ON list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_items.list_id
        AND (lists.is_public = true OR lists.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "list_items_mutate_owner" ON list_items;
CREATE POLICY "list_items_mutate_owner"
  ON list_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );

-- list_likes: anyone can see the public-list likes (drives counts);
-- inserts/deletes only for the acting user
DROP POLICY IF EXISTS "list_likes_select_visible_parent" ON list_likes;
CREATE POLICY "list_likes_select_visible_parent"
  ON list_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_likes.list_id
        AND (lists.is_public = true OR lists.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "list_likes_mutate_self" ON list_likes;
CREATE POLICY "list_likes_mutate_self"
  ON list_likes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- list_saves: same as likes
DROP POLICY IF EXISTS "list_saves_select_visible_parent" ON list_saves;
CREATE POLICY "list_saves_select_visible_parent"
  ON list_saves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_saves.list_id
        AND (lists.is_public = true OR lists.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "list_saves_mutate_self" ON list_saves;
CREATE POLICY "list_saves_mutate_self"
  ON list_saves FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 10. New activity_type values for the list lifecycle. Each ADD VALUE
-- must be its own statement and must not be referenced in the same
-- transaction it was added in (fine here — referencers are in TS code).
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'created_list';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'liked_list';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'saved_list';
