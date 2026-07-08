# `media-search` Edge Function

Cross-source media search. `POST {q, type?}` → `{ results: SearchResult[] }`.
This is the mobile analogue of web's `/api/search` route
(`apps/web/src/app/api/search/route.ts`), holding the external-API secrets
server-side so the mobile recommend picker (and future search UIs) can search via
`supabase.functions.invoke`.

## Why it exists

Web searches TMDB / Google Books / OpenLibrary / IGDB directly from a Node API
route using the secrets in `apps/web/.env.local`. Mobile can't — those secrets
must never ship in the bundle. So mobile calls this function, which holds the
secrets and returns a unified, normalized `SearchResult[]`.

Unlike `person` / `media-upsert`, **this function never touches the database.**
It's a pure read-through over external APIs, so it needs **no** service-role
client — only the external-API secrets + CORS.

## Request / response contract

`POST` with a JSON body (mobile's `supabase.functions.invoke`) **or** query
string:

```json
{ "q": "inception", "type": "all" }
```

| Field | Required | Notes |
|---|---|---|
| `q` | yes | Search query. **< 2 chars → `{ "results": [] }`** (not an error). |
| `type` | no | One of `all` \| `movie` \| `tv` \| `book` \| `game` (default `all`). The canonical `MediaType` values `tv_show` / `video_game` are also accepted. Unrecognized → **400**. |

Response: `200 { "results": SearchResult[] }`. On an unexpected error: **500**
`{ "error": "<message>" }` (no secret is ever included). The `SearchResult`
shape is byte-for-byte identical to `@intertaind/types` `SearchResult` and web's
normalizers.

### Sources and `external_ids` keys

`type=all` fans out to all four (results interleaved by a global relevance +
popularity score); a specific `type` hits only its source(s):

| `type` | Source(s) | `media_type` | `external_ids` keys |
|---|---|---|---|
| `movie` | TMDB `/search/movie` | `movie` | `tmdb_id` |
| `tv` | TMDB `/search/tv` | `tv_show` | `tmdb_id` |
| `book` | OpenLibrary (primary) → Google Books (fallback) | `book` | `openlibrary_work_id` + `isbn_13?` (OL) / `google_books_id` + `isbn_13?` (GB) |
| `game` | IGDB (via Twitch OAuth) | `video_game` | `igdb_id` |

These keys mirror web's `packages/media/src/normalize.ts` exactly, so a
`movie`/`tv` result carries `tmdb_id` — the key `media-upsert` dedups on
(`external_ids->>tmdb_id`).

## Environment / secrets

| Variable | Required | How it's provided |
|---|---|---|
| `TMDB_API_KEY` | for movie/tv | **Already set** project-wide from the `person` deploy. |
| `GOOGLE_BOOKS_API_KEY` | **optional** | Google Books allows keyless (rate-limited) requests; web sends `""` when absent. Set it to raise the rate limit, but books work without it (OpenLibrary is the primary book source and is keyless). |
| `TWITCH_CLIENT_ID` | for games | IGDB auth (Twitch `client_credentials`). |
| `TWITCH_CLIENT_SECRET` | for games | IGDB auth. |

**Graceful degradation:** a missing secret degrades **that source** to empty and
skips it — the whole search never 500s. So you can deploy with only
`TMDB_API_KEY` set (movie/tv/book all work — books via keyless OpenLibrary) and
add `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (games) later. A source that
throws (network / API error) is likewise skipped via `Promise.allSettled`.

Secrets are read from the function env and **never** returned to any client.
They must never go in `apps/mobile/.env` or a browser bundle.

### IGDB / Twitch token handling

`searchGames` ports web's flow: it POSTs `client_credentials` to
`id.twitch.tv/oauth2/token`, caches the returned token in a module-level
variable with its expiry (`expires_in - 60s`), reuses it across warm invocations
of the same isolate, and refetches when expired. IGDB is then queried with
`Authorization: Bearer <token>` + `Client-ID`.

## Deploy (human step — do NOT automate)

```
# TMDB_API_KEY is already set from the `person` function — only set it if rotated.

# Optional (raises the Google Books rate limit; books work keyless without it):
pnpm exec supabase secrets set GOOGLE_BOOKS_API_KEY=<value>

# For games (IGDB):
pnpm exec supabase secrets set TWITCH_CLIENT_ID=<value>
pnpm exec supabase secrets set TWITCH_CLIENT_SECRET=<value>

pnpm exec supabase functions deploy media-search
```

## Smoke test

```
curl -X POST "https://<project-ref>.functions.supabase.co/media-search" \
  -H "Content-Type: application/json" \
  -d '{ "q": "inception", "type": "all" }'
```

Expect `{ "results": [ … ] }` including the movie *Inception* (with
`external_ids: { "tmdb_id": 27205 }`). A `type: "movie"` request returns only
movies; `type: "game"` requires the Twitch secrets (returns `[]` if unset). A
query under 2 characters returns `{ "results": [] }`.

## Ported vs. simplified relative to web

`_shared/search.ts` ports web's `/api/search` pipeline + the source clients +
`packages/media` normalization. Movie / TV / games / OpenLibrary book search are
ported verbatim (same field mappings, ranking weights, filters). The book path
ports web's OL-primary + Google-Books-fallback structure and its quality
filters / dedup faithfully, **minus** three web-only pieces that depend on
infrastructure this function deliberately lacks:

1. **Reissue → OpenLibrary canonical-cover swap** — web makes a second OL call
   per Google Books reissue winner to substitute the original cover/title.
   Dropped: cosmetic-only, adds N extra network calls, and the un-swapped GB
   record is already a correct `SearchResult`.
2. **`applyStoredCoverOverrides`** — web re-reads `media_items` to swap in a
   stored cover. This function has **no** Supabase client by design, so it's
   omitted; a stored-cover pass can be layered on by the caller later.
3. **Verbose `console.log` search tracing** — dropped as debug noise.

All three are cosmetic / infra-dependent and don't change which items match or
their `external_ids` — no source is silently dropped.
