# `person` Edge Function

Get-or-enrich for people and their filmographies. This is the project's first
Supabase Edge Function and the **only** component that holds `TMDB_API_KEY`.

## What it does

Given a TMDB person id, it ensures our Supabase `people` and `person_credits`
tables hold fresh data, so anon clients (web + mobile) can then READ those
tables directly.

1. Reads `tmdb_id` from the query string (`?tmdb_id=`) or a JSON body
   (`{ "tmdb_id": 287 }`). Mobile calls it via `supabase.functions.invoke`,
   which POSTs a JSON body; web can use the query string. Must be a positive
   integer (400 otherwise).
2. If a `people` row already exists and was enriched within the last **30
   days**, it returns `{ ok: true, enriched: false }` and does NOT call TMDB —
   the client just reads the tables.
3. Otherwise it fetches `/person/{id}` and `/person/{id}/combined_credits`
   from TMDB (Bearer auth with `TMDB_API_KEY`), upserts `people`, rebuilds
   `person_credits`, and returns `{ ok: true, enriched: true }`.

Writes use the **service-role key**, which bypasses RLS. The tables have
public SELECT and no write policy, so this function is their sole writer. The
`TMDB_API_KEY` lives only here and is **never** exposed to any client.

### Notable mapping decisions

- **`job=''` for cast rows** (empty string, not NULL). The UNIQUE key is
  `(person_tmdb_id, media_tmdb_id, media_type, credit_type, job)`; NULLs don't
  dedupe in a Postgres UNIQUE constraint, so cast rows must use `''` to avoid
  duplicating on every re-enrichment. Multiple cast entries for the same title
  (an actor in several roles) are collapsed to one row, keeping the lowest
  `order` (top billing).
- **`tv` → `tv_show`** for catalog linkage. A credit's `media_type` is TMDB's
  (`movie` / `tv`), but `media_items.media_type` uses `tv_show` for TV, so we
  map `tv` → `tv_show` when resolving `media_item_id`.
- **Empty date → null.** TMDB returns `""` for missing dates; a Postgres
  `date` column rejects `""`, so we coerce it to `null`.
- Non `movie`/`tv` combined-credit entries (e.g. `person`) are skipped.

## Environment / secrets

| Variable | How it's provided |
|---|---|
| `SUPABASE_URL` | Auto-injected into deployed functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected into deployed functions. |
| `TMDB_API_KEY` | **Must be set manually** (see below). |

`TMDB_API_KEY` must **never** be placed in any client `.env`
(`apps/web/.env.local` server-side is fine for the web app's own direct calls,
but this secret must never reach `apps/mobile/.env` or any browser bundle).

## Deploy (human step — do NOT automate)

```
pnpm exec supabase secrets set TMDB_API_KEY=<value>
pnpm exec supabase functions deploy person
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into
deployed functions, so only `TMDB_API_KEY` needs to be set.

## Smoke test

Enrich Brad Pitt (TMDB person id 287):

```
curl "https://<project-ref>.functions.supabase.co/person?tmdb_id=287"
```

Expect `{ "ok": true, "enriched": true }` on the first call and
`{ "ok": true, "enriched": false }` on a call within the next 30 days. Then
verify the tables populated:

```sql
select tmdb_id, name, enriched_at from people where tmdb_id = 287;
select count(*) from person_credits where person_tmdb_id = 287;
```
