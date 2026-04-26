-- Adds the featured-lists primitive and two RPC helpers used by the
-- /lists discovery page:
--   * popular_lists_in_window — top lists by likes received in a window
--     (used for "Popular this week"). Window is parameterized so the
--     section can later switch between weekly / monthly / etc.
--   * recently_liked_lists — lists ordered by latest like timestamp
--     (used for "Recently liked").
--
-- Both RPCs run with the caller's RLS, so likes on lists the viewer
-- can't see are filtered before counting.

-- 1. Featured flag — toggled manually for now (no admin UI yet). Set
-- TRUE on a list to surface it in the "Featured Lists" section.
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

-- Partial index keeps the featured-list scan a few-row sequential read
-- regardless of the parent table's growth.
CREATE INDEX IF NOT EXISTS lists_featured_idx
  ON lists(like_count DESC)
  WHERE visibility = 'public' AND featured = true;

-- 2. RPC: lists with the most likes received in a given time window.
-- Returns list_id + recent_likes count, ordered desc. Caller then
-- fetches the actual rows from `lists` (which respects RLS).
CREATE OR REPLACE FUNCTION popular_lists_in_window(
  window_start timestamptz,
  lim integer DEFAULT 10
)
RETURNS TABLE (list_id uuid, recent_likes bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT list_id, COUNT(*) AS recent_likes
  FROM list_likes
  WHERE created_at >= window_start
  GROUP BY list_id
  ORDER BY recent_likes DESC
  LIMIT lim;
$$;

-- 3. RPC: lists ordered by their most recent like (any time).
CREATE OR REPLACE FUNCTION recently_liked_lists(lim integer DEFAULT 10)
RETURNS TABLE (list_id uuid, last_liked timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT list_id, MAX(created_at) AS last_liked
  FROM list_likes
  GROUP BY list_id
  ORDER BY last_liked DESC
  LIMIT lim;
$$;
