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
    viewerTracking: (mediaId: string) =>
      [...queryKeys.media.all, "viewer-tracking", mediaId] as const,
    bySeries: (seriesId: string) =>
      [...queryKeys.media.all, "series", seriesId] as const,
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
  activity: {
    all: ["activity"] as const,
    feed: () => [...queryKeys.activity.all, "feed"] as const,
  },
} as const;
