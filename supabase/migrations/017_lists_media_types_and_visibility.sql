-- Phase 1.5 of the lists rollout.
--
-- Two structural changes:
-- 1. `media_types[]` — what media a list spans (movies/TV/books/games).
--    Multi-select on the create form, drives discovery filters later.
-- 2. `visibility` enum replacing the binary `is_public` boolean. Adds
--    "unlisted" (URL-only) and "friends_unlisted" (URL-only, viewable
--    only by people the owner follows). RLS and indexes follow.

-- 1. media_types column — Postgres array of the existing media_type enum
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS media_types media_type[] NOT NULL DEFAULT '{}';

-- 2. list_visibility enum
DO $$ BEGIN
  CREATE TYPE list_visibility AS ENUM (
    'public',
    'unlisted',
    'friends_unlisted',
    'private'
  );
EXCEPTION WHEN duplicate_object THEN
  -- already exists
END $$;

-- 3. visibility column with backfill from the soon-to-be-removed
-- `is_public` boolean
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS visibility list_visibility NOT NULL DEFAULT 'public';

-- The CASE expression's branches are typed as plain `text`, so we cast
-- the whole expression to `list_visibility` — Postgres won't infer the
-- enum coercion on its own.
UPDATE lists
SET visibility =
  (CASE WHEN is_public THEN 'public' ELSE 'private' END)::list_visibility;

-- 4. Drop every policy that references `is_public` — both the ones we
-- created in migration 016 and the original "Public lists are readable"
-- policies from the table's first migration. They all get rebuilt in
-- step 9 against `visibility`. This must happen BEFORE the column drop:
-- Postgres refuses to drop a column with dependent policies.
DROP POLICY IF EXISTS "Public lists are readable" ON lists;
DROP POLICY IF EXISTS "Public list items are readable" ON list_items;
DROP POLICY IF EXISTS "lists_select_public_or_owner" ON lists;
DROP POLICY IF EXISTS "list_items_select_visible_parent" ON list_items;
DROP POLICY IF EXISTS "list_likes_select_visible_parent" ON list_likes;
DROP POLICY IF EXISTS "list_saves_select_visible_parent" ON list_saves;

-- 5. Drop indexes that referenced is_public so we can drop the column
DROP INDEX IF EXISTS lists_list_type_public_idx;
DROP INDEX IF EXISTS lists_source_media_public_idx;
DROP INDEX IF EXISTS lists_tags_gin_idx;

-- 6. Drop is_public — fully replaced by visibility
ALTER TABLE lists DROP COLUMN IF EXISTS is_public;

-- 7. Recreate the partial indexes against `visibility = 'public'`
CREATE INDEX IF NOT EXISTS lists_list_type_public_idx
  ON lists(list_type)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS lists_source_media_public_idx
  ON lists(source_media_id)
  WHERE visibility = 'public' AND source_media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lists_tags_gin_idx
  ON lists USING gin(tags)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS lists_media_types_gin_idx
  ON lists USING gin(media_types)
  WHERE visibility = 'public';

-- 8. SECURITY DEFINER helper for the friends_unlisted visibility check.
-- Lets the lists RLS policy probe the follows table without recursing
-- into the follows table's own RLS (which migration 008 cited as a
-- footgun).
CREATE OR REPLACE FUNCTION user_follows_user(follower uuid, target uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = follower
      AND following_id = target
  );
$$;

-- 9. RLS — replace the is_public-based policies with visibility-based.
-- "unlisted" lists are SELECTable by anyone (they need the URL to find
-- it anyway; discovery queries filter on `visibility = 'public'`).
-- "friends_unlisted" requires `user_follows_user(owner, viewer)`.
-- "private" remains owner-only.

DROP POLICY IF EXISTS "lists_select_public_or_owner" ON lists;
DROP POLICY IF EXISTS "lists_select_visibility" ON lists;
CREATE POLICY "lists_select_visibility"
  ON lists FOR SELECT
  USING (
    visibility IN ('public', 'unlisted')
    OR (
      visibility = 'friends_unlisted'
      AND auth.uid() IS NOT NULL
      AND user_follows_user(lists.user_id, auth.uid())
    )
    OR user_id = auth.uid()
  );

-- list_items: visible iff parent list is visible per the new rules.
DROP POLICY IF EXISTS "list_items_select_visible_parent" ON list_items;
CREATE POLICY "list_items_select_visible_parent"
  ON list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_items.list_id
        AND (
          lists.visibility IN ('public', 'unlisted')
          OR (
            lists.visibility = 'friends_unlisted'
            AND auth.uid() IS NOT NULL
            AND user_follows_user(lists.user_id, auth.uid())
          )
          OR lists.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "list_likes_select_visible_parent" ON list_likes;
CREATE POLICY "list_likes_select_visible_parent"
  ON list_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_likes.list_id
        AND (
          lists.visibility IN ('public', 'unlisted')
          OR (
            lists.visibility = 'friends_unlisted'
            AND auth.uid() IS NOT NULL
            AND user_follows_user(lists.user_id, auth.uid())
          )
          OR lists.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "list_saves_select_visible_parent" ON list_saves;
CREATE POLICY "list_saves_select_visible_parent"
  ON list_saves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_saves.list_id
        AND (
          lists.visibility IN ('public', 'unlisted')
          OR (
            lists.visibility = 'friends_unlisted'
            AND auth.uid() IS NOT NULL
            AND user_follows_user(lists.user_id, auth.uid())
          )
          OR lists.user_id = auth.uid()
        )
    )
  );
