-- The `recommendations` table (migration 023) introduced a new activity
-- type emitted by createRecommendation: 'recommended'. The activity_type
-- enum was never bumped, so those inserts fail the CHECK and the action's
-- best-effort insert silently swallows the error — recs never appear in
-- the activity feed.
--
-- Same pattern as migrations 010, 011, 016: each ADD VALUE must be its
-- own statement and can't be referenced in the same transaction it's
-- added in (fine — references are in TS code).

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'recommended';
