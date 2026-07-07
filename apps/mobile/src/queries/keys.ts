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
  },
  person: {
    all: ["person"] as const,
    // Catalog data for one person (bio + credits), keyed by TMDB id — no
    // user in the key, so it's shared across viewers. tmdb_id is the
    // stable natural key the person Edge Function enriches against.
    detail: (tmdbId: number) =>
      [...queryKeys.person.all, "detail", tmdbId] as const,
    // The signed-in viewer's watched set among this person's
    // catalog-linked films. Per-viewer, so keyed by userId too (a
    // person-only key would serve user A's watched set to user B after an
    // account switch within staleTime); "anon" placeholder keeps the key
    // stable while signed out but never fetches (see usePersonWatched).
    watched: (userId: string, tmdbId: number) =>
      [...queryKeys.person.all, "watched", userId, tmdbId] as const,
  },
  activity: {
    all: ["activity"] as const,
    feed: () => [...queryKeys.activity.all, "feed"] as const,
  },
} as const;
