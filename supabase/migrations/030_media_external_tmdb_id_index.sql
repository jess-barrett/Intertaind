-- Expression index for tmdb_id lookups on media_items.
--
-- Several hot paths match catalog rows by their external TMDB id:
--   supabase.from("media_items").select(...).in("external_ids->>tmdb_id", […])
-- — the web person page, the `person` Edge Function's credit→media linkage
-- (migration 029), and the media-card upsert flow. Migration 015's GIN
-- index on the whole `external_ids` JSONB supports containment (`@>`) but
-- NOT the `->>` text-extraction operator PostgREST emits for that filter,
-- so those lookups seq-scan `media_items` — fine today, untenable as the
-- catalog grows toward the target scale. A btree index on the extracted
-- text expression serves the `IN (text[])` filter directly.
CREATE INDEX IF NOT EXISTS media_items_external_tmdb_id_idx
  ON media_items ((external_ids ->> 'tmdb_id'));
