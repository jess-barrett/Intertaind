# Person / Filmography Page (mobile) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build the mobile Person/Actor page (photo · bio · born/from · "X of Y watched" · filterable, sortable filmography grid), backed by a durable persist-to-DB architecture so person + credits data lives in Supabase and is read by anon clients — with the TMDB secret confined to a single Edge Function that populates the tables.

**Architecture:** Two new tables (`people`, `person_credits`) hold the enriched TMDB data. One Supabase **Edge Function** (`person`) is the sole holder of `TMDB_API_KEY`: on request it reads the tables and, if a person is missing or stale, fetches TMDB `/person/{id}` + `/person/{id}/combined_credits`, upserts both tables (linking `person_credits.media_item_id` to any existing `media_items` row by `external_ids->>tmdb_id`), then the client reads the rows via anon RLS. The portable merge/filter/sort logic moves to `@intertaind/media` so web and mobile share ONE implementation. Both apps read the tables; web migrates off its direct TMDB person calls to keep a single source of truth.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), `@intertaind/media` (shared TMDB types + pure logic, vitest), `@intertaind/supabase` (generated types), Expo/React Native + expo-router (shared route), NativeWind, TanStack Query, `@gorhom/bottom-sheet` (filter pickers).

---

## Pre-flight (do FIRST, before any task)

The working tree has an in-flight, already-reviewed batch (ratings histogram + migration 028 + regenerated types, game status pill/picker, smaller cast cards, stats-in-header, cast-as-default-tab). **Commit that batch before starting this feature** so person-page work lands on a clean base and the two are independently revertable.

```bash
git add -A
git commit -m "feat(mobile): ratings histogram (denormalized), game status pill+picker, cast/stats layout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(If Jess still wants to decide the game-picker "Clear status" behavior, that's a separate follow-up — it does not block this feature.)

---

## Milestone A — Database schema (`people` + `person_credits`)

> **USER STEP inside this milestone:** applying the migration to the linked Supabase project + `pnpm gen:types` (the CLI needs the linked project; Jess applies SQL via the dashboard, then regenerates types). Tasks A2/A3 are gated on that.

### Task A1: Write the migration

**Files:**
- Create: `supabase/migrations/029_people_and_credits.sql`

**Step 1: Write the migration**

```sql
-- People + their credits — the persisted, anon-readable backing for the
-- person/filmography page (web + mobile). Populated exclusively by the
-- `person` Edge Function (the only holder of TMDB_API_KEY); everything
-- here is READ by anon clients via RLS. Mirrors what web previously
-- fetched live from TMDB (/person/{id} + /person/{id}/combined_credits).

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
  -- than its freshness window (30d). NOT NULL so "never enriched" is
  -- impossible once a row exists.
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
  -- Link to our catalog row when the title exists (by external tmdb id).
  -- Null for filmography titles we don't carry.
  media_item_id uuid REFERENCES media_items (id) ON DELETE SET NULL,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  -- A person can hold multiple credits on one title (e.g. two cast roles,
  -- or cast + crew). Dedupe per (person, title, credit_type, job) so a
  -- re-enrichment UPSERTs rather than duplicates.
  UNIQUE (person_tmdb_id, media_tmdb_id, media_type, credit_type, job)
);

CREATE INDEX person_credits_person_idx ON person_credits (person_tmdb_id);
CREATE INDEX person_credits_media_item_idx ON person_credits (media_item_id);

-- RLS: public catalog data — anon may READ; only the service role (the
-- Edge Function) writes. No INSERT/UPDATE/DELETE policies for anon/auth.
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_select_all ON people
  FOR SELECT USING (true);
CREATE POLICY person_credits_select_all ON person_credits
  FOR SELECT USING (true);

-- Keep updated_at fresh (mirrors the pattern other tables use). If the
-- repo already has a shared moddatetime/updated_at trigger fn, reuse it
-- instead of redeclaring — check migrations 001-028 first.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS people_set_updated_at ON people;
CREATE TRIGGER people_set_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Step 2: Self-check the SQL** — read it against migrations 023/025/028 for style/CHECK/RLS conventions (service-role writes with no anon write policy is the pattern; confirm `gen_random_uuid()` is used elsewhere — it is). Confirm no existing `set_updated_at`/`moddatetime` collision; if one exists, drop the redefinition and reuse it.

**Step 3: Commit**

```bash
git add supabase/migrations/029_people_and_credits.sql
git commit -m "feat(db): people + person_credits tables (person page backing)"
```

### Task A2: USER applies the migration + regenerates types

**This is a Jess step** (the controller pauses and asks):
1. Apply `029_people_and_credits.sql` via the Supabase dashboard SQL editor (or `pnpm exec supabase db push` if linked).
2. `pnpm gen:types` (needs the linked project; on a fresh Mac, `pnpm exec supabase login` first, or `pnpm exec supabase gen types typescript --project-id utycocnevbtfravbmmmr > packages/supabase/src/database.types.ts`).

**Verify:** `grep -n "person_credits" packages/supabase/src/database.types.ts` shows the new tables. Commit the regenerated `database.types.ts`.

### Task A3: Verify types compile

Run `pnpm --filter @intertaind/supabase typecheck` (or root `pnpm typecheck`) — expect PASS with `people` / `person_credits` present in `Tables<>`.

---

## Milestone B — Shared filmography logic (`@intertaind/media`)

Move web's pure merge/filter/sort logic into the shared package so web + mobile use ONE copy. Pure functions (no React, no lucide) → this is the correct thing to share (unlike `tracking-config`, which mirrors because it carries lucide icons).

### Task B1: Add the shared filmography module (TDD)

**Files:**
- Create: `packages/media/src/filmography.ts`
- Create: `packages/media/src/filmography.test.ts`
- Modify: `packages/media/src/index.ts` (export `./filmography`)

**Step 1: Write failing tests** (`filmography.test.ts`) covering the tricky logic (mirrors `packages/types/src/progress.test.ts` style):

```ts
import { describe, it, expect } from "vitest";
import {
  mergeCredits, filterCredits, sortCredits, decadeToYearRange,
  genreNames, TMDB_GENRES, DECADES, FILMOGRAPHY_SORTS, type PersonCreditInput,
} from "./filmography";

const cast = (o: Partial<PersonCreditInput>): PersonCreditInput => ({
  media_tmdb_id: 1, media_type: "movie", title: "T", release_date: "2000-01-01",
  poster_path: null, overview: "", character: "C", billing_order: 0, job: null,
  department: null, credit_type: "cast", vote_average: 5, vote_count: 10,
  genre_ids: [], media_item_id: null, ...o,
});

describe("mergeCredits", () => {
  it("dedupes cast+crew of one title into a single card collecting roles", () => {
    const rows = [
      cast({ media_tmdb_id: 9, credit_type: "cast", character: "Hero" }),
      cast({ media_tmdb_id: 9, credit_type: "crew", job: "Director", character: null }),
    ];
    const merged = mergeCredits(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].roles.sort()).toEqual(["Actor", "Director"]);
    expect(merged[0].character).toBe("Hero");
  });
  it("keeps the lowest billing order across duplicate cast rows", () => {
    const rows = [
      cast({ media_tmdb_id: 9, billing_order: 5 }),
      cast({ media_tmdb_id: 9, billing_order: 2 }),
    ];
    expect(mergeCredits(rows)[0].order).toBe(2);
  });
  it("buckets crew jobs to coarse roles and drops unknown jobs", () => {
    const rows = [
      cast({ media_tmdb_id: 1, credit_type: "crew", job: "Screenplay", character: null }),
      cast({ media_tmdb_id: 2, credit_type: "crew", job: "Best Boy", character: null }),
    ];
    const merged = mergeCredits(rows);
    expect(merged.find((c) => c.id === 1)?.roles).toContain("Writer");
    expect(merged.find((c) => c.id === 2)).toBeUndefined(); // unknown job → no card
  });
});

describe("filterCredits", () => {
  const merged = mergeCredits([
    cast({ media_tmdb_id: 1, release_date: "2021-01-01", genre_ids: [28] }),
    cast({ media_tmdb_id: 2, media_type: "tv", release_date: "1965-01-01", genre_ids: [18] }),
  ]);
  it("filters by type", () => {
    expect(filterCredits(merged, { type: "tv" })).toHaveLength(1);
  });
  it("filters by decade including Pre-1970 (older)", () => {
    expect(filterCredits(merged, { decade: "older" }).map((c) => c.id)).toEqual([2]);
  });
  it("filters by resolved genre name", () => {
    expect(filterCredits(merged, { genre: "Action" }).map((c) => c.id)).toEqual([1]);
  });
});

describe("sortCredits", () => {
  it("popular sorts by vote_count desc", () => {
    const merged = mergeCredits([
      cast({ media_tmdb_id: 1, vote_count: 5 }),
      cast({ media_tmdb_id: 2, vote_count: 50 }),
    ]);
    expect(sortCredits(merged, "popular").map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("decadeToYearRange", () => {
  it("maps decades + older", () => {
    expect(decadeToYearRange("2010s")).toEqual([2010, 2019]);
    expect(decadeToYearRange("older")).toEqual([0, 1969]);
  });
});
```

**Step 2:** `pnpm --filter @intertaind/media test` → FAIL (module missing).

**Step 3: Implement `filmography.ts`.** Port verbatim from `apps/web/src/components/media/filmography-list.tsx` (lines 18-106, 294-400): `TMDB_GENRES`, `roleForJob`, `ROLE_PRIORITY`, `DECADES`, the `SORTS` array (export as `FILMOGRAPHY_SORTS`, keep `SortKey`), `mergeCredits`, `sortCredits`, `decadeToYearRange`. Two changes from the web original:
  - Input type is `PersonCreditInput` (the DB-row shape below), NOT `TMDBPersonCombinedCredits`. `mergeCredits(rows: PersonCreditInput[])` iterates rows: `credit_type === "cast"` → role "Actor" (+ character/billing_order); `credit_type === "crew"` → `roleForJob(job)`.
  - Extract the filter predicate into `filterCredits(merged, { role?, type?, decade?, genre? })` and add `genreNames(genre_ids)`.

```ts
/** The subset of a `person_credits` row the pure logic needs (structural —
 *  a Tables<'person_credits'> row satisfies it). Kept here so this package
 *  stays free of an @intertaind/supabase dependency. */
export interface PersonCreditInput {
  media_tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  release_date: string | null;
  poster_path: string | null;
  overview: string | null;
  character: string | null;
  billing_order: number | null;
  job: string | null;
  department: string | null;
  credit_type: "cast" | "crew";
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_item_id: string | null;
}

export interface MergedCredit {
  key: string; id: number; media_type: "movie" | "tv"; title: string;
  overview: string; year: number | null; release_date: string | null;
  poster_path: string | null; character: string; order?: number;
  vote_average: number; vote_count: number; genre_ids: number[];
  roles: string[]; media_item_id: string | null;
}
// ...mergeCredits / filterCredits / sortCredits / genreNames / decadeToYearRange,
// ROLE_PRIORITY, TMDB_GENRES, DECADES, FILMOGRAPHY_SORTS (ported)
```

**Step 4:** `pnpm --filter @intertaind/media test` → PASS. Then `pnpm --filter @intertaind/media typecheck`.

**Step 5: Commit** `feat(media): shared filmography merge/filter/sort logic`.

---

## Milestone C — The `person` Edge Function (get-or-enrich)

> **USER STEP:** deploying the function + setting `TMDB_API_KEY` on it. The function is the ONLY component with the secret; it must never be imported by the mobile bundle.

### Task C1: Scaffold the Edge Function

**Files:**
- Create: `supabase/functions/person/index.ts`
- Create: `supabase/functions/_shared/cors.ts` (shared CORS headers)
- Create: `supabase/functions/person/README.md` (deploy + secret steps)

**Behavior** (`GET /functions/v1/person?tmdb_id=123`, auth: anon JWT forwarded):
1. Parse `tmdb_id`; 400 if missing/non-numeric.
2. Create a Supabase client with the **service-role key** (`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, injected automatically) — needed to WRITE the tables under RLS.
3. Read `people` by `tmdb_id`. If present AND `enriched_at` within 30 days → skip enrichment.
4. Else fetch TMDB `/person/${id}` + `/person/${id}/combined_credits` with `Authorization: Bearer ${Deno.env.get("TMDB_API_KEY")}`. On TMDB 404 → return 404. Map to rows (reuse the field mapping from `apps/web/src/lib/api/tmdb.ts` getPersonDetails/combined_credits shapes; `@intertaind/media` TMDB types document them).
5. `upsert` `people` (onConflict `tmdb_id`), set `enriched_at = now()`.
6. Build `person_credits` rows from cast (credit_type 'cast', character, billing_order=order) + crew (credit_type 'crew', job, department) — movies/TV only. Resolve `media_item_id`: one batched `media_items` select `in ("external_ids->>tmdb_id", [...])` keyed by `${media_type}-${tmdb_id}`. `upsert` onConflict the table's UNIQUE tuple. Optionally delete stale credits for this person not in the new set (re-enrichment cleanup).
7. Respond `{ person, credits }` (or `204`-style "enriched, read tables now"). Simpler contract: **just enrich, return the person row**; the client reads credits from the table itself. Recommended: return `{ ok: true }` — the client always reads tables after (keeps the function a pure enrich trigger, one code path).

**Step: Commit** `feat(functions): person get-or-enrich Edge Function`.

### Task C2: Document + USER deploys

`supabase/functions/person/README.md` documents:
```bash
# One-time: set the secret on the project (NEVER in any .env shipped to clients)
pnpm exec supabase secrets set TMDB_API_KEY=<value>
# Deploy
pnpm exec supabase functions deploy person
```
Note `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into deployed functions. **Jess runs these.** Verify with a curl to `.../functions/v1/person?tmdb_id=287` (Brad Pitt) → 200, then check `people`/`person_credits` populated in the dashboard.

### Task C3: Update mobile AGENTS docs

Add to `apps/mobile/AGENTS.md` "Deferred items": Edge Functions are now LIVE (`supabase/functions/person`); document the get-or-enrich pattern + that the secret lives only on the function. Update `apps/mobile/src/components/media/cast-slider.tsx` TODO(M4) note (person route now exists).

---

## Milestone D — Web migration (single source of truth)

Switch web's person page off direct TMDB calls to the tables + Edge Function, so web and mobile share one data path. Keep the existing UI (`filmography-list.tsx`, `biography-text.tsx`, `media-card.tsx`), but refit `filmography-list.tsx` to consume `person_credits` rows via the shared `@intertaind/media` logic (Milestone B) instead of `TMDBPersonCombinedCredits`.

### Task D1: Person page reads tables (enrich via Edge Function)
**Files:** Modify `apps/web/src/app/person/[id]/page.tsx`; possibly `apps/web/src/lib/api/tmdb.ts` (getPersonDetails/combined_credits may become unused here — leave if used elsewhere).
- Replace the two TMDB calls with: read `people`/`person_credits`; if missing/stale, `fetch` the `person` Edge Function (server-side), then re-read. Keep the media_items match + viewer tracking + "X of Y watched" logic (now computed from `person_credits` where `credit_type='cast'`).

### Task D2: Refit `filmography-list.tsx` to shared logic + rows
- Delete the in-file `mergeCredits/sortCredits/TMDB_GENRES/...`; import from `@intertaind/media`. Change the `credits` prop from `TMDBPersonCombinedCredits` to `person_credits` rows; feed `mergeCredits(rows)`.

**Verify:** `pnpm --filter web typecheck` + `pnpm --filter web lint` (clean in touched files); web person page renders from the tables.
**Commit** `refactor(web): person page reads persisted people/credits`.

> If Jess wants to sequence web AFTER shipping mobile, Milestone D can be deferred — the tables + function work regardless. Default: do it, for lockstep.

---

## Milestone E — Mobile person page

### Task E1: Query hooks
**Files:** Modify `apps/mobile/src/queries/keys.ts` (add `person` keys); Create `apps/mobile/src/queries/person.ts`.
- `usePerson(tmdbId)`: read `people` by tmdb_id (anon). If missing/stale (`enriched_at` > 30d) → `supabase.functions.invoke("person", { body: { tmdb_id } })`, then refetch. Returns the person row.
- `usePersonCredits(tmdbId)`: read `person_credits` for the person (anon). Returns `Tables<'person_credits'>[]` (structurally a `PersonCreditInput[]`).
- Watched stat: `usePersonWatched(tmdbId)` OR fold into the screen — from credits with `credit_type='cast'` + a batched `user_media` lookup by the linked `media_item_id`s (anon, owner RLS). Denominator = distinct cast credits; numerator = distinct linked media the viewer has `completed`/`in_progress`.

### Task E2: Mobile MediaCard (poster grid item)
**Files:** Create `apps/mobile/src/components/media/media-card.tsx`.
- 2:3 poster (`@/components/image`, `tmdbImageUrl(poster_path)`), title (`numberOfLines={1}`), year, `StarRating readOnly size={12}` when a rating exists, the media-type film/TV glyph. Props accept a `MergedCredit`. Tappable → `router.push('/media/<media_item_id>')` when linked; **non-tappable** when `media_item_id == null` (title not in catalog — document TODO: a media-upsert Edge Function would make these tappable later, mirroring web's upsert-on-click). Reuse `MEDIA_TYPE_ICONS`.

### Task E3: Mobile FilterPicker (bottom-sheet dropdown)
**Files:** Create `apps/mobile/src/components/media/filter-picker.tsx`.
- A labeled chip (value or placeholder + chevron) that presents an `AppSheet` (existing infra) listing options as a radio list (reuse the game-status-sheet row pattern). `{ value, label, options, onChange }`. This is the mobile analogue of web's `FilterDropdown`.

### Task E4: Mobile FilmographyList
**Files:** Create `apps/mobile/src/components/media/filmography-list.tsx`.
- Port web's `filmography-list.tsx` component shell using the shared `@intertaind/media` logic: `mergeCredits` → `availableRoles`/`availableGenres` → `filterCredits` → `sortCredits`. State: role/type/decade/genre/sort (default `"popular"`) + `visibleCount` (24, "Load more"). Render a 2-col grid (`FlatList numColumns={2}` or a wrapped View) of `MediaCard`. Filter row = `FilterPicker`s (role/type/decade/genre + sort). Empty state "No credits match these filters."

### Task E5: Person screen (shared route)
**Files:** Create `apps/mobile/src/app/(tabs)/(index,explore)/person/[id].tsx` (shared route — mirror `media/[id].tsx`'s header opts + `(index,explore)` extrapolation; add nothing to `unstable_settings`). Create `apps/mobile/src/components/media/biography-text.tsx` (port web's show-more toggle).
- Header: portrait (`tmdbImageUrl(profile_path, "w500")`, User fallback), name, `BiographyText`, Born/Died/From, "X of Y watched" box (mirror web aside). Then `<FilmographyList credits={credits} .../>`. Reserve `useBottomInset()` on the scroll container. Pending/error states like `media/[id].tsx`.

### Task E6: Wire cast + crew → person route
**Files:** Modify `apps/mobile/src/components/media/cast-slider.tsx` (`CastCard` → wrap in `Pressable` → `router.push('/person/'+tmdb_id)` when `tmdb_id` present; remove the non-tappable TODO). Optionally make `InfoSections` crew names tappable if crew carries person ids (web's crew rows are names only — SKIP unless ids exist; note in the task).

**Verify (every task E):** `pnpm --filter mobile typecheck` + `pnpm --filter mobile lint`. Manual: open a movie → Cast tab → tap a face → person page loads (first load triggers the Edge Function enrich), filters/sort/"Load more" work, watched count correct, tapping a catalog title → media detail.

---

## Final review
After all milestones: dispatch a final code-review subagent over the whole diff; run root `pnpm typecheck` + `pnpm lint` + `pnpm --filter @intertaind/media test`; then gli-toolkit:finishing-a-development-branch.

## Known limitations (documented, not bugs)
- Filmography titles NOT in our catalog render but are **non-tappable** (no mobile media-upsert path yet; web upserts-on-click via a server action). Follow-up: a `media-upsert` Edge Function.
- Crew person-links depend on TMDB crew carrying person ids in our stored shape; only wire if present.
- "X of Y watched" denominator = distinct **cast** credits (web parity), not crew.
