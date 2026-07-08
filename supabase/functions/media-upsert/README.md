# `media-upsert` Edge Function

Get-or-create a catalog `media_items` row (movie / TV / **book** / **video
game**), returning its `id`. This is the mobile analogue of web's
`upsertMediaItem` server action (`apps/web/src/app/actions/media.ts`).

## Why it exists

Two mobile flows need to turn an uncataloged title into a `media_items.id`:

- **Filmography cards** can surface a TMDB movie/tv title that isn't in our
  catalog yet — tap it, get-or-create the row, route to `/media/<id>`.
- **The recommend picker** searches via `media-search`, the user picks a
  `SearchResult` of **any** type, and we need its `media_items.id` for the
  recommendations FK. Books/games have no `tmdb_id`, and anon clients can't
  `INSERT` into `media_items` (RLS) — so this service-role function creates it.

Mobile can't run a Next.js Node server action (server secrets can't ship in the
bundle — `TMDB_API_KEY` lives only in Edge Functions), so it calls this
function instead of web's action.

The mobile detail page reads the catalog row directly and does **not** lazily
enrich (web's detail page calls `ensureMediaItemEnriched`; mobile has no such
path), so movie/tv rows are enriched **upfront** — a new row arrives with cast,
crew, genres, director/creator, tagline, runtime/seasons, networks/studios,
release dates, and alternative titles already populated.

## What it does

The body accepts **either** of two shapes:

### Shape 1 — `{ media_type, tmdb_id }` (the filmography card)

- Read from a JSON body (`{ "media_type": "movie", "tmdb_id": 27205 }`) or the
  query string (`?media_type=movie&tmdb_id=27205`).
- `media_type` must be `movie` or `tv`. `book` / `video_game` **400** here (they
  have no `tmdb_id` — send them via shape 2). `tmdb_id` must be a positive
  integer.
- **Dedup** by `external_ids->>tmdb_id` scoped to the catalog `media_type`
  (`movie` / `tv_show`; TMDB's `tv` → our `tv_show`). If found, returns
  `{ "id" }` immediately **without re-enriching** — fast tap-to-open matters
  more than freshness here.
- **New title:** fetches TMDB details (+ credits, release_dates,
  alternative_titles, keywords) and the best backdrop from `/images`, builds the
  enriched `metadata` blob, and inserts. On `23505` (a concurrent request raced
  the dedup) it re-reads and returns the winner's id (idempotent).

### Shape 2 — `{ searchResult }` (the recommend picker)

`searchResult` is a full `media-search` `SearchResult` (the shape in
`supabase/functions/_shared/search.ts` / `packages/types`). Handles **all four**
media types.

- **Validation:** the `searchResult` must have a valid `media_type`, a non-empty
  `title`, and at least one recognized external id (`tmdb_id` / `isbn_13` /
  `google_books_id` / `openlibrary_work_id` / `igdb_id`) — otherwise **400**.
- **Dedup by ANY external id:** for each recognized id the result carries, it
  looks up `media_items` where `external_ids->><key>` matches, scoped to the
  matching `media_type` (mirrors web's `upsertMediaItem`, so a row catalogued
  under one identifier — e.g. `google_books_id` — still matches a result
  surfaced under another — e.g. `isbn_13`). First match → returns `{ "id" }`.
- **New, movie/tv** (result carries `external_ids.tmdb_id`): routed through the
  **same** TMDB enrichment path as shape 1, so the detail page is fully
  populated.
- **New, book/video_game:** a **minimal insert** from the `SearchResult` as-is —
  `{ media_type, title, description, cover_image_url, backdrop_url,
  release_date, metadata: searchResult.metadata ?? {}, external_ids }`. On
  `23505` it re-dedups and returns the winner (idempotent).

  > **Scope cut (deliberate):** the book/game path does **NOT** re-enrich from
  > OpenLibrary / Google Books / IGDB the way web's `upsertMediaItem` does
  > (canonical-edition swap, cross-reference id backfill, series detection, IGDB
  > company re-normalization). The search result's title / cover / description /
  > metadata is enough for a recommendation pairing + a basic detail page; full
  > book/game enrichment is a follow-up (it needs the OL/GB/IGDB clients ported
  > into Deno, which `media-search` has but this function deliberately doesn't
  > import).

### Both shapes

Return `{ "id": "<uuid>" }`. TMDB 404 → **404**. A body matching neither shape →
**400**. Other failures → **500** `{ "error" }` (the TMDB key is never leaked).

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

The `{ searchResult }` path is **new** — after pulling these changes the
function must be **redeployed** for the recommend picker to work:

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

### `searchResult` path (the recommend picker)

A **book** (minimal insert, no re-enrichment):

```
curl -X POST "https://<project-ref>.functions.supabase.co/media-upsert" \
  -H "Content-Type: application/json" \
  -d '{ "searchResult": {
        "media_type": "book",
        "title": "Mistborn: The Final Empire",
        "description": "…",
        "cover_image_url": "https://…",
        "backdrop_url": null,
        "release_date": "2006-07-17",
        "metadata": { "authors": ["Brandon Sanderson"], "page_count": 541 },
        "external_ids": { "google_books_id": "abc123", "isbn_13": "9780765311788" }
      } }'
```

Expect `{ "id" }`; the row is inserted with exactly the passed title / cover /
description / metadata / external_ids (no OL/GB re-enrichment). A **movie/tv**
`searchResult` (carries `external_ids.tmdb_id`) is routed through the full TMDB
enrichment above — the resulting row has cast/crew/genres etc. populated. Dedup
matches on **any** external id, so a later result surfaced under a different id
(e.g. `isbn_13` vs `google_books_id`) resolves to the same row.

## Follow-ups

- **Book/game enrichment.** The `searchResult` book/game path is a minimal
  insert (see the scope cut above). Full enrichment — canonical-edition swap,
  cross-reference id backfill, series detection, IGDB re-normalization — is
  deferred; it needs the OL/GB/IGDB clients ported into Deno.
