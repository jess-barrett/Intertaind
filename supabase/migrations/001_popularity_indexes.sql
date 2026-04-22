-- Indexes for fast genre landing pages + shelf filtering.
-- Run these in the Supabase SQL editor.

-- Fast "popular by type" queries (main landing sort)
CREATE INDEX IF NOT EXISTS idx_media_items_type_tracking
  ON media_items(media_type, tracking_count DESC);

-- JSONB GIN indexes for genre/category filtering
CREATE INDEX IF NOT EXISTS idx_media_items_genres
  ON media_items USING GIN ((metadata -> 'genres'));
CREATE INDEX IF NOT EXISTS idx_media_items_categories
  ON media_items USING GIN ((metadata -> 'categories'));
CREATE INDEX IF NOT EXISTS idx_media_items_platforms
  ON media_items USING GIN ((metadata -> 'platforms'));

-- Decade filter / release date sort
CREATE INDEX IF NOT EXISTS idx_media_items_release_date
  ON media_items(release_date) WHERE release_date IS NOT NULL;

-- Rating sort
CREATE INDEX IF NOT EXISTS idx_media_items_rating
  ON media_items(avg_rating DESC NULLS LAST);

-- Time-window popularity queries (this week/month/year)
CREATE INDEX IF NOT EXISTS idx_user_media_created_media
  ON user_media(created_at DESC, media_id);

-- User shelf filter by media_type + status (via join)
CREATE INDEX IF NOT EXISTS idx_user_media_user_status
  ON user_media(user_id, status);

-- ===== Phase B (enable when traffic justifies it) =====
-- Materialized view with precomputed popularity windows.
-- Refresh hourly via pg_cron or Supabase scheduled function.
--
-- CREATE MATERIALIZED VIEW IF NOT EXISTS media_popularity_windows AS
-- SELECT
--   m.id AS media_id,
--   m.media_type,
--   m.tracking_count AS all_time,
--   COUNT(um.id) FILTER (WHERE um.created_at >= NOW() - INTERVAL '7 days') AS week,
--   COUNT(um.id) FILTER (WHERE um.created_at >= NOW() - INTERVAL '30 days') AS month,
--   COUNT(um.id) FILTER (WHERE um.created_at >= NOW() - INTERVAL '365 days') AS year,
--   m.avg_rating,
--   m.release_date
-- FROM media_items m
-- LEFT JOIN user_media um ON m.id = um.media_id
-- GROUP BY m.id;
--
-- CREATE UNIQUE INDEX ON media_popularity_windows(media_id);
-- CREATE INDEX ON media_popularity_windows(media_type, week DESC);
-- CREATE INDEX ON media_popularity_windows(media_type, month DESC);
-- CREATE INDEX ON media_popularity_windows(media_type, year DESC);
-- CREATE INDEX ON media_popularity_windows(media_type, all_time DESC);
