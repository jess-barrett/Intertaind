/**
 * Centralized query-key factory for TanStack Query.
 *
 * Every query in the app uses a key from this object. The shape is
 * hierarchical so any level can be invalidated with a single call:
 *
 *   // invalidate just one media item
 *   queryClient.invalidateQueries({ queryKey: queryKeys.media.detail(id) });
 *
 *   // invalidate every media-related query
 *   queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
 *
 * Why a factory and not inline arrays:
 *   1. Single source of truth — renaming or restructuring keys touches
 *      one file, not every query hook.
 *   2. Type safety — `as const` preserves the literal types so TS can
 *      narrow on key shape downstream (useful when writing custom
 *      cache-update helpers).
 *   3. Hierarchical invalidation by construction — every leaf key is
 *      built by spreading its parent, so `media.detail(id)` is always
 *      a subset of `media.all`. Invalidating the parent invalidates
 *      every descendant automatically.
 *
 * Naming: `<resource>.<view>(...args?)`. `all` is reserved for the
 * resource-level umbrella key.
 */

export const queryKeys = {
  media: {
    all: ["media"] as const,
    trending: () => [...queryKeys.media.all, "trending"] as const,
    // Top-tracked catalog for one media type — the home screen's "Popular
    // Movies/Shows/Books/Games" rails. No user in the key: public catalog
    // data (RLS-anon), identical for every viewer, so it's shared and works
    // pre-auth. Keyed by mediaType so the four rails cache independently.
    popular: (mediaType: string) =>
      [...queryKeys.media.all, "popular", mediaType] as const,
    detail: (mediaId: string) =>
      [...queryKeys.media.all, "detail", mediaId] as const,
    // The signed-in viewer's own user_media row for one item. Kept
    // separate from `detail` so tracking mutations can invalidate the
    // viewer's row without refetching the (heavier) media item itself.
    // Keyed by userId too: this is per-viewer data, and a media-only
    // key would serve user A's cached row to user B after an account
    // switch within staleTime.
    viewerTracking: (userId: string, mediaId: string) =>
      [...queryKeys.media.all, "viewer-tracking", userId, mediaId] as const,
    // Every media item sharing a series_id — the books series graph
    // (M4) reads siblings this way. Keyed by seriesId so switching
    // series doesn't serve a stale sibling set.
    bySeries: (seriesId: string) =>
      [...queryKeys.media.all, "by-series", seriesId] as const,
  },
  user: {
    all: ["user"] as const,
    profile: (userId: string) =>
      [...queryKeys.user.all, userId, "profile"] as const,
    shelves: (userId: string, mediaType?: string) =>
      mediaType
        ? ([...queryKeys.user.all, userId, "shelves", mediaType] as const)
        : ([...queryKeys.user.all, userId, "shelves"] as const),
    activity: (userId: string) =>
      [...queryKeys.user.all, userId, "activity"] as const,
    // The viewer's in-progress titles — the home "Continue" row. Deliberately
    // nested UNDER the `shelves(userId)` prefix (["user", userId, "shelves",
    // "continue"]) so the tracking mutations' existing
    // `invalidateQueries(user.shelves(userId))` (tracking.ts) — a prefix
    // match — also refreshes this row when the viewer starts/finishes/updates
    // an item. That's the whole reason it's not a sibling "continue" segment:
    // it lets Continue react to tracking writes WITHOUT touching tracking.ts.
    continue: (userId: string) =>
      [...queryKeys.user.all, userId, "shelves", "continue"] as const,
    // Cross-media "recommended for you" — recs seeded from the viewer's own
    // tracked media (see home.ts). Per-viewer (derived from their tracking),
    // so keyed by userId; "anon" placeholder never fetches (enabled: !!user).
    recommendedForYou: (userId: string) =>
      [...queryKeys.user.all, userId, "recommended-for-you"] as const,
    // The viewer's tracking rows for an ARBITRARY set of media ids — powers
    // per-card rating/heart across every home rail (mirrors web's batched
    // viewer-tracking read). Keyed by userId + a STABLE signature of the id
    // set (sorted, de-duped, joined) so it refetches when the set changes but
    // stays stable across renders that pass the same ids in any order.
    trackingMap: (userId: string, mediaIds: string[]) =>
      [
        ...queryKeys.user.all,
        userId,
        "tracking-map",
        [...new Set(mediaIds)].sort().join(","),
      ] as const,
  },
  person: {
    all: ["person"] as const,
    // Catalog data for one person (bio + credits), keyed by TMDB id — no
    // user in the key, so it's shared across viewers. tmdb_id is the
    // stable natural key the person Edge Function enriches against.
    detail: (tmdbId: number) =>
      [...queryKeys.person.all, "detail", tmdbId] as const,
    // The signed-in viewer's tracking rows for this person's
    // catalog-linked titles (status/rating/is_favorite per media_id). The
    // screen derives the watched set AND each card's rating/heart from it.
    // Per-viewer, so keyed by userId too (a person-only key would serve
    // user A's tracking to user B after an account switch within staleTime);
    // "anon" placeholder keeps the key stable while signed out but never
    // fetches (see usePersonTracking).
    tracking: (userId: string, tmdbId: number) =>
      [...queryKeys.person.all, "tracking", userId, tmdbId] as const,
    // Catalog aggregate (community avg_rating) for this person's
    // catalog-linked titles — the fallback the card shows when the viewer
    // hasn't rated a title. Public catalog data, so NO user in the key:
    // shared across viewers and works pre-auth.
    mediaMeta: (tmdbId: number) =>
      [...queryKeys.person.all, "media-meta", tmdbId] as const,
  },
  activity: {
    all: ["activity"] as const,
    feed: () => [...queryKeys.activity.all, "feed"] as const,
  },
  search: {
    all: ["search"] as const,
    // Cross-source media search (the `media-search` Edge Function), keyed
    // by the trimmed query + type scope. No user in the key — the search is
    // catalog data over external APIs, identical for every viewer. The
    // CALLER debounces the query string before it reaches this key, so the
    // cache stores stable (settled) queries, not every keystroke.
    media: (query: string, type: string) =>
      [...queryKeys.search.all, "media", query, type] as const,
  },
  recommendations: {
    all: ["recommendations"] as const,
    // Recs WHERE this media is the SOURCE — the "Pairs with this" list on
    // the media detail screen (the recommended target is what's rendered).
    // Keyed by mediaId; no user in the key — this is public catalog data
    // (RLS-filtered to public authors), shared across viewers.
    forSource: (mediaId: string) =>
      [...queryKeys.recommendations.all, "for-source", mediaId] as const,
    // Recs WHERE this media is the RECOMMENDED target — the inverse
    // "Intertaind for this" list (the source is what's rendered). Same
    // no-user, public-data keying as forSource.
    forTarget: (mediaId: string) =>
      [...queryKeys.recommendations.all, "for-target", mediaId] as const,
  },
  lists: {
    all: ["lists"] as const,
    // Public lists ranked by like_count — the home "Popular Lists" rail
    // (mirrors web's page.tsx read). No user in the key: public data
    // (RLS-scoped to public visibility), shared across viewers, works
    // pre-auth. Includes the batched cover previews (see usePopularLists).
    popular: () => [...queryKeys.lists.all, "popular"] as const,
  },
} as const;
