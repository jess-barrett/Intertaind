# `media-upsert` Edge Function

Get-or-create a catalog `media_items` row for a TMDB **movie / TV** title,
enriching it upfront. This is the mobile analogue of web's `upsertMediaItem`
server action (`apps/web/src/app/actions/media.ts`), scoped to the movie/tv
path.

## Why it exists

Mobile filmography cards can surface a TMDB title that isn't in our catalog yet.
Web handles that click with the `upsertMediaItem` server action; mobile can't
run a Next.js Node server action (server secrets can't ship in the bundle —
`TMDB_API_KEY` lives only in Edge Functions). So mobile calls this function when
an uncataloged card is tapped, then routes to `/media/<id>` with the returned
id.

The mobile detail page reads the catalog row directly and does **not** lazily
enrich (web's detail page calls `ensureMediaItemEnriched`; mobile has no such
path), so this function enriches **upfront** — a new row arrives with cast,
crew, genres, director/creator, tagline, runtime/seasons, networks/studios,
release dates, and alternative titles already populated.

## What it does

1. Reads `media_type` + `tmdb_id` from a JSON body
   (`{ "media_type": "movie", "tmdb_id": 27205 }`) or the query string
   (`?media_type=movie&tmdb_id=27205`). Mobile invokes via
   `supabase.functions.invoke("media-upsert", { body: {…} })`, which POSTs JSON.
   - `media_type` must be `movie` or `tv`. `book` / `video_game` return **400**
     `{ "error": "media-upsert currently supports movie/tv only" }` — a
     documented follow-up (those need IGDB / Google Books / OpenLibrary
     enrichment paths not reimplemented here; filmography is always movie/tv).
   - `tmdb_id` must be a positive integer (400 otherwise).
2. **Dedup:** looks up `media_items` where `external_ids->>tmdb_id` matches and
   `media_type` is `movie` / `tv_show` (TMDB's `tv` → our catalog's `tv_show`).
   If found, returns `{ "id" }` immediately **without re-enriching** — fast
   tap-to-open matters more than freshness here.
3. **New title:** fetches TMDB details (+ credits, release_dates,
   alternative_titles, keywords) and the best backdrop from `/images`, builds
   the enriched `metadata` blob, and inserts a `media_items` row. On a
   unique-violation (`23505`) — a concurrent request raced the dedup — it
   re-reads and returns the winner's id (idempotent).
4. Returns `{ "id": "<uuid>" }`. TMDB 404 → **404**. Other failures → **500**
   `{ "error" }` (the TMDB key is never leaked).

Writes use the **service-role key**, which bypasses RLS on the globally-shared
`media_items` catalog. `TMDB_API_KEY` is read from the function env and is
**never** returned to any client.

> **Known duplication (follow-up):** `index.ts` re-implements web's
> `enrichTMDBMetadata` + `fetchBestTMDBBackdrop` in Deno. The metadata field
> names are kept in lockstep with web BY HAND. The durable fix is to extract a
> runtime-agnostic TMDB-enrichment module shared by web + this function so the
> two can't drift — see the header comment in `index.ts`.

## Environment / secrets

| Variable | How it's provided |
|---|---|
| `SUPABASE_URL` | Auto-injected into deployed functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected into deployed functions. |
| `TMDB_API_KEY` | Already set from the `person` function's deploy. |

`TMDB_API_KEY` is a **project-wide** function secret (`supabase secrets set`),
so it's already present from deploying the `person` function — no need to set it
again unless it's been rotated. It must **never** go in any client `.env`
(`apps/mobile/.env` or a browser bundle).

## Deploy (human step — do NOT automate)

```
# Only if TMDB_API_KEY is not already set (it is, from the `person` function):
pnpm exec supabase secrets set TMDB_API_KEY=<value>

pnpm exec supabase functions deploy media-upsert
```

## Smoke test

Create + enrich Inception (TMDB movie id 27205):

```
curl -X POST "https://<project-ref>.functions.supabase.co/media-upsert" \
  -H "Content-Type: application/json" \
  -d '{ "media_type": "movie", "tmdb_id": 27205 }'
```

Expect `{ "id": "<uuid>" }`. Then verify the row was created with populated
metadata (cast, genres, key_crew, director, tagline, …):

```sql
select id, media_type, title, release_date,
       metadata->'cast'      as cast,
       metadata->'genres'    as genres,
       metadata->>'director' as director,
       metadata->>'tagline'  as tagline,
       backdrop_url
from media_items
where external_ids->>'tmdb_id' = '27205'
  and media_type = 'movie';
```

A second identical call should return the **same** id without re-enriching. A TV
smoke test: `{ "media_type": "tv", "tmdb_id": 1399 }` (Game of Thrones) →
`{ "id" }`, and the row's `metadata` carries `season_details`, `creator`,
`networks`, etc.

## Not yet supported

`book` and `video_game` return a 400 — see step 1. Mobile's only uncataloged
cards today are filmography titles (always TMDB movies/tv), so games/books
aren't needed yet.
