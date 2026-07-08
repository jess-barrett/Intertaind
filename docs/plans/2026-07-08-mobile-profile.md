# Mobile User Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:subagent-driven-development to implement this plan milestone-by-milestone (fresh subagent per task + spec + code-quality review). Verification is `pnpm --filter mobile typecheck` + `lint` (RN screens aren't unit-tested; the pure query/format helpers can be).

**Goal:** Build the mobile user-profile experience — the viewer's own profile (the `(profile)` bottom tab) and any other user's profile (a shared `u/[username]` route) — as one `ProfileView`: a header + an in-screen segmented control (Overview · Shelves · Recs · Lists), mirroring web's `/u/[username]`.

**Architecture:** One shared `ProfileView` component drives both entry points. The `(profile)` tab anchor renders it for the signed-in user (identity from `useAuth`); a new shared route `u/[username].tsx` (in the array-group folder, extrapolated into all four tab stacks like `media/[id]`/`person/[id]`) renders it for anyone else. Web splits the profile into 11 sub-routes; mobile collapses the primary four into ONE screen with a segmented control (the "Hybrid" brainstorm decision), and pushes Followers/Following/full-Activity/full-Reviews as separate sub-screens (M6). All reads are anon/authed Supabase-JS under RLS — no Edge Function, no server secret. `isOwner = viewer.id === profile.id` gates settings-vs-follow and private-empty-state.

**Tech Stack:** Expo Router v6 (shared array-group routes), NativeWind 4, TanStack Query v5 (`src/queries/`), `@intertaind/supabase` types, `@intertaind/types` (`Profile`, `TOP_4_SHELF_NAMES`, `MEDIA_TYPE_CONFIG`), lucide-react-native, the existing `MediaCard` + `cardMediaFromHomeItem`, `useViewerTrackingMap`.

---

## Key decisions & conventions

- **One `ProfileView({ userId?, username? })`** — exactly one identifier is passed. The `(profile)` tab passes `userId={user.id}` (from `useAuth`); `u/[username]` passes `username`. The component resolves the `profiles` row, derives `profileUserId` + `isOwner`, and renders header + segmented content. Everything downstream keys off `profileUserId`.
- **Segmented control is in-screen state**, not nested routes: `Overview | Shelves | Recs | Lists`. The screen is a single `ScrollView`/`FlatList` whose body swaps with the active segment. (Shelves has its own inner per-type + status sub-tabs.)
- **All new hooks live in `src/queries/profile.ts`** (new), following the house conventions (`Pick<Tables<...>>` explicit selects, throw on error, `enabled` gates, keys from `queryKeys`). Extend `queryKeys.user.*` (some keys — `profile`/`shelves`/`activity` — are already scaffolded).
- **Reuse, don't rebuild:** `MediaCard` (via `cardMediaFromHomeItem` — the shelf/favorite rows are `media_items` rows) for all poster grids; `MEDIA_TYPE_CONFIG` + `MEDIA_TYPE_ICONS`/`MEDIA_TYPE_ICON_COLOR` for type chrome; the `recommendations.ts` embed pattern for M4; `ExpandableText` for the bio; `useBottomInset` + top safe-area (headerless).
- **`TOP_4_SHELF_NAMES`** (`@intertaind/types`, `__top5_<type>`) is the curated-favorites shelf-name convention — the Top-4 favorites are `shelves`/`shelf_items`, NOT `user_media.is_favorite`.

## Deferrals (call out; do NOT build in this plan)

- **Private-profile follower visibility & blocks** — RLS currently only exposes public profiles or the owner (migrations 004/007/008; the "followers-see-private" and block-aware reads are NOT DB-enforced — they were reverted in 008 and only applied in web server-code). v1: if `profile.is_private && !isOwner`, render a private empty state; do NOT attempt follower-peek or block filtering. Note it in code + here.
- **Saved (liked) Lists tab** — v1 Lists shows the owner's **created** lists only. `list_saves` "Saved" sub-tab is deferred.
- **List navigation** — there is no mobile list-detail route yet. List cards render (title/author/covers/counts) but are non-navigable in v1 (or a minimal list-detail is its own future task). Do NOT build list-detail here.
- **friends_unlisted lists** — depend on the `user_follows_user` SECURITY DEFINER; on a non-owner profile just don't surface non-public lists (RLS already hides them).

---

## Milestone M1 — Data layer + header + segmented shell

### Task 1.1: Profile query keys

**Files:**
- Modify: `apps/mobile/src/queries/keys.ts`

**Step 1:** Under `queryKeys.user`, add keys (mirror the existing hierarchical `as const` style; `profile`/`shelves`/`activity` already exist — keep them, add the rest):
```ts
byUsername: (username: string) => [...queryKeys.user.all, "by-username", username] as const,
mediaCounts: (userId: string) => [...queryKeys.user.all, userId, "media-counts"] as const,
topFours: (userId: string) => [...queryKeys.user.all, userId, "top-fours"] as const,
recentActivity: (userId: string) => [...queryKeys.user.all, userId, "recent-activity"] as const,
recentReviews: (userId: string) => [...queryKeys.user.all, userId, "recent-reviews"] as const,
shelf: (userId: string, mediaType: string, status: string) =>
  [...queryKeys.user.all, userId, "shelf", mediaType, status] as const,
recommendations: (userId: string) => [...queryKeys.user.all, userId, "recommendations"] as const,
lists: (userId: string) => [...queryKeys.user.all, userId, "lists"] as const,
followState: (viewerId: string, targetId: string) =>
  [...queryKeys.user.all, "follow-state", viewerId, targetId] as const,
followers: (userId: string) => [...queryKeys.user.all, userId, "followers"] as const,
following: (userId: string) => [...queryKeys.user.all, userId, "following"] as const,
```

**Step 2:** `pnpm --filter mobile typecheck` → PASS.
**Step 3:** Commit `feat(mobile): profile query keys`.

### Task 1.2: `useProfile` + media counts

**Files:**
- Create: `apps/mobile/src/queries/profile.ts`

**Step 1:** `ProfileRow = Pick<Tables<"profiles">, "id" | "username" | "display_name" | "avatar_url" | "bio" | "is_private" | "followers_count" | "following_count" | "created_at">`.

**Step 2:** `useProfile({ userId, username }: { userId?: string; username?: string })`:
- `enabled: !!(userId || username)`.
- Key: `userId ? queryKeys.user.profile(userId) : queryKeys.user.byUsername(username!)`.
- Query: `supabase.from("profiles").select(<cols>)` then `.eq("id", userId)` OR `.eq("username", username)`, `.single()`. Throw on error EXCEPT PGRST116 (no row → return `null`, so a private/missing profile renders an empty state rather than throwing).

**Step 3:** `useProfileMediaCounts(userId)` → `{ movie; tv_show; book; video_game }`:
- `enabled: !!userId`. Four counts via `Promise.all`, each `supabase.from("user_media").select("id, media_items!inner(media_type)", { count: "exact", head: true }).eq("user_id", userId).eq("media_items.media_type", <type>)` with `.neq("status","want")` for movie/tv_show/video_game and no `neq` for book (per web). Return the four counts.

**Step 4:** typecheck + lint. Commit `feat(mobile): useProfile + media counts hooks`.

### Task 1.3: Profile header

**Files:**
- Create: `apps/mobile/src/components/profile/profile-header.tsx`

**Step 1:** `ProfileHeader({ profile, counts, isOwner })`:
- Avatar (`profile.avatar_url` via `@/components/image`, circular; fallback = first letter of username on a `surface-overlay` circle).
- Display name (`display_name ?? username`), `@username`, bio (`ExpandableText`, ~3 lines).
- Followers / Following counts (tappable → M6 sub-screens; for now `onPress` no-ops with a TODO).
- Four media-type counts (icon + number), using `MEDIA_TYPE_ICON_COLOR` + `MEDIA_TYPE_ICONS`.
- Right action: `isOwner` → a settings gear (no-op TODO until a settings screen); else a Follow button (wired in M6 — render disabled/placeholder now, or the `useFollowState`/mutations if 1.x is pulled forward). Keep the button visually present.

**Step 2:** typecheck + lint. Commit `feat(mobile): profile header`.

### Task 1.4: `ProfileView` shell + segmented control + both entry points

**Files:**
- Create: `apps/mobile/src/components/profile/profile-view.tsx`
- Create: `apps/mobile/src/components/profile/segmented-control.tsx` (a reusable 2–4 option pill segmented control; brand-accent active)
- Modify: `apps/mobile/src/app/(tabs)/(index,search,activity,profile)/profile.tsx` (render `<ProfileView userId={user.id} />` from `useAuth`; if no user, render nothing/spinner)
- Create: `apps/mobile/src/app/(tabs)/(index,search,activity,profile)/u/[username].tsx` (shared route → `<ProfileView username={useLocalSearchParams().username} />`)

**Step 1:** `ProfileView`:
- Resolve `useProfile(...)`. States: pending → spinner; `null`/error → "Profile not found" (or "This profile is private" when `is_private && !isOwner`); else render.
- `profileUserId = profile.id`; `isOwner = user?.id === profile.id` (from `useAuth`).
- Header + `<SegmentedControl options={["Overview","Shelves","Recs","Lists"]} value=... onChange=... />` + the active segment body (stub components for M2–M5, each self-fetching by `profileUserId`).
- Layout: a `ScrollView` with top safe-area inset (headerless tab anchor) + `useBottomInset`; the shared `u/[username]` route is inside the tab stacks (bar stays visible) — but it renders WITH a back affordance? It's pushed onto a tab stack; the tab Stack has `headerShown:false`, so add a minimal back button (reuse the media detail `BackPill`/floating pattern OR a simple top-left back). For the `(profile)` TAB anchor there's no back (it's a root tab) — so gate the back button on "is this the pushed route vs the tab." Simplest: `ProfileView` takes a `showBack?: boolean`; `u/[username]` passes `showBack`, the tab passes false.

**Step 2:** Wire the `(search)`/home/person/etc. → tapping a username/avatar anywhere `router.push('/u/' + username)`. (Not required to wire all call-sites now; just ensure the route resolves.)

**Step 3:** typecheck + lint; manual sim check (profile tab shows own header; `/u/<someusername>` shows theirs). Commit `feat(mobile): ProfileView shell + segmented control + profile tab + u/[username] route`.

> **Route note (AGENTS.md):** `u/[username].tsx` in the array-group folder becomes a shared route in all four tab stacks — good (a profile opens in the current tab). Confirm typed routes regenerate (`/u/[username]`), and restart Metro `--clear` after adding the file.

---

## Milestone M2 — Overview tab

### Task 2.1: Top-4 favorites hook

**Files:** Modify `apps/mobile/src/queries/profile.ts`

**Step 1:** `useProfileTopFours(userId)` → `Record<MediaType, HomeMediaItem[]>` (max 4 each):
- Read shelves: `supabase.from("shelves").select("id, name").eq("user_id", userId).in("name", Object.values(TOP_4_SHELF_NAMES))`.
- Read items: `supabase.from("shelf_items").select("shelf_id, position, media_items(<HomeMediaItem cols>)").in("shelf_id", shelfIds).order("position").limit(20)`.
- Group by which shelf → which `MediaType` (invert `TOP_4_SHELF_NAMES`), cap 4 per type, return the map. `enabled: !!userId`. Key `queryKeys.user.topFours(userId)`.

**Step 2:** typecheck + lint. Commit.

### Task 2.2: Recent activity + recent reviews hooks + activity-row renderer

**Files:** Modify `profile.ts`; Create `apps/mobile/src/components/profile/activity-row.tsx`; consider a shared `packages/` or local `formatActivity` pure helper (TESTABLE — write a vitest for the activity_type → sentence mapping).

**Step 1:** `ActivityRow = Pick<Tables<"activity_log">, "id"|"user_id"|"media_id"|"activity_type"|"metadata"|"created_at"> & { media: Pick<Tables<"media_items">,"id"|"title"|"cover_image_url"|"media_type"> | null }`.
**Step 2:** `useProfileRecentActivity(userId, limit=3)` and `useProfileRecentReviews(userId, limit=3)` (the latter adds `.eq("activity_type","reviewed")`). Select the join, `.eq("user_id",userId).order("created_at",{ascending:false}).limit(limit)`.
**Step 3:** `formatActivity(row)` pure helper → a human sentence per `activity_type` (added/completed/rated/reviewed/favorited/logged_episode/started_reading/…). Write `formatActivity.test.ts` (vitest) covering the main types. `ActivityRow` component renders cover thumbnail + sentence + relative time, tap → `/media/<media_id>`.
**Step 4:** typecheck + lint + `pnpm --filter mobile test` (if mobile has vitest; else put the helper + test in `@intertaind/types` or a shared package). Commit.

### Task 2.3: Overview segment

**Files:** Create `apps/mobile/src/components/profile/overview-tab.tsx`; wire into `ProfileView`.

**Step 1:** `OverviewTab({ userId })`: Top-4 favorites as four labeled 2×2 mini-grids (per type, `MediaCard` with `showMeta={false}` + `compact`, or a plain poster — favorites are catalog rows → `cardMediaFromHomeItem`); a "Recent activity" section (3 `ActivityRow`s); a "Recent reviews" section (3). Each section self-hides when empty. Empty overall → a muted "Nothing here yet."
**Step 2:** typecheck + lint; sim check. Commit `feat(mobile): profile Overview tab`.

---

## Milestone M3 — Per-type Shelves tab

### Task 3.1: Shelf hook + status model

**Files:** Modify `profile.ts`; Create `apps/mobile/src/components/profile/shelf-config.ts`

**Step 1:** `SHELF_CONFIG: Record<MediaType, { key; label; status; subStatus? }[]>` — the per-type sections from the web spec:
- movie: Watched (`completed`), Watchlist (`want`)
- tv_show: Watched (`completed`), Currently Watching (`in_progress`), Watchlist (`want`)
- book: Read (`completed`), Reading (`in_progress`), TBR (`want`), DNF (`dropped`)
- video_game: Played (`status != want`), Playing/Completed/Shelved/Retired/Abandoned (`progress->>sub_status` = playing/completed/shelved/retired/abandoned), Wishlist (`want`)

**Step 2:** `useProfileShelf(userId, mediaType, section)` → `HomeMediaItem[]` (+ the viewer-facing `user_media` bits if useful): `supabase.from("user_media").select("rating, is_favorite, progress, media_items!inner(<cols>)").eq("user_id",userId).eq("media_items.media_type",mediaType)` then apply the section filter (`.eq("status", …)` or `.neq("status","want")` for games-Played, or `.eq("progress->>sub_status", …)` for game sub-status), `.order("updated_at",{ascending:false})`, a sane limit (e.g. 60; pagination deferred). Key `queryKeys.user.shelf(userId, mediaType, section.key)`.

**Step 3:** typecheck + lint. Commit.

### Task 3.2: Shelves segment UI

**Files:** Create `apps/mobile/src/components/profile/shelves-tab.tsx`; wire into `ProfileView`.

**Step 1:** `ShelvesTab({ userId })`: an inner media-type selector (Movies/Shows/Books/Games — reuse the type-chip row from search or `SegmentedControl`) + a status-section selector (from `SHELF_CONFIG[type]`), then a poster grid of `MediaCard`s (`cardMediaFromHomeItem`, `showMeta`, 3-col fixed-width like search, or 2-col). Empty per section → muted line. Optionally overlay the VIEWER's own tracking via `useViewerTrackingMap(ids)` (so cards show the viewer's rating/heart when browsing someone else's shelf).
**Step 2:** typecheck + lint; sim check. Commit `feat(mobile): profile Shelves tab`.

> **Filters/sort (genre/decade) deferred** — web has them; v1 ships the status sections only. Note it.

---

## Milestone M4 — Recommendations tab

### Task 4.1: hook + segment

**Files:** Modify `profile.ts`; Create `apps/mobile/src/components/profile/recommendations-tab.tsx`

**Step 1:** `useProfileRecommendations(userId)` → the user's authored pairings: `supabase.from("recommendations").select("id, note, created_at, source_media:media_items!recommendations_source_media_id_fkey(<cols>), recommended_media:media_items!recommendations_recommended_media_id_fkey(<cols>)").eq("user_id",userId).order("created_at",{ascending:false}).limit(50)` (same FK-hint + `as unknown as` cast pattern as `src/queries/recommendations.ts`). Key `queryKeys.user.recommendations(userId)`.
**Step 2:** `RecommendationsTab({ userId })`: a list of pairing cards — source poster → recommended poster (both tap to detail), + the note. Reuse `MediaCard`/`cardMediaFromHomeItem` at a small size, or a compact two-poster row. Self-hide/empty state.
**Step 3:** typecheck + lint; sim check. Commit `feat(mobile): profile Recommendations tab`.

---

## Milestone M5 — Lists tab (created only)

### Task 5.1: hook + segment

**Files:** Modify `profile.ts`; Create `apps/mobile/src/components/profile/lists-tab.tsx` (reuse the `PopularListCard` shape/logic from `home.ts` if it generalizes — the cover-preview batching is identical).

**Step 1:** `useProfileLists(userId, isOwner)` → created lists + author + cover previews (mirror `usePopularLists`): `supabase.from("lists").select("id, title, description, item_count, like_count, saves_count, visibility, profiles!lists_user_id_fkey(<author cols>)").eq("user_id",userId)` + (`if !isOwner` → `.neq("visibility","private")`; RLS also enforces) `.order("updated_at",{ascending:false}).limit(50)`, then the batched `list_items → media_items(cover)` preview read. Key `queryKeys.user.lists(userId)`.
**Step 2:** `ListsTab({ userId, isOwner })`: list cards (cover collage + title + author + item/like counts). **Non-navigable in v1** (no list-detail route — add a TODO). Empty state.
**Step 3:** typecheck + lint; sim check. Commit `feat(mobile): profile Lists tab (created)`.

> **Deferred:** Saved lists sub-tab (`list_saves`), list-detail route, list navigation.

---

## Milestone M6 — Sub-screens (Followers / Following / full Activity / full Reviews) + follow

### Task 6.1: Follow state + mutations

**Files:** Modify `profile.ts`

**Step 1:** `useFollowState(targetUserId)` → `"self" | "none" | "following" | "requested"` (read `follows` for `(follower_id=viewer, following_id=target)`; `follow_requests` for pending; `self` when ids match). `useFollowMutation`/`useUnfollowMutation` (insert/delete `follows` under `follows_insert_self`-style RLS; handle private → `follow_requests`). Invalidate `followState` + the target's `followers` + the viewer's `following` + denormalized counts (`profile`). Wire the header Follow button (Task 1.3) to these.
**Step 2:** typecheck + lint. Commit.

### Task 6.2: Followers / Following list screens

**Files:** Modify `profile.ts` (`useFollowers`/`useFollowing`); Create shared routes `u/[username]/followers.tsx` + `u/[username]/following.tsx` (nested shared routes) OR `apps/mobile/src/app/(tabs)/(index,search,activity,profile)/u/[username]/followers.tsx`; a `UserRow` component (avatar + name + follow button).
**Step 1:** Hooks: `follows` join `profiles` (`follows_follower_id_fkey`/`follows_following_id_fkey`), `.eq("following_id"/"follower_id", userId).order("created_at",{ascending:false}).limit(50)`.
**Step 2:** Screens: a `FlatList` of `UserRow`, tap → `/u/<username>`. Wire header counts → these routes.
**Step 3:** typecheck + lint; sim check. Commit.

### Task 6.3: Full Activity + full Reviews screens

**Files:** Modify `profile.ts` (paginated `useProfileActivityPage`/`useProfileReviewsPage` — or `useInfiniteQuery`); Create `u/[username]/activity.tsx` + `u/[username]/reviews.tsx`.
**Step 1:** Paginate `activity_log` (all types; reviews filtered `activity_type='reviewed'`), `useInfiniteQuery` (PAGE_SIZE 20/10). Reuse `ActivityRow`.
**Step 2:** Wire Overview's "see all" → these routes.
**Step 3:** typecheck + lint; sim check. Commit.

---

## Final review

After M1–M5 (M6 optional/last), dispatch a final code-quality review across `src/queries/profile.ts`, the `components/profile/*`, and the routes, then use gli-toolkit:finishing-a-development-branch.

## Verification (every task)
- `pnpm --filter mobile typecheck` → PASS
- `pnpm --filter mobile lint` → clean (retry once on the `expo` spawn flake; fall back to `pnpm --filter mobile exec eslint .`)
- Pure helpers (`formatActivity`, shelf-section filters) → vitest where placed in a testable module.
- Manual sim check per screen (own profile via the tab; another user via `/u/[username]`).
- **USER steps:** none new (no migration / no Edge Function — all anon/authed Supabase). Metro `--clear` restart after adding the new route files.
