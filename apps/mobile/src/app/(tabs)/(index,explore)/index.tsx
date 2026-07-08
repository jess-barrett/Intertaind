/**
 * HomeScreen — the personalized discovery home (the `(index)` tab anchor),
 * replacing the old flat Trending list. A vertical scroll of horizontal
 * poster rails (`MediaRail`), the RN analogue of web's homepage
 * (apps/web/src/app/page.tsx):
 *
 *   Continue → Recommended for you → Popular Movies/Shows/Books/Games.
 *
 * Each rail SELF-HIDES when its hook returns [] (see MediaRail), so a
 * signed-out or brand-new viewer simply sees fewer sections. All data comes
 * from the `@/queries/home` hooks (no inline supabase.from in the screen, per
 * apps/mobile/AGENTS.md).
 *
 * ── Loading / error gating ──────────────────────────────────────────────
 * The four Popular rails are the always-present core (public catalog, fetched
 * for every viewer), so the screen gates its loading/error on THEM: a spinner
 * while any Popular query is pending, the shared error block if one errors.
 * Continue/Recommended being empty (or even erroring) is NORMAL — they
 * self-hide — so they never block or fail the page.
 *
 * ── Viewer tracking overlay ─────────────────────────────────────────────
 * Every media id across all six rails is collected + de-duped into one array
 * and fed to `useViewerTrackingMap`, which returns the viewer's per-card
 * rating/heart for the whole page in ONE round trip. `onMutated` (passed to
 * every rail) invalidates that map plus the Continue row after a quick-action
 * write, so a card's active state — and a just-completed Continue item
 * leaving the rail — updates without a manual refresh.
 */
import { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/components/auth-provider";
import { MediaRail } from "@/components/media/media-rail";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { queryKeys } from "@/queries/keys";
import {
  useContinueTracking,
  usePopularMedia,
  useRecommendedForYou,
  useViewerTrackingMap,
  type HomeMediaItem,
  type ViewerTrackingState,
} from "@/queries/home";

/** Stable empty-list fallback so a pending/empty rail doesn't churn the
 *  `useMemo`/`useCallback` deps with a fresh `[]` each render. */
const EMPTY_ITEMS: HomeMediaItem[] = [];

/** Stable empty tracking map for the pre-fetch render (same rationale as
 *  EMPTY_ITEMS — avoid a fresh `new Map()` every render before data lands). */
const EMPTY_TRACKING_MAP = new Map<string, ViewerTrackingState>();

export default function HomeScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Reserve space so the last rail clears the persistent bottom navbar.
  const bottomInset = useBottomInset();

  // Continue + Recommended are viewer-derived (self-hide when empty / signed
  // out); the four Popular rails are the always-present public-catalog core.
  const continueQuery = useContinueTracking();
  const recommendedQuery = useRecommendedForYou();
  const popularMoviesQuery = usePopularMedia("movie");
  const popularShowsQuery = usePopularMedia("tv_show");
  const popularBooksQuery = usePopularMedia("book");
  const popularGamesQuery = usePopularMedia("video_game");

  // Reference the query `.data` directly (a STABLE reference across renders
  // while unchanged) and fall back to a shared EMPTY_ITEMS constant rather
  // than a fresh `[]` each render — so these derived lists don't churn the
  // `useMemo`/`useCallback` deps below.
  const continueItems = continueQuery.data ?? EMPTY_ITEMS;
  const recommended = recommendedQuery.data ?? EMPTY_ITEMS;
  const popularMovies = popularMoviesQuery.data ?? EMPTY_ITEMS;
  const popularShows = popularShowsQuery.data ?? EMPTY_ITEMS;
  const popularBooks = popularBooksQuery.data ?? EMPTY_ITEMS;
  const popularGames = popularGamesQuery.data ?? EMPTY_ITEMS;

  // Every media id across all six rails, de-duped, for the single batched
  // viewer-tracking read. Memoized so the derived array (and thus the
  // trackingMap query key) stays stable across renders when the data hasn't
  // changed. (ContinueItem carries the same `id` field as HomeMediaItem.)
  const allIds = useMemo(
    () => [
      ...new Set(
        [
          ...continueItems,
          ...recommended,
          ...popularMovies,
          ...popularShows,
          ...popularBooks,
          ...popularGames,
        ].map((item) => item.id)
      ),
    ],
    [
      continueItems,
      recommended,
      popularMovies,
      popularShows,
      popularBooks,
      popularGames,
    ]
  );

  const viewerQuery = useViewerTrackingMap(allIds);
  const trackingMap = viewerQuery.data ?? EMPTY_TRACKING_MAP;

  // After a card's quick-action write, refresh the batched tracking map (so
  // the card's rating/heart update) AND the Continue row (a completed
  // in-progress item leaves Continue). Both are keyed by user.id — no-op when
  // signed out (the maps aren't fetched then anyway).
  const onMutated = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.user.trackingMap(user.id, allIds),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.user.continue(user.id),
    });
  }, [queryClient, user, allIds]);

  // Loading / error gate on the always-present Popular core only.
  const popularPending =
    popularMoviesQuery.isPending ||
    popularShowsQuery.isPending ||
    popularBooksQuery.isPending ||
    popularGamesQuery.isPending;
  const popularError =
    popularMoviesQuery.error ??
    popularShowsQuery.error ??
    popularBooksQuery.error ??
    popularGamesQuery.error;

  if (popularPending) return <ActivityIndicator className="flex-1" />;
  if (popularError) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-default px-6">
        <Text className="text-text-primary">Couldn&apos;t load home.</Text>
        <Text className="mt-1 text-xs text-text-muted">
          {popularError.message}
        </Text>
      </View>
    );
  }

  // True only after the Popular core has loaded and every rail is empty (a
  // brand-new viewer against an empty catalog) — surface a muted line so the
  // screen isn't just a bare header.
  const allEmpty =
    continueItems.length === 0 &&
    recommended.length === 0 &&
    popularMovies.length === 0 &&
    popularShows.length === 0 &&
    popularBooks.length === 0 &&
    popularGames.length === 0;

  return (
    <ScrollView
      className="flex-1 bg-surface-default"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomInset }}
    >
      {/* Minimal, static welcome header. No profile/name read here — the
          Profile milestone owns profile reads. */}
      {/* TODO(profile): personalized greeting once a profile hook lands */}
      <View className="px-4 pb-4">
        <Text className="text-2xl font-bold text-text-primary">Home</Text>
        <Text className="mt-0.5 text-sm text-text-muted">
          Your cross-media picks
        </Text>
      </View>

      <MediaRail
        title="Continue"
        items={continueItems}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />
      <MediaRail
        title="Recommended for you"
        items={recommended}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />
      <MediaRail
        title="Popular Movies"
        items={popularMovies}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />
      <MediaRail
        title="Popular Shows"
        items={popularShows}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />
      <MediaRail
        title="Popular Books"
        items={popularBooks}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />
      <MediaRail
        title="Popular Games"
        items={popularGames}
        trackingMap={trackingMap}
        onMutated={onMutated}
      />

      {allEmpty ? (
        <Text className="px-4 text-sm text-text-muted">Nothing here yet.</Text>
      ) : null}

      {/* Popular Lists rail deferred: no list-detail route on mobile yet, so
          list cards would dead-end. usePopularLists stays unused until a
          later milestone mounts a list-detail route. */}
    </ScrollView>
  );
}
