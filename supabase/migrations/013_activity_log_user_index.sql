-- Composite index for the activity feed's primary query pattern:
--   WHERE user_id = $1 ORDER BY created_at DESC LIMIT N OFFSET M
-- Without this, the planner falls back to scanning the user_id index and
-- sorting in memory, which gets painful as the table grows. The DESC on
-- created_at matches the query's order so the index is walked directly.
--
-- Also speeds up the paginated COUNT(*) the /activity page runs to render
-- numbered page links — Postgres can satisfy it from the index alone.

CREATE INDEX IF NOT EXISTS activity_log_user_created_idx
  ON activity_log (user_id, created_at DESC);
