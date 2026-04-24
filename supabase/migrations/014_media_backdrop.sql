-- Backdrop images for the cinematic hero on /media/[id]. Sourced from
-- TMDb (backdrop_path) for movies + TV and from IGDB (artworks /
-- screenshots) for games. Books stay null — Google Books doesn't
-- publish landscape art.

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS backdrop_url TEXT;
