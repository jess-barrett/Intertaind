-- Add the 'started_reading' activity type so the BookModal can log a
-- distinct activity row when a user moves a book onto the Currently Reading
-- shelf (with current_page metadata) instead of falling back to the generic
-- "added to shelf" / "reviewed" path.

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'started_reading';
