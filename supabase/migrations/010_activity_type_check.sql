-- The activity_log.activity_type column is an ENUM, not a free-text column,
-- so the new values we emit (favorited, removed, status_changed,
-- logged_episode, logged_season, added_to_top, removed_from_top) get
-- rejected. The activity_log inserts don't surface their errors, so those
-- activities silently never appear in the feed.
--
-- Each ALTER TYPE ... ADD VALUE must be its own statement in Postgres (the
-- value can't be referenced in the same transaction it was added in).

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'status_changed';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'favorited';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'removed';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'logged_episode';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'logged_season';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'added_to_top';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'removed_from_top';
