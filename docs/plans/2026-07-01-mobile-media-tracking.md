# Mobile Media Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:executing-plans (or gli-toolkit:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Give the Expo mobile app the full media-tracking experience the web app has — tap any title → a media detail screen → track it (status, half-star rating, review, favorite, remove) with all four media-type progress flows (book pages/DNF, TV season+episode logging, movie watched-date/rewatch, game sub-status/hours) and custom cover/backdrop — with activity-feed events emitted by a shared Postgres trigger so web and mobile stay consistent.

**Architecture:** Mobile has no server actions — every mutation is a direct `supabase-js` call wrapped in a TanStack Query mutation hook (RLS enforces ownership), invalidating the relevant query keys on success. A new `media/[id]` route pushes over the tab navigator. Web currently writes `activity_log` rows from its server actions; this plan **moves that logging into a Postgres trigger on `user_media`** so both clients get it for free (and removes web's now-redundant client-side inserts in the same change to avoid double-logging). The mobile tracking UI mirrors web's per-media-type modals.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19.2, expo-router v6, `@supabase/supabase-js`, TanStack Query v5, NativeWind 4, `react-native-svg` (already installed — used for the star rating), vitest (shared pure-logic tests), Supabase Postgres (migration + trigger).

---

## Context for the implementer (read first)

- Read `apps/mobile/AGENTS.md` and root `AGENTS.md`. Load-bearing conventions: **all data access goes through `src/queries/`** (one file per resource, hooks named `use<Resource><View>` / `use<Resource><Action>Mutation`, throw on Supabase error); **design-system semantic tokens only** (no raw palette/hex — read `packages/design-system/src/tokens.cjs` and `apps/mobile/src/app/(tabs)/index.tsx` for the vocabulary); **mobile primitives only** (`View`/`Text`/`Pressable`/`Image` (`expo-image`)/`FlatList`, `onPress` not `onClick`); **screens never `router.push/replace` for auth** but DO navigate for content; **DB types from `@intertaind/supabase` (`Tables<'…'>`), domain types from `@intertaind/types`**.
- **⚠️ NEVER call Supabase methods inside `onAuthStateChange`** (documented deadlock — not relevant here but don't reintroduce).
- **Web is the source of truth for semantics.** Mirror these files (do NOT change web except where M3 says to):
  - Data model / actions: `apps/web/src/app/actions/media.ts` (all `trackMedia`/`rateMedia`/`reviewMedia`/`toggleFavorite`/`removeTracking`/`updateBookPage`/`setCustomCover`/`setCustomBackdrop` logic + the activity-logging conditions).
  - Detail page + queries: `apps/web/src/app/media/[id]/page.tsx`, client UI `apps/web/src/app/media/[id]/media-detail-client.tsx`.
  - Star rating: `apps/web/src/components/star-rating.tsx` (half-stars, stored 1–10).
  - Modals to mirror: `apps/web/src/components/modals/{book,movie,tv,game}-modal.tsx`, `current-episode-modal.tsx`, `log-episode-modal.tsx`, `current-reading-modal.tsx`, `cover-picker-modal.tsx`, `backdrop-picker-modal.tsx`.

### Data model (verified from `packages/supabase/src/database.types.ts`)

- **`user_media`** (the tracking row): `id`, `user_id`, `media_id`, `status` (`"want" | "in_progress" | "completed" | "dropped" | "on_hold"`), `rating` (int **1–10** = half-stars 0.5–5.0; `null` = unrated), `review` (text|null), `is_favorite` (bool|null), `progress` (JSONB|null), `started_at`, `completed_at`, `created_at`, `updated_at`. Unique on `(user_id, media_id)`. RLS: a user can `select` (own rows, or others' if that profile is public) / `insert` / `update` / `delete` **their own** rows (`user_id = auth.uid()`; migration `012`).
- **`progress` JSONB shape by media type** (mirror web exactly):
  - **book**: `{ sub_shelf: "finished" | "dnf", current_page: number, total_pages?: number, custom_cover_url?: string }`
  - **tv_show**: `{ current_season: number, current_episode: number, watched_episodes: { [seasonKey]: number[] }, episode_logs: { [seasonKey]: { [episodeKey]: { rating, review } } }, custom_backdrop_url?: string }`
  - **movie**: `{ watched_on: "YYYY-MM-DD", is_rewatch: boolean, custom_backdrop_url?: string }`
  - **video_game**: `{ sub_status: "playing" | "completed" | "played" | "shelved" | "retired" | "abandoned", hours_played?: number, custom_backdrop_url?: string }`
- **`media_items`**: `id, media_type, title, description, cover_image_url, backdrop_url, release_date, metadata (JSONB), external_ids (JSONB), avg_rating, rating_count, tracking_count, completed_count, in_progress_count, favorites_count, lists_count, recommendations_count, recommended_for_count, series_id, series_name, series_position, series_status, created_at, updated_at`. Anon-readable (public catalog). Denormalized counts are maintained by existing triggers (migrations `002`, `003`, `018`) — do not touch.
- **`activity_log`**: `id, user_id, media_id (null ok), list_id (null ok), activity_type (enum), metadata (JSONB), created_at`. **`activity_type` enum values:** `added_to_shelf, completed, status_changed, rated, reviewed, favorited, removed, started, started_reading, logged_season, logged_episode, created_list, liked_list, saved_list, recommended`. (Enum + a CHECK constraint live in migrations `010`; index in `013`.)
- Types: `@intertaind/types` exports `MediaItem`, `UserMedia`, `TrackingStatus`, `MediaType`. `@intertaind/supabase` exports `Tables<'user_media'>` / `Tables<'media_items'>` / `Tables<'activity_log'>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<'activity_type'>`.

### Verification model

`apps/mobile` has no RN test runner; RN screens/hooks aren't unit-tested. So:
- **vitest** covers *pure extractable logic only* (rating 1–10 ↔ 0.5–5 conversion, progress-object builders) — put those in a testable module and TDD them.
- **Everything else** is verified by `pnpm --filter mobile exec tsc --noEmit`, a Metro bundle check, and **manual simulator verification** (steps given per task). Daily loop: `pnpm --filter mobile dev`; **native config unchanged in this plan → no rebuild needed** (react-native-svg is already in the dev client from the Google-logo work).
- **The Postgres trigger (M3)** is verified with SQL: apply the migration to the linked Supabase project (or a local `supabase db`), run INSERT/UPDATE/DELETE against `user_media`, assert the expected `activity_log` rows. Regenerate types with `pnpm gen:types` and commit.
- After any `packages/*` change run `pnpm typecheck` (web + mobile). Env quirk: if a vitest run fails on missing `@rolldown/binding`, `pnpm install --force` once.

### Milestone map (this is the "nothing forgotten" checklist)

- **M1** — Navigation + read-only media detail screen (tap a title → see it + your current tracking state).
- **M2** — Core cross-media tracking: data layer (`queries/tracking.ts`) + unified UI (status picker, half-star rating, review, favorite, remove) with optimistic updates.
- **M3** — Activity logging moved to a Postgres trigger on `user_media`; remove web's client-side `activity_log` inserts; regen types.
- **M4** — Media-type progress flows: book (pages/DNF), TV (season + per-episode logging), movie (watched-date/rewatch), game (sub-status/hours) + custom cover/backdrop.
- **M5** — Detail-page display extras (enumerated; build or record as tracked follow-up): ratings histogram, recommendations section, cast/people navigation, book series siblings.

---

## Milestone 1 — Navigation + read-only media detail

End state: tapping a Trending row opens `media/[id]` showing cover/backdrop, title, meta, description, aggregate rating + counts, and — if signed in and tracking exists — the current status/rating badge. No mutations yet.

### Task 1.1: Query key additions

**Files:** Modify `apps/mobile/src/queries/keys.ts`.

Add under `media`: `detail(mediaId)` already exists — keep it. Add `viewerTracking: (mediaId) => [...queryKeys.media.all, "viewer-tracking", mediaId] as const`. (Kept separate from `detail` so a tracking mutation can invalidate the viewer's row without refetching the whole media item, and vice-versa.)

**Verify:** `pnpm --filter mobile exec tsc --noEmit`. **Commit:** `feat(mobile): query key for viewer tracking`.

### Task 1.2: `useMediaDetail` + `useViewerTracking` hooks

**Files:** Modify `apps/mobile/src/queries/media.ts`.

- `useMediaDetail(mediaId: string)` — `select` the columns the detail screen renders (mirror web's needs): `id, media_type, title, description, cover_image_url, backdrop_url, release_date, metadata, external_ids, avg_rating, rating_count, tracking_count, completed_count, in_progress_count, favorites_count, lists_count, series_id, series_name, series_position, series_status`. `.eq("id", mediaId).single()`. Type the return with `Pick<Tables<"media_items">, …>`.
- `useViewerTracking(mediaId: string)` — uses `useAuth()` for the user id; if no user, return `{ data: null }` shape (disable the query with `enabled: !!userId`). Query: `.from("user_media").select("*").eq("user_id", userId).eq("media_id", mediaId).maybeSingle()`. Returns `Tables<"user_media"> | null`. Key: `queryKeys.media.viewerTracking(mediaId)`.

**Verify:** tsc clean. **Commit:** `feat(mobile): useMediaDetail + useViewerTracking query hooks`.

### Task 1.3: `media/[id]` route + read-only detail screen

**Files:** Create `apps/mobile/src/app/media/[id].tsx`. (Sibling of the `(tabs)` and `(auth)` groups — a root Stack screen, so it pushes over the tabs with a native back button. Confirm the root `_layout.tsx` `<Stack>` renders it; no `_layout` change should be needed since it's a top-level route.)

Screen: `useLocalSearchParams<{ id: string }>()`, then `useMediaDetail(id)` + `useViewerTracking(id)`. Render pending/error/data. Layout mirrors web's detail page structure (backdrop image header, cover, title, media-type + release year, aggregate `avg_rating` (÷ nothing — `avg_rating` is already display-scale on `media_items`; VERIFY against web) + `rating_count`, description, and a tracking-state badge showing the viewer's `status`/`rating` if a tracking row exists — "Not tracked" otherwise). Tokens only, `expo-image` for images. No actions yet (M2).

> Confirm whether `media_items.avg_rating` is stored on the 0.5–5 display scale or the 1–10 internal scale — check how web renders it in `media/[id]/page.tsx`. Match that. (Individual `user_media.rating` IS 1–10; the aggregate may differ.)

### Task 1.4: Make Trending (and explore) rows tappable

**Files:** Modify `apps/mobile/src/app/(tabs)/index.tsx` (and `(tabs)/explore.tsx` if it lists media). Wrap each row in `<Pressable onPress={() => router.push(\`/media/${item.id}\`)}>` (`useRouter` from expo-router). Keep styling; add press feedback.

**Verify M1:** tsc clean; Metro bundle of `media/[id]` returns 200; **manual:** tap a Trending item → detail screen opens with correct data + back works; a tracked vs untracked item shows the right badge. **Commit:** `feat(mobile): media detail screen + tappable media rows`.

---

## Milestone 2 — Core cross-media tracking

End state: from the detail screen, set status, rate (half-stars), write a review, toggle favorite, and remove — persisted, optimistic, and reflected on reopen. Unified across all media types (type-specific flows are M4).

### Task 2.1: Rating conversion helpers (TDD, shared)

**Files:** Create `packages/types/src/rating.ts` + `packages/types/src/rating.test.ts`; re-export from `packages/types/src/index.ts`.

Pure helpers mirroring web: `ratingToStars(dbRating: number | null): number | null` (`db/2`), `starsToRating(stars: number | null): number | null` (`Math.round(stars*2)`, clamp 1–10), and a guard that half-star stars (0.5–5.0 in 0.5 steps) round-trip. TDD: write `rating.test.ts` first (round-trip 1↔0.5, 10↔5.0, null↔null, clamp out-of-range), run red, implement, green.

**Verify:** `pnpm --filter @intertaind/types test`. **Commit:** `feat: shared rating<->stars conversion in @intertaind/types`.

### Task 2.2: `StarRating` RN component

**Files:** Create `apps/mobile/src/components/star-rating.tsx`.

Mirror `apps/web/src/components/star-rating.tsx` behavior with `react-native-svg`: 5 stars, half-star selection (tap left half = .5, right half = full — use two `Pressable` halves per star or `onPress` with x-locating via `onPress`+layout), a clear affordance (long-press or an X) to set null. Props: `value: number | null` (display 0.5–5), `onChange(next: number | null)`, `readOnly?`. Star fill colors from design tokens (or Google-logo-style: a filled/empty star path). Tokens only for chrome.

**Verify:** tsc; renders in a screen. **Commit:** `feat(mobile): half-star StarRating component`.

### Task 2.3: `queries/tracking.ts` — core mutations

**Files:** Create `apps/mobile/src/queries/tracking.ts`; add tracking keys to `keys.ts` if needed.

Mirror web `actions/media.ts` semantics, but **without** any `activity_log` inserts (M3's trigger handles that). Each mutation `onSuccess` invalidates `queryKeys.media.viewerTracking(mediaId)` + `queryKeys.media.detail(mediaId)` (counts change) + (later) `queryKeys.user.shelves(userId)`. Add optimistic updates for status/rating/favorite (TanStack `onMutate` cache write + rollback `onError`).

Hooks (all use `useAuth()` for `user.id`; throw on Supabase error):
- `useTrackMediaMutation()` — `mutate({ mediaId, status, rating?, review?, is_favorite?, progress?, started_at?, completed_at? })`. Upsert into `user_media` `{ user_id, media_id, status, …optional, started_at: status==="in_progress" ? now : (given), completed_at: status==="completed" ? now : (given) }` with `onConflict: "user_id,media_id"`, `.select("id").single()`. Mirror web's `trackMedia` field-merge (only set provided optional fields). Returns the `user_media` id.
- `useUpdateStatusMutation()` — `{ userMediaId, status }` update (sets completed_at/started_at like web).
- `useRateMediaMutation()` — `{ userMediaId, rating }` (rating is 1–10 or null).
- `useReviewMediaMutation()` — `{ userMediaId, review }`.
- `useToggleFavoriteMutation()` — reads current `is_favorite`, writes `!current` (or accept explicit value); returns new bool.
- `useRemoveTrackingMutation()` — deletes the row by `id` + `user_id`.

> **Important — "favorite/rate without a tracking row yet":** web auto-creates a `status: "want"` row when a user favorites/rates an untracked item (see web `toggleFavorite`/`setCustomBackdrop` lazy-create). Mirror this: if there's no `userMediaId`, these mutations should upsert a row first. Keep the lazy-create logic in one helper.

**Verify:** tsc. **Commit:** `feat(mobile): core tracking mutations (status/rate/review/favorite/remove)`.

### Task 2.4: Tracking panel UI on the detail screen

**Files:** Create `apps/mobile/src/components/media/tracking-panel.tsx`; use it in `media/[id].tsx`.

Unified controls (type-specific entry points come in M4): a status picker (segmented control or a bottom-sheet with the 5 statuses + "Remove"), the `StarRating`, a review editor (inline expandable `TextInput` or a modal — mirror web's textarea), a favorite heart toggle. Wire each to its mutation. Use the viewer's current `user_media` row to seed initial values. Show pending/disabled states. Tokens + a11y labels; no self-navigation.

**Verify M2:** tsc; **manual (simulator, signed in):** on a detail screen — set status → persists + reopen shows it; rate 3.5 stars → persists (check Supabase `user_media.rating === 7`); write a review → persists; favorite toggles; remove clears tracking; favoriting an untracked item creates a `want` row. Optimistic UI updates instantly, rolls back on forced error. **Commit:** `feat(mobile): tracking panel (status/rating/review/favorite/remove)`.

---

## Milestone 3 — Activity logging via Postgres trigger

End state: `user_media` INSERT/UPDATE/DELETE automatically writes the correct `activity_log` row (matching web's current behavior) for BOTH clients; web's client-side `activity_log` inserts are removed so nothing double-logs.

> **These land together in one migration + web change** (a trigger without removing web's inserts = double logging; removing web's inserts without the trigger = web loses activity). Do the whole milestone before deploying either.


> **Timestamp + constraint notes (from Task 2.3 review):** (a) Mobile writes `started_at`/`completed_at` from the DEVICE clock (web wrote them server-side) — consider having this trigger migration also stamp those transitions server-side, and verify whether `user_media` has any `updated_at` trigger at all (base schema is dashboard-era; `lists` has one, `user_media` unverified). (b) Land the `user_media.rating` CHECK constraint (recorded in Follow-ups) in the same migration pass.

### Task 3.1: Design + write the trigger migration

**Files:** Create `supabase/migrations/0XX_user_media_activity_trigger.sql` (next number in sequence — check `ls supabase/migrations`).

Port web's logic (`apps/web/src/app/actions/media.ts` — read the `trackMedia`/`rateMedia`/`reviewMedia`/`toggleFavorite`/`removeTracking` activity conditions carefully) into a `plpgsql` trigger function on `user_media`:
- **AFTER INSERT:** emit one row by priority — `review` present → `reviewed`; else `status = completed` → `completed`; else `added_to_shelf`. (Rating-on-insert: web logs the primary event; if the modal set a rating on first track, web still logs one event — match by NOT emitting a separate `rated` on the same insert unless you confirm web does. VERIFY against web and document the choice inline.)
- **AFTER UPDATE:** compare OLD/NEW and emit the event for what changed, using web's priority for combined changes (`reviewed` if review newly non-empty & changed; else `status_changed`/`completed` if `status` OR `progress->>'sub_status'` changed; else `rated` if `rating` changed to non-null; else `favorited` if `is_favorite` went false/null→true). **Silent (no row)** for: review rewrite of an already-present review being the ONLY change *(match web — web treats re-review as `reviewed`; VERIFY and match exactly)*, progress-only changes that don't change sub_status (page turns, hours, dates), unfavorite (true→false), rating→null (clearing).
- **AFTER DELETE:** emit `removed` with `metadata = jsonb_build_object('previous_status', OLD.status)`.
- Every row: `user_id = NEW/OLD.user_id`, `media_id = NEW/OLD.media_id`, `activity_type = …`, `metadata` as web sets it. `SECURITY DEFINER`, `SET search_path = public`.

> This is the hardest task. Read web's exact conditions and replicate them literally. Where web's combined `trackMedia` emits exactly one row by priority but a mobile granular flow emits several (separate mutations), that's acceptable and arguably better — but DOCUMENT it in the migration comment and confirm it doesn't produce duplicate/oddly-ordered feed entries for the modal flows (M4) that do combined upserts.

### Task 3.2: Remove web's client-side activity logging

**Files:** Modify `apps/web/src/app/actions/media.ts` — delete the `activity_log` insert blocks from `trackMedia`, `updateTrackingStatus`, `rateMedia`, `toggleFavorite`, `reviewMedia`, `removeTracking` (the trigger now does it). Keep the `user_media` writes and any `activity_type_override` behavior that the trigger CAN'T replicate — if web relies on `activity_type_override` for cases the trigger can't infer, either (a) encode that in the trigger via a convention, or (b) keep a minimal explicit insert ONLY for those cases and document why. Prefer the trigger handling everything; flag any override that can't move.

### Task 3.3: Apply, regenerate types, verify both platforms

- Apply the migration to the linked Supabase project (Jess runs `supabase db push` / applies via dashboard — coordinate; the agent should PREPARE the SQL and the exact apply command, and NOT assume DB credentials).
- `pnpm gen:types` → commit the regenerated `packages/supabase/src/database.types.ts` with the migration (likely no type change since `activity_log` already exists, but run per convention).
- **Verify (SQL):** insert a `user_media` row → assert one `added_to_shelf`; update status → `status_changed`; set rating → `rated`; add review → `reviewed`; favorite → `favorited`; delete → `removed` with previous_status. Compare against web's behavior for the same operations.
- **Verify (web):** `pnpm --filter web build`; manually track on web → exactly one activity row (no double-log).
- **Verify (mobile):** track on mobile → the same activity row appears (previously it wrote none).

**Commit:** `feat(db): activity_log via user_media trigger; drop web client-side logging`.

---

## Milestone 4 — Media-type progress flows

> **⚠️ PROGRESS-REPLACEMENT LANDMINE (from Task 2.3 review):** `useTrackMediaMutation`'s `progress` payload REPLACES the whole JSONB object (web parity — web's modals merge client-side before calling). M4 must: (a) add read-merge-write progress mutations in a new `src/queries/progress.ts` (mirror web's `updateBookPage`/`setCustomCover`/`setCustomBackdrop` fresh-read-merge pattern); (b) never merge from an `OPTIMISTIC_ID` row or mid-mutation cache; (c) put progress-shape builders in `@intertaind/types` with vitest coverage. A book flow passing `progress: { sub_shelf: "finished" }` without merging silently wipes `custom_cover_url`; a TV flow can wipe `watched_episodes`.

End state: each media type gets its web-equivalent progress UX. Mirror the web modals (`components/modals/*`). Each flow writes the `progress` JSONB shape from the data-model section and uses `useTrackMediaMutation` (or dedicated progress mutations) with the right status. Reuse `TrackingPanel`; branch the "primary action" + progress UI by `media.media_type`.

### Task 4.1: Book flow

Mirror `book-modal.tsx` + `current-reading-modal.tsx` + `cover-picker-modal.tsx`. Controls: "Read" (→ completed, `progress.sub_shelf` finished/dnf) / "Reading" (→ in_progress) with a current-page input (`useUpdateBookPageMutation` writing `progress.current_page`, silent — no activity), rating/review/favorite, and a custom cover override (`progress.custom_cover_url` via `useSetCustomCoverMutation`). Book page updates are silent (mirror web `updateBookPage`).

### Task 4.2: Movie flow

Mirror `movie-modal.tsx` + `backdrop-picker-modal.tsx`. Controls: "Watched" (→ completed) with `progress.watched_on` (date) + `progress.is_rewatch` toggle, rating/review/favorite, custom backdrop (`progress.custom_backdrop_url`).

### Task 4.3: TV flow

Mirror `tv-modal.tsx` + `current-episode-modal.tsx` + `log-episode-modal.tsx`. Controls: "Watched"/"Watching"; season/episode current pointer (`progress.current_season`/`current_episode`); mark watched episodes (`progress.watched_episodes[seasonKey] = number[]`); per-episode log with its own rating/review (`progress.episode_logs[seasonKey][episodeKey] = { rating, review }`); custom backdrop. Activity: web emits `logged_season`/`logged_episode` — ensure the M3 trigger (or an explicit call) produces these for the corresponding progress changes. **This interacts with M3** — TV episode/season logging is the main case where an activity event is driven by a `progress` change; confirm the trigger emits `logged_season`/`logged_episode` when `watched_episodes`/`episode_logs` grow. Coordinate the trigger logic with this task.

### Task 4.4: Game flow

Mirror `game-modal.tsx` + `backdrop-picker-modal.tsx`. Controls: the 6 game sub-statuses (`progress.sub_status`: playing/completed/played/shelved/retired/abandoned) mapped to the primary `status`, optional `hours_played`, rating/review/favorite, custom backdrop. sub_status changes should log `status_changed` (trigger reads `progress->>'sub_status'`).

**Verify M4 (per type):** tsc; **manual** on a title of each type — exercise every control, confirm the `progress` JSONB matches the web shape in Supabase, confirm activity rows match web (esp. TV logged_season/logged_episode, game sub_status → status_changed). **Commit per task:** `feat(mobile): <type> tracking progress flow`.

---

## Milestone 5 — Detail-page display extras (enumerate; build or record)

These are the non-tracking display features on web's detail page. Listed so they're **not forgotten**. Decide per item whether to build now or leave as a tracked follow-up (each is independently shippable):

1. **Ratings histogram** — web shows a distribution of `user_media.rating` for the item. Mobile: a small bar chart (react-native-svg). Query: counts grouped by rating. (Web `media/[id]/page.tsx` builds this in JS from all ratings.)
2. **Recommendations section** — web's "if you liked X, try Y" pairings surfaced on the detail page (`recommendations` table; helper fns in web `actions/recommendations.ts` / `top-picks.ts`). Mobile: a horizontal carousel. **This is the app's headline cross-media feature** — worth its own milestone/plan.
3. **Cast / people** — web links to `entity/[type]/[id]` and `person/[id]` / `author/[olid]`. Mobile: a people strip + people detail screens. Larger (new routes + queries).
4. **Book series siblings** — web shows series graph / next-in-series for books with `series_id`. Mobile: a "Series" section using `queryKeys.media.bySeries`.

**Recommendation:** build (1) ratings histogram with M1–M4 (small, same screen); make (2) recommendations, (3) cast/people, and (4) series their own follow-up plans (each is a feature, not a detail-page widget). Record them in this section either way so nothing is lost.

---

## Follow-ups (record, don't lose)

- **Optimistic-update polish** across all flows (M2 does status/rating/favorite; extend to progress if it feels laggy).
- **Offline/queue** for tracking mutations (nice-to-have; TanStack persistence).
- **`avg_rating` scale confirmation** (Task 1.3) — document which scale `media_items.avg_rating` uses so histogram + display agree.
- **Recommendations, cast/people, series** detail-page sections (M5 items 2–4) — the headline recommendations engine especially deserves its own plan.
- **Web/mobile shared tracking helpers** — if the `progress`-shape builders duplicate between platforms, extract to `@intertaind/types`.
- **Web avg_rating scale bug (pre-existing):** web `media-card.tsx` passes 0–5 `avg_rating` into `StarRatingDisplay` which divides by 2 again — cards show half the true community rating. Fix web-side; the scales are documented in migration 025 + mobile media/[id].tsx (review finding, 2026-07-02).
- **Deep-link handling:** cold-start on /media/[id] mounts it as the only stack entry (no tabs beneath — add root-layout anchor for (tabs)) and signed-out deep links lose the intended route through the login gate (preserve+restore). Address when sharing/deep links become real.
- **expo-image import guardrail:** add an ESLint `no-restricted-imports` rule for `expo-image` (allowlist `components/image.tsx`) and delete the unused Expo-template leftovers (`web-badge.tsx` etc.) in a cleanup pass — the "import via @/components/image" convention is currently enforced only by AGENTS.md (review finding, 2026-07-02).
- **`queryKeys.activity.feed()` needs a userId segment** when personalized activity queries land — same per-viewer cache class as the viewerTracking fix; `queryClient.clear()` on sign-out backstops it today (review finding, 2026-07-02).
- **CHECK constraint on `user_media.rating`:** no CHECK exists in the repo migrations (base schema is dashboard-era). At scale, corrupt ratings poison avg_rating via the 025 trigger while the client-side clamp hides them. Add a migration `CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10 AND rating = floor(rating)))` + `pnpm gen:types` (review finding, 2026-07-02). Verify no existing rows violate it first.
