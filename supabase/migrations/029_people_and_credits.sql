-- People + their credits — the persisted, anon-readable backing for the
-- person/filmography page (web + mobile). Populated EXCLUSIVELY by the
-- `person` Edge Function (the only holder of TMDB_API_KEY); everything
-- here is READ by anon clients via RLS. Mirrors what web previously
-- fetched live from TMDB (/person/{id} + /person/{id}/combined_credits).
--
-- See docs/plans/2026-07-07-person-filmography.md.

-- One row per TMDB person. `tmdb_id` is the natural key the cast blobs
-- (media_items.metadata.cast[].tmdb_id) already reference.
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL UNIQUE,
  name text NOT NULL,
  biography text,
  birthday date,
  deathday date,
  place_of_birth text,
  profile_path text,
  popularity numeric,
  known_for_department text,
  -- Staleness marker: the Edge Function re-enriches when this is older
  -- than its freshness window (30d). NOT NULL so "exists but never
  -- enriched" is impossible.
  enriched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per raw TMDB credit (cast OR crew). A person's full filmography
-- includes titles NOT in our catalog, so we denormalize enough to render
-- every card (title/poster/date/genres/votes) and link to media_items
-- only when we have that title (media_item_id).
CREATE TABLE person_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_tmdb_id integer NOT NULL REFERENCES people (tmdb_id) ON DELETE CASCADE,
  media_tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title text NOT NULL,
  release_date date,
  poster_path text,
  overview text,
  -- cast fields
  character text,
  billing_order integer,
  -- crew fields
  job text,
  department text,
  credit_type text NOT NULL CHECK (credit_type IN ('cast', 'crew')),
  vote_average numeric NOT NULL DEFAULT 0,
  vote_count integer NOT NULL DEFAULT 0,
  genre_ids integer[] NOT NULL DEFAULT '{}',
  -- Link to our catalog row when the title exists (by external tmdb id);
  -- null for filmography titles we don't carry.
  media_item_id uuid REFERENCES media_items (id) ON DELETE SET NULL,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  -- A person can hold multiple credits on one title (two cast roles, or
  -- cast + crew). Dedupe per (person, title, type, credit_type, job) so a
  -- re-enrichment UPSERTs rather than duplicates. `job` is '' for cast
  -- rows (NULLs don't dedupe in a UNIQUE constraint), see the Edge Fn.
  UNIQUE (person_tmdb_id, media_tmdb_id, media_type, credit_type, job)
);

CREATE INDEX person_credits_person_idx ON person_credits (person_tmdb_id);
CREATE INDEX person_credits_media_item_idx ON person_credits (media_item_id);

-- RLS: public catalog data — anon may READ; only the service role (the
-- Edge Function) writes. No INSERT/UPDATE/DELETE policy for anon/auth, so
-- writes are limited to the service-role key (which bypasses RLS).
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_select_all ON people
  FOR SELECT USING (true);
CREATE POLICY person_credits_select_all ON person_credits
  FOR SELECT USING (true);

-- updated_at maintenance — per-table trigger fn, matching the existing
-- convention (migrations 016 `lists_set_updated_at` / 022
-- `list_comments_set_updated_at`); there is no shared one to reuse.
CREATE OR REPLACE FUNCTION people_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS people_updated_at_trigger ON people;
CREATE TRIGGER people_updated_at_trigger
  BEFORE UPDATE ON people
  FOR EACH ROW
  EXECUTE FUNCTION people_set_updated_at();
