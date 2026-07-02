# Mobile Media Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:subagent-driven-development (same session) or gli-toolkit:executing-plans (parallel session) to implement this plan task-by-task.

**Goal:** Give the Expo mobile app a persistent app shell (custom bottom navbar visible everywhere, incl. detail screens) and the full media-detail + tracking experience the web app has — faithful to web's **per-media-type** action model (movie / TV / book / game each have their own action set and log flow), keeping web's visual language in mobile-intuitive layouts, with activity-feed events emitted by a shared Postgres trigger so web and mobile stay consistent.

**Architecture:** Mobile has no server actions — every mutation is a direct `supabase-js` call wrapped in a TanStack Query hook (RLS enforces ownership). The app is wrapped in a **persistent custom-styled bottom navbar**; media detail renders **inside** the tab navigator so the navbar stays visible (was previously a root sibling that covered it). The tracking UI is **one config-driven component** whose status slot + log flow vary by `media.media_type` — NOT a single "5-status picker". One-tap actions live in an **inline action strip** under the hero; all log/review/season/episode/recommend flows open as **bottom sheets** (`@gorhom/bottom-sheet`). Web currently writes `activity_log` rows from its server actions; this plan **moves that into a Postgres trigger on `user_media`** (and removes web's now-redundant inserts in the same change).

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19.2, expo-router v6 (custom `Tabs` + custom `tabBar`), `@supabase/supabase-js`, TanStack Query v5, NativeWind 4, `react-native-svg` (installed), `lucide-react-native` (installed), **NEW:** `@gorhom/bottom-sheet` + `react-native-reanimated` + `react-native-gesture-handler` (→ **native rebuild required**), `react-native-safe-area-context` (installed), vitest (shared pure logic), Supabase Postgres (migration + trigger).

---

## Design decisions (locked in the 2026-07-02 brainstorm with Jess — read before building UI)

These came from studying the web app + Jess's screenshots. Honor them:

- **Persistent custom bottom navbar**, near-black + neon-accent, identical on iOS/Android, visible on EVERY authenticated screen including detail. Built on expo-router JS `Tabs` with a custom `tabBar` (NOT `unstable-native-tabs`). The actual tab SET is a later brainstorm — keep **Trending + Explore** as placeholders and leave the bar easy to extend (design for ~5 slots + a center CTA).
- **Inline action strip** under the hero for one-tap actions (status · Loved · list · inline stars), with full-width **Log/Review** and **Intertain** buttons. NO sticky bottom action bar (would collide with the navbar).
- **Bottom sheets** (`@gorhom/bottom-sheet`) for every log/review/season/episode/recommend flow — the mobile form of web's centered modals.
- **Hybrid info sections:** TV **Seasons render inline** as cards; Crew/Details/Genres/Releases/Alternative-titles sit behind a compact horizontal **tab strip**.
- **One config-driven action component** varying the status slot + log flow by media type. Build the **movie screen first as the locked reference**, then propagate to TV/book/game in the same effort (not a deferred phase).
- **Color grammar (from web — pull from design tokens / web components, don't eyeball):** active status **green**, Loved **pink**, stars **gold**, Intertain CTA **hot-pink**, episode/season picker **purple/violet selected state**. Media-type accents (`accent-movie/tv/book/game`) are used for the media-type label/icon.
- **"Intertain friends" is the headline cross-media feature** — a prominent hot-pink CTA on every detail screen, not buried.

### Per-media-type action grammar (the invariant — verified from web)

| Slot | movie | tv_show | book | video_game |
|---|---|---|---|---|
| **Status** | `Watched`→completed | `Watched`→completed · `Watching`→in_progress (current-episode sheet) | `Read`→BookLogSheet (finished/dnf) · `Reading`→CurrentReadingSheet | **dropdown** of 6 sub-statuses |
| **Loved** (♥) | toggle `is_favorite` | ← | ← | ← |
| **List** (🔖) | `Watchlist`→want | `Watchlist`→want | `Add to TBR`→want | `Wishlist`→want |
| **Log** | `Review or log…` → MovieLogSheet | `Log Season` + `Log Episode` sheets | `Review…` → BookLogSheet | `Log game…` → GameLogSheet |
| **Rating** | inline ★ (0.5–5) | ← | ← | ← |
| **Recommend** | Intertain friends → RecommendSheet | ← | ← | ← |
| **Secondary** | Show activity · Change backdrop | ← | Show activity · Change cover | Show activity · Change backdrop |

Game sub_status → status map (from `media-detail-client.tsx` `GAME_STATUSES`): `playing→in_progress · completed→completed · played→completed · shelved→on_hold · retired→on_hold · abandoned→dropped`. Rating a game with no sub_status → promote to `played` (mirror web).

---

## Context for the implementer (read first)

- Read `apps/mobile/AGENTS.md` and root `AGENTS.md`. Load-bearing conventions: **all data access goes through `src/queries/`** (one file per resource, hooks `use<Resource><View>` / `use<Resource><Action>Mutation`, throw on Supabase error); **design-system semantic tokens only** (read `packages/design-system/src/tokens.cjs`, `apps/mobile/src/app/(tabs)/index.tsx`); **mobile primitives only** (`View`/`Text`/`Pressable`/`FlatList`; **import `Image` from `@/components/image`**, never `expo-image` directly); **screens never `router.push/replace` for AUTH** but DO navigate for content; **DB types from `@intertaind/supabase` (`Tables<'…'>`), domain types from `@intertaind/types`**.
- **⚠️ Expo HAS CHANGED.** SDK 56 / RN 0.85 / React 19.2 / expo-router v6, new architecture on by default. Verify every Expo/RN/expo-router surface against the SDK-56 docs (https://docs.expo.dev/versions/v56.0.0/) before writing — training data lags. Install native deps with `npx expo install <pkg>` to get compatible versions.
- **⚠️ NEVER call Supabase methods inside `onAuthStateChange`** (documented auth-lock deadlock).
- **Web is the source of truth for semantics.** Mirror these files (do NOT change web except where M3 says to):
  - Data model / writes: `apps/web/src/app/actions/media.ts` (`trackMedia`/`rateMedia`/`reviewMedia`/`toggleFavorite`/`removeTracking`/`updateBookPage`/`setCustomCover`/`setCustomBackdrop` + activity conditions).
  - Recommendations: `apps/web/src/app/actions/recommendations.ts` (`createRecommendation`/`fetchRecommendationsForSource`/`fetchRecommendationsForTarget`).
  - Detail page: `apps/web/src/app/media/[id]/page.tsx`, client UI `apps/web/src/app/media/[id]/media-detail-client.tsx`.
  - Star rating: `apps/web/src/components/star-rating.tsx`.
  - Modals to mirror as bottom sheets: `apps/web/src/components/modals/{movie,tv,book,game}-modal.tsx`, `current-episode-modal.tsx`, `log-episode-modal.tsx`, `current-reading-modal.tsx`, `cover-picker-modal.tsx`, `backdrop-picker-modal.tsx`, and the recommend modal ("Intertain Your Friends").
  - Display sections: `apps/web/src/components/media/{media-info-tabs,media-info-sections,ratings-histogram,series-graph,season-ratings-graph,about-the-author,biography-text}.tsx`, `recommendations/media-recommendations-section.tsx`.

### Already built (reuse / rework — do NOT rebuild from scratch)

- ✅ `packages/types/src/rating.ts` (+ tests) — `ratingToStars`/`starsToRating`/`formatStars`/guards. **Reuse.**
- ✅ `apps/mobile/src/components/star-rating.tsx` — half-star svg component. **Reuse.**
- ✅ `apps/mobile/src/components/image.tsx` (cssInterop'd expo-image), `status-badge.tsx`, `lib/media-type-icons.ts`. **Reuse.**
- ✅ `apps/mobile/src/queries/{media.ts,tracking.ts,keys.ts}` — `useMediaDetail`, `useViewerTracking`, and the six core mutations (upsert/rate/review/favorite/remove, lazy-create, 23505 retry, optimistic). **Reuse the queries;** they're correct at the data layer.
- ⚠️ `apps/mobile/src/app/media/[id].tsx` + `apps/mobile/src/components/media/tracking-panel.tsx` — the detail screen renders, but the panel uses a **generic 5-status-chips-for-everything model that is DOMAIN-WRONG** (movies have no status picker, etc.). **M1 relocates the screen into the shell; M2 REPLACES the panel** with the config-driven per-type action strip. Salvage styling, discard the status-chip model.

### Data model (verified from `packages/supabase/src/database.types.ts` + migrations)

- **`user_media`**: `id`, `user_id`, `media_id`, `status` (`"want"|"in_progress"|"completed"|"dropped"|"on_hold"`), `rating` (int **1–10** = half-stars 0.5–5.0; null = unrated), `review` (text|null), `is_favorite` (bool|null), `progress` (JSONB|null), `started_at`, `completed_at`, `created_at`, `updated_at`. Unique `(user_id, media_id)`. RLS: own-row select/insert/update/delete (`user_id = auth.uid()`; migration `012`).
- **`progress` JSONB by media type** (mirror web exactly):
  - **book**: `{ sub_shelf: "currently_reading"|"finished"|"dnf", current_page?: number, total_pages?: number, is_reread?: boolean, custom_cover_url?: string }`
  - **tv_show**: `{ current_season: number, current_episode: number, watched_episodes: { [seasonKey]: number[] }, episode_logs?: { [seasonKey]: { [episodeKey]: { rating, review } } }, seasons?: { [seasonKey]: { rating, review, completed } }, custom_backdrop_url?: string }`
  - **movie**: `{ watched_on: "YYYY-MM-DD", is_rewatch: boolean, custom_backdrop_url?: string }`
  - **video_game**: `{ sub_status: "playing"|"completed"|"played"|"shelved"|"retired"|"abandoned", hours_played?: number, custom_backdrop_url?: string }`
- **`media_items`**: `id, media_type, title, description, cover_image_url, backdrop_url, release_date, metadata (JSONB), external_ids (JSONB), avg_rating (0–5 display scale — migration 025, NEVER ÷2 again), rating_count, tracking_count, completed_count, in_progress_count, favorites_count, lists_count, recommendations_count, recommended_for_count, series_id, series_name, series_position, series_status, created_at, updated_at`. Anon-readable. Counts maintained by existing triggers (`002/003/018/023`) — do not touch.
- **`activity_log`**: `id, user_id, media_id?, list_id?, activity_type (enum), metadata (JSONB), created_at`. Enum: `added_to_shelf, completed, status_changed, rated, reviewed, favorited, removed, started, started_reading, logged_season, logged_episode, created_list, liked_list, saved_list, recommended` (migration `010`, index `013`, `recommended` added `027`).
- **`recommendations`** (migration `023`): `id, user_id, source_media_id, recommended_media_id, note (≤280), created_at`. Unique `(user_id, source_media_id, recommended_media_id)`; `no_self_recommend`. RLS: select public-or-owner, **insert self**, delete self. Counts trigger maintains `media_items.recommendations_count`/`recommended_for_count`. → Mobile Intertain flow = a plain `insert` under `recommendations_insert_self`; no server secret.
- Types: `@intertaind/types` → `MediaItem, UserMedia, TrackingStatus, MediaType`; `@intertaind/supabase` → `Tables<'…'>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<'activity_type'>`.

### Verification model

`apps/mobile` has no RN test runner. So:
- **vitest** covers *pure logic only* (rating conversion — done; **progress-object builders** — add + TDD in `@intertaind/types`). RN screens/hooks are NOT unit-tested.
- **Everything else** = `pnpm --filter mobile exec tsc --noEmit` + Metro bundle check + **manual simulator verification** (steps per task).
- **⚠️ NATIVE REBUILD REQUIRED THIS PLAN:** M2 adds `@gorhom/bottom-sheet` + `react-native-reanimated` + `react-native-gesture-handler` (native modules). After adding them, one `pnpm --filter mobile exec npx expo run:ios --device "iPhone 17 Pro"` (per the project memory). Daily loop after: `pnpm --filter mobile dev`. (M0/M1 add no native modules → JS reload is enough until M2.)
- **The trigger (M3)** is verified with SQL against the linked Supabase project; Jess applies the migration (agent PREPARES SQL + apply command, does not assume DB creds). `pnpm gen:types` + commit after.
- After any `packages/*` change: `pnpm typecheck` (web + mobile). If vitest fails on `@rolldown/binding`, `pnpm install --force` once.

### Milestone map (the "nothing forgotten" checklist)

- **M0** — App shell: persistent custom bottom navbar + routing restructure so detail renders inside the tab navigator.
- **M1** — Media detail screen (display) inside the shell: hero, meta, description, community stats, cast slider (movie/TV), about-the-author (book), hybrid info (seasons inline + tab strip). Reframes the existing screen; navbar-aware bottom insets. No new mutations.
- **M2** — Per-type tracking (the core rebuild): bottom-sheet infra + config-driven action strip replacing `tracking-panel.tsx` + all four media-type log flows. Movie reference first, then TV/book/game.
- **M3** — Activity logging → Postgres trigger on `user_media`; remove web's client-side inserts; regen types.
- **M4** — Intertain-friends recommend flow + display extras (ratings histogram, series graph, recommendations section, about-the-author polish, cast/people nav, change cover/backdrop, show-activity screen). Enumerate; build the small ones, record the large ones as follow-up plans.

---

## Milestone 0 — App shell: persistent custom bottom navbar

End state: a custom-styled bottom navbar (Trending + Explore placeholders) is visible on every authenticated screen, INCLUDING the media detail screen, with per-tab back-stack behavior and correct safe-area insets. Web's dark + neon look.

> **Verify the expo-router SDK-56 idiom first.** Read the SDK-56 expo-router docs on `Tabs`, custom `tabBar`, and nested navigators. The two viable shapes: (A) nested **Stack per tab** with the shared `media/[id]` route reachable inside the active tab's stack (tab bar persists on push); (B) a `Tabs` navigator whose `tabBar` is a custom component, with detail routes nested so the bar isn't covered. Pick the one the docs bless for SDK 56; document the choice in `(tabs)/_layout.tsx` and `apps/mobile/AGENTS.md`.

### Task 0.1: Custom `tabBar` component

**Files:** Create `apps/mobile/src/components/nav/bottom-tab-bar.tsx`. Rewrite `apps/mobile/src/components/app-tabs.tsx` to use expo-router `Tabs` with `tabBar={(props) => <BottomTabBar {...props} />}` instead of `NativeTabs`.

- Custom bar: near-black surface (`bg-surface-*` token), top hairline border, per-tab icon (lucide-react-native) + label, **neon accent** on the active tab (media/brand accent token), inactive muted. Use `react-native-safe-area-context` `useSafeAreaInsets()` for the bottom inset. Tap → `props.navigation.navigate(route)`.
- Keep it data-driven from the `Tabs` route list so adding tabs later is trivial (design for ~5 slots).

**Verify:** tsc; **manual:** bar renders with Trending/Explore, active state uses the accent, tapping switches tabs. **Commit:** `feat(mobile): custom-styled bottom tab bar`.

### Task 0.2: Restructure routing so detail renders inside the tab nav

**Files:** Move `apps/mobile/src/app/media/[id].tsx` into the tab navigator per the chosen idiom (e.g. `apps/mobile/src/app/(tabs)/media/[id].tsx` or a shared nested route). Update `app/_layout.tsx` root `<Stack>` and `(tabs)/_layout.tsx` accordingly. Update all `router.push('/media/${id}')` call sites (`(tabs)/index.tsx`, `(tabs)/explore.tsx`) to the new href.

- End state: pushing a detail screen keeps the navbar visible; the OS/gesture back returns within the tab stack; switching tabs preserves each tab's stack.

**Verify:** tsc; Metro bundle 200; **manual:** open a detail from Trending → navbar still visible; back works; switch to Explore and back → Trending's detail stack state is intact (or resets — document expected behavior). Update the "Deep-link handling" follow-up (cold-start on detail should now mount tabs beneath it). **Commit:** `feat(mobile): render media detail inside the tab navigator (persistent navbar)`.

### Task 0.3: Navbar-aware scroll insets convention

**Files:** Add a small hook/util `apps/mobile/src/lib/use-bottom-inset.ts` (bar height + safe-area) and document in `apps/mobile/AGENTS.md` that scrollable screens must pad their bottom by it so content/buttons clear the navbar.

**Verify M0:** tsc; **manual:** long lists scroll fully above the bar; nothing is hidden behind it. **Commit:** `feat(mobile): bottom-inset helper + navbar spacing convention`.

---

## Milestone 1 — Media detail screen (display) inside the shell

End state: tapping a title opens the detail screen with hero (backdrop gradient + overlapping poster), title/byline/meta, tagline/description, community stats row, cast slider (movie/TV) or about-the-author (book), and the **hybrid info** area (TV seasons inline as cards + a tab strip for Crew/Details/Genres/Releases/Alt-titles). Correct navbar bottom insets. Still read-only (tracking = M2); leave a placeholder where the action strip will mount.

### Task 1.1: Confirm/extend detail queries

**Files:** `apps/mobile/src/queries/media.ts`, `keys.ts`.

`useMediaDetail` already selects the core columns — confirm it also returns `metadata` (cast/crew/genres/releases/seasons/tagline live here), `series_*`. Add a `useSeriesSiblings(seriesId)` hook (books) reading `media_items` by `series_id` (`id,title,series_position,release_date,avg_rating,rating_count,cover_image_url`) for the M4 series graph — key `queryKeys.media.bySeries(seriesId)`. `avg_rating` is **0–5 already** — never ÷2.

**Verify:** tsc. **Commit:** `feat(mobile): series-siblings query + confirm detail metadata select`.

### Task 1.2: Hero + header + description

**Files:** Rework `apps/mobile/src/app/(tabs)/media/[id].tsx` (new location from M0). Keep the existing gradient-hero/overlapping-poster styling (svg LinearGradient) — it's good; ensure bottom padding uses the M0 inset.

Render: backdrop hero + poster; media-type accent label + lucide icon; title + year; byline (director/creator/author/developer from `metadata`); secondary line (runtime/pages/seasons/genres per type); tagline (movie/TV, from metadata); description; community stats row (watched/loved/lists counts with lucide icons — spaced, mirror web's stat icons). No raw error strings.

**Verify:** tsc; **manual:** movie/TV/book/game all render correct header + stats. **Commit:** `feat(mobile): media detail hero + header + description (per type)`.

### Task 1.3: Cast slider + about-the-author

**Files:** Create `apps/mobile/src/components/media/cast-slider.tsx` (movie/TV) and `apps/mobile/src/components/media/about-the-author.tsx` (book). Mirror web `media-info-sections.tsx` / `about-the-author.tsx`.

- Cast: horizontal `FlatList` of cast cards (photo via `@/components/image` + name + character) from `metadata.cast`. Person links are M4 (route to a person screen not built yet) — render non-tappable or route-to-TODO; document.
- About-the-author: `metadata.authors[0]` name + (if present in metadata) bio/photo. **Note:** web enriches author bio/photo from Open Library server-side. Open Library is keyless, but to avoid client-side external calls now, render only what's in `metadata`; a full author enrichment screen is a follow-up.

**Verify:** tsc; **manual:** cast shows on movie/TV; author block on book. **Commit:** `feat(mobile): cast slider + about-the-author`.

### Task 1.4: Hybrid info area (seasons inline + tab strip)

**Files:** Create `apps/mobile/src/components/media/info-sections.tsx` (tab strip) and `apps/mobile/src/components/media/season-cards.tsx` (TV inline). Mirror web `media-info-tabs.tsx` content conditions.

- TV: **Seasons render inline** above the tab strip — season cards (poster, "Season N", "M episodes · date", overview w/ show-more).
- Tab strip (horizontal, scrollable): Crew · Details · Genres · Releases · Alternative titles — each tab shows only if `metadata` has the data (same conditions as web). Games get a Platforms tab. Selected tab uses the accent underline (web parity).

**Verify M1:** tsc; **manual:** each media type shows the right tabs/sections; TV seasons inline; long text doesn't overflow; everything clears the navbar. **Commit:** `feat(mobile): hybrid info area (inline seasons + info tab strip)`.

---

## Milestone 2 — Per-type tracking (core rebuild)

End state: from the detail screen, the **inline action strip** + **bottom-sheet log flows** give every media type its web-equivalent tracking, writing the correct `user_media` shapes. Replaces the domain-wrong `tracking-panel.tsx`. Optimistic where it matters. Movie built first as the reference, then TV/book/game inherit the same components.

### Task 2.1: Bottom-sheet infrastructure (native deps + provider)

**Files:** `apps/mobile/package.json` (via `npx expo install @gorhom/bottom-sheet react-native-reanimated react-native-gesture-handler`), `babel.config.js` (add `react-native-reanimated/plugin` — must be LAST), `apps/mobile/src/components/providers.tsx` (wrap the tree in `GestureHandlerRootView` + `BottomSheetModalProvider`), `apps/mobile/src/app/_layout.tsx` if the root wrapper is there. Create a reusable `apps/mobile/src/components/sheet/app-sheet.tsx` wrapping `BottomSheetModal` with the Intertaind surface styling (grab handle, near-black bg, keyboard-aware) so every flow shares one chrome.

> Verify @gorhom v5 + reanimated versions against Expo SDK 56 (`npx expo install` picks compatible ones). Reanimated needs the babel plugin + a native rebuild. `GestureHandlerRootView` must wrap the app root.

**Verify:** **native rebuild** (`expo run:ios`), then a throwaway sheet opens/closes with a grab handle and works with the keyboard. **Commit:** `feat(mobile): bottom-sheet infra (@gorhom + reanimated + gesture-handler)`.

### Task 2.2: Progress builders + read-merge-write mutations (TDD where pure)

**Files:** Create `packages/types/src/progress.ts` (+ `progress.test.ts`), re-export from index. Create `apps/mobile/src/queries/progress.ts`.

- Pure builders in `@intertaind/types` (TDD): `buildMovieProgress`, `buildBookProgress`, `buildGameProgress`, and TV helpers `addWatchedEpisode(progress, s, e)`, `setEpisodeLog(progress, s, e, {rating,review})`, `setSeasonLog(progress, s, {rating,review,completed})` — each takes the EXISTING progress and returns a MERGED copy. Cover the merge cases (adding an episode preserves others; setting sub_shelf preserves `custom_cover_url`).
- `queries/progress.ts`: **read-merge-write** mutations that FRESH-READ the row's `progress`, merge via the builders, then update — mirroring web's `updateBookPage`/`setCustomCover`/`setCustomBackdrop`. **Never merge from an `OPTIMISTIC_ID` row or stale cache** (the PROGRESS-REPLACEMENT LANDMINE: a naive `progress: {...}` upsert wipes sibling keys).

**Verify:** `pnpm --filter @intertaind/types test`; tsc mobile. **Commit:** `feat: merged progress builders (@intertaind/types) + read-merge-write progress mutations`.

### Task 2.3: Config-driven action strip (replaces tracking-panel)

**Files:** Create `apps/mobile/src/components/media/action-strip.tsx` + `apps/mobile/src/components/media/tracking-config.ts` (the per-type grammar table above). **Delete/replace** `tracking-panel.tsx` usage in the detail screen.

- One component; `tracking-config.ts` maps `media_type → { statusActions[], listLabel, logButton(s), logSheet }`. Renders: status action(s) (labeled pill for word-y states, e.g. "Watched"/"Reading"; game → a status dropdown/sheet), Loved (heart, pink when active), List (bookmark), inline `StarRating`, full-width **Log/Review** button(s), full-width **Intertain** CTA, and a secondary row (Show activity · Change backdrop/cover). Colors from the grammar. Seed from `useViewerTracking`; disable during pending/remove; a11y labels; no raw error text.
- Wire one-tap actions to the existing `queries/tracking.ts` mutations (status via `useTrackMediaMutation`, Loved via `useToggleFavoriteMutation`, list via track with `status:"want"`, rating via `useRateMediaMutation`). Log buttons open the sheets (2.4–2.7).

**Verify:** tsc; **manual (movie):** Watched toggles green + persists; Loved toggles pink; Watchlist sets want; inline rating persists (`user_media.rating===stars*2`); reopen reflects all. **Commit:** `feat(mobile): config-driven per-type action strip (replaces tracking panel)`.

### Task 2.4: Movie log sheet (the reference flow)

**Files:** Create `apps/mobile/src/components/media/sheets/movie-log-sheet.tsx`. Mirror `movie-modal.tsx`.

Fields: Watched-on date, "I've watched this before" (rewatch), rating (StarRating), review, Loved toggle, Save. One write via `useTrackMediaMutation`: `status:"completed"`, `rating`, `review`, `is_favorite`, `progress:{watched_on,is_rewatch}` (merged), `completed_at` = watched_on. This is the LOCKED design reference — nail spacing/typography/colors here.

**Verify:** tsc; **manual:** open sheet, fill everything, Save → all fields persist in one `user_media` row; reopen shows them. **Commit:** `feat(mobile): movie log/review bottom sheet (design reference)`.

### Task 2.5: Book flows

**Files:** `apps/mobile/src/components/media/sheets/book-log-sheet.tsx` (two-step Finished/DNF → rating/review, Loved on Finished) + `current-reading-sheet.tsx` (date started, current_page, total_pages, is_reread). Mirror `book-modal.tsx` + `current-reading-modal.tsx`. Read/Reading status actions open these. `Read`→`status:"completed"|"dropped"` + `progress.sub_shelf:"finished"|"dnf"`; `Reading`→`in_progress` + `progress.sub_shelf:"currently_reading"` + page fields + `started_at`. Page updates use the silent read-merge-write progress mutation.

**Verify:** tsc; **manual:** finished vs DNF write correct status + sub_shelf; currently-reading writes pages without wiping other keys. **Commit:** `feat(mobile): book tracking flows (read/DNF + currently reading)`.

### Task 2.6: TV flows

**Files:** `.../sheets/tv-log-season-sheet.tsx` (two-step: select season "N/M logged" → rating/review/Save season), `tv-log-episode-sheet.tsx` (season chips → episode grid → episode rating/review → Save), `current-episode-sheet.tsx` (set current pointer, mark prior episodes watched). Mirror `tv-modal.tsx`/`log-episode-modal.tsx`/`current-episode-modal.tsx`. Writes use the TV merge helpers (2.2): `seasons[N]`, `watched_episodes[S]`, `episode_logs[S][E]`, `current_season/episode`; recompute the aggregate `rating` from logged seasons as web does; auto-complete the show when all seasons logged. Purple selected-state for season/episode pickers.

**Verify:** tsc; **manual:** log a season and an episode; confirm `progress` grows without clobbering; current-episode marks priors watched. **Commit:** `feat(mobile): TV season + episode logging flows`.

### Task 2.7: Game flow

**Files:** `.../sheets/game-log-sheet.tsx` + a `game-status-dropdown` (sheet or menu) for the 6 sub-statuses. Mirror `game-modal.tsx`. Dropdown/sheet sets `progress.sub_status` (+ mapped `status`) immediately; `Log game…` sets sub_status + `hours_played` + rating + review + Loved; rating-with-no-sub_status promotes to `played`. `started_at` when playing, `completed_at` when completed/played.

**Verify M2:** tsc; **manual per type** — every control writes the web-matching `user_media`/`progress` shape (check in Supabase); optimistic one-taps update instantly and roll back on forced error. **Commit:** `feat(mobile): game tracking flow (sub-status + hours)`.

---

## Milestone 3 — Activity logging via Postgres trigger

End state: `user_media` INSERT/UPDATE/DELETE auto-writes the correct `activity_log` row for BOTH clients; web's client-side inserts are removed so nothing double-logs.

> **Land together in one migration + web change** (trigger without removing web inserts = double log; removing without trigger = web loses activity).

> **Notes from Task 2.3 review:** (a) Mobile writes `started_at`/`completed_at` from the DEVICE clock — consider stamping these transitions server-side in this migration; verify whether `user_media` has any `updated_at` trigger. (b) Land the `user_media.rating` CHECK constraint (Follow-ups) in the same pass.

### Task 3.1: Trigger migration

**Files:** Create `supabase/migrations/0XX_user_media_activity_trigger.sql` (next number — `ls supabase/migrations`). Port web's `actions/media.ts` activity conditions into a `plpgsql` trigger on `user_media`:
- **AFTER INSERT:** `review` present → `reviewed`; else `status=completed` → `completed`; else `added_to_shelf`. (VERIFY whether web emits a separate `rated` on first-track-with-rating; match and document inline.)
- **AFTER UPDATE (OLD/NEW diff, web priority):** `reviewed` if review newly non-empty & changed; else `status_changed`/`completed` if `status` OR `progress->>'sub_status'` changed; else `rated` if `rating` → non-null; else `favorited` if `is_favorite` → true. **Silent** for: unfavorite, rating→null, progress-only changes that don't change sub_status (page turns, hours, dates). **TV logging:** emit `logged_season`/`logged_episode` when `progress.seasons`/`watched_episodes`/`episode_logs` grow (coordinate with M2.6 — this is the main progress-driven event). VERIFY exact web behavior for re-review.
- **AFTER DELETE:** `removed` with `metadata.previous_status = OLD.status`.
- Every row: `user_id`, `media_id`, `activity_type`, `metadata` as web sets it. `SECURITY DEFINER`, `SET search_path = public`.

> Hardest task. Read web's exact conditions; replicate literally. Where a mobile granular flow emits several rows vs web's one combined row, document it in the migration comment and confirm no odd feed duplicates.

### Task 3.2: Remove web's client-side logging

**Files:** `apps/web/src/app/actions/media.ts` — delete the `activity_log` insert blocks from `trackMedia`/`updateTrackingStatus`/`rateMedia`/`toggleFavorite`/`reviewMedia`/`removeTracking`. Keep `user_media` writes. If any `activity_type_override` (logged_season/episode) can't be inferred by the trigger, encode it via a convention or keep a minimal explicit insert ONLY for that, documented. Prefer the trigger handling everything.

### Task 3.3: Apply, regen types, verify both platforms

- Jess applies the migration (agent prepares SQL + the exact apply command; do NOT assume DB creds).
- `pnpm gen:types` → commit regenerated `packages/supabase/src/database.types.ts` with the migration.
- **SQL verify:** insert→`added_to_shelf`; status update→`status_changed`; rating→`rated`; review→`reviewed`; favorite→`favorited`; TV log→`logged_season`/`logged_episode`; delete→`removed`(+previous_status). Compare to web.
- **Web:** `pnpm --filter web build`; track on web → exactly one row.
- **Mobile:** track on mobile → same row appears (previously none).

**Commit:** `feat(db): activity_log via user_media trigger; drop web client-side logging`.

---

## Milestone 4 — Intertain-friends flow + display extras

End state: the headline recommend flow works on mobile, and the detail page's display widgets are built (small ones) or recorded as follow-up plans (large ones).

### Task 4.1: Intertain-friends recommend sheet (headline feature)

**Files:** Create `apps/mobile/src/components/media/sheets/intertain-sheet.tsx`, `apps/mobile/src/queries/recommendations.ts`, a media search query in `queries/media.ts`. Mirror web "Intertain Your Friends" + `createRecommendation`.

- Sheet: SOURCE = current media (poster + title); a **target search** input (`media_items` `.ilike('title', %q%)` across all types — no server secret; debounce; exclude the source id); optional NOTE (≤280). Submit → `insert` into `recommendations {user_id, source_media_id, recommended_media_id, note}` under `recommendations_insert_self`. Handle the `unique_rec`/`no_self_recommend` constraints gracefully. Invalidate the media detail + any recs query.

**Verify:** tsc; **manual:** search a target, add a note, submit → row in `recommendations`; `media_items.recommendations_count` increments (trigger); duplicate/self are blocked with a friendly message. **Commit:** `feat(mobile): Intertain-friends recommend flow`.

### Task 4.2: Ratings histogram

**Files:** `apps/mobile/src/components/media/ratings-histogram.tsx` + a counts query. Mirror web `ratings-histogram.tsx` (10 buckets 0.5–5.0, total, average). Query `user_media.rating` for the media, bucket in JS (or an RPC if perf needs it later). Render bars with react-native-svg + the big average number. Gate on `rating_count>0`.

**Verify:** tsc; **manual:** distribution + average render and match web. **Commit:** `feat(mobile): ratings histogram`.

### Task 4.3: Recommendations section + series graph (books)

**Files:** `apps/mobile/src/components/media/recommendations-section.tsx` (two-direction "Pairs with" / "Intertain for", top-5 each via `fetchRecommendationsForSource/Target` mirrors) and `series-graph.tsx` (books w/ `series_id` + ≥2 rated siblings; svg line of sibling `avg_rating`, current highlighted). Uses `useSeriesSiblings` (1.1). Recommendation cards route to `media/[id]`.

**Verify:** tsc; **manual:** recs show both directions on a media with pairings; series graph shows for a Mistborn-style book. **Commit:** `feat(mobile): recommendations section + book series graph`.

### Task 4.4: Change cover/backdrop + Show-activity (enumerate; build or record)

- **Change cover (book) / backdrop (movie/TV/game):** selection from the media's available `metadata` image URLs (NOT upload) → `progress.custom_cover_url`/`custom_backdrop_url` via read-merge-write. Lower priority — build if quick, else record.
- **Show your activity:** a per-media activity list screen (mirror web `media/[id]/activity`). New route + query.
- **Season-ratings graph (TV):** ⚠️ web sources per-episode `vote_average` from **TMDB (server secret)** → **BLOCKED until Edge Functions** (deferred Phase 4). Record as follow-up; do NOT attempt client-side TMDB calls. (A user-only variant from `episode_logs` is possible later.)
- **Cast/people & author enrichment screens:** new routes (`person`/`author`/`entity`) + external enrichment → their own follow-up plan.

**Commit per built item.** Record the rest in Follow-ups.

---

## Follow-ups (record, don't lose)

- **Tab SET brainstorm** — decide the final navbar tabs (Trending/Explore + Profile/Search/Activity? center Intertain CTA?) — a dedicated brainstorm before adding tabs.
- **Season-ratings graph (TV)** — needs TMDB via Edge Functions (server secret). Blocked until the external-API layer moves to `supabase/functions/`.
- **Cast/people, author, entity detail screens** — new routes + external enrichment; own plan.
- **Recommendations engine** — the algorithmic cross-media rec engine (the product's headline differentiator) is separate from the manual Intertain pairings; own plan.
- **Change cover/backdrop upload** vs selection — web's picker sources; revisit when image UX matters.
- **Offline/queue** for tracking mutations (TanStack persistence).
- **Web `avg_rating` scale bug (pre-existing):** `media-card.tsx` passes 0–5 `avg_rating` into a display that ÷2 again — cards show half the true rating. Fix web-side.
- **Deep-link handling:** M0 puts tabs beneath detail; still handle signed-out deep links through the login gate (preserve+restore intended route).
- **expo-image import guardrail:** ESLint `no-restricted-imports` for `expo-image` (allow `components/image.tsx`); delete unused Expo-template leftovers.
- **`queryKeys.activity.feed()` userId segment** when personalized activity lands (per-viewer cache class; `queryClient.clear()` on sign-out backstops today).
- **CHECK constraint on `user_media.rating`** — none in repo migrations; add `CHECK (rating IS NULL OR (rating BETWEEN 1 AND 10 AND rating = floor(rating)))` (verify no violating rows first) — fold into M3's migration pass.
- **`updated_at` trigger on `user_media`** — verify existence; add if missing (M3).
