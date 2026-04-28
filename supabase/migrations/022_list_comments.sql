-- Comments on lists. Linear (no threading) for v1 — flat chronological
-- order, list-owner can delete any comment, comment author can delete
-- or edit their own.

CREATE TABLE IF NOT EXISTS list_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS list_comments_list_id_created_idx
  ON list_comments(list_id, created_at DESC);

-- Denormalized count on the parent list, same pattern as like_count.
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_list_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists
    SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists
    SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_comments_count_trigger ON list_comments;
CREATE TRIGGER list_comments_count_trigger
AFTER INSERT OR DELETE ON list_comments
FOR EACH ROW
EXECUTE FUNCTION update_list_comments_count();

-- updated_at touch on update — keeps the column in sync with body
-- edits without callers having to remember to set it.
CREATE OR REPLACE FUNCTION list_comments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS list_comments_updated_at_trigger ON list_comments;
CREATE TRIGGER list_comments_updated_at_trigger
BEFORE UPDATE ON list_comments
FOR EACH ROW
EXECUTE FUNCTION list_comments_set_updated_at();

-- RLS — comments mirror their parent list's visibility, plus the
-- usual self-only / list-owner-can-moderate write rules.
ALTER TABLE list_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_comments_select_visible_parent" ON list_comments;
CREATE POLICY "list_comments_select_visible_parent"
  ON list_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_comments.list_id
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

-- INSERT: comment author must be the auth'd user, AND the parent list
-- must currently be visible to them. Stops a stale client from posting
-- to a list that's been switched private since they loaded it.
DROP POLICY IF EXISTS "list_comments_insert_self" ON list_comments;
CREATE POLICY "list_comments_insert_self"
  ON list_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_comments.list_id
        AND (
          lists.visibility IN ('public', 'unlisted')
          OR (
            lists.visibility = 'friends_unlisted'
            AND user_follows_user(lists.user_id, auth.uid())
          )
          OR lists.user_id = auth.uid()
        )
    )
  );

-- UPDATE: only the comment author can edit their own body.
DROP POLICY IF EXISTS "list_comments_update_self" ON list_comments;
CREATE POLICY "list_comments_update_self"
  ON list_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: comment author OR the list owner (so curators can moderate
-- their own thread without needing admin).
DROP POLICY IF EXISTS "list_comments_delete_self_or_list_owner" ON list_comments;
CREATE POLICY "list_comments_delete_self_or_list_owner"
  ON list_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_comments.list_id
        AND lists.user_id = auth.uid()
    )
  );
