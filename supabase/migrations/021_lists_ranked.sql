-- Lists can be marked as ranked — a single boolean. When true, the
-- detail page shows item position+1 as a numbered badge below each
-- card and disables sort controls (the position is the order, by
-- definition). Filters still work; they just preserve original ranks.

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS ranked boolean NOT NULL DEFAULT false;
