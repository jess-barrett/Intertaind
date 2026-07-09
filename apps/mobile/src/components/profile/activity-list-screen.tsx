/**
 * ActivityListScreen — the shared shell behind the full Activity AND full
 * Reviews sub-screens (M6b). Both are the SAME layout — a headerless top bar
 * (back pill + title) over a paginated `FlatList` of `ActivityRow` with loading
 * / empty / error states + a footer spinner while the next page loads —
 * differing only in title, empty copy, and which paginated hook feeds the list.
 * So the two route files (`u/[username]/activity.tsx` + `reviews.tsx`) each
 * resolve the profile by username, pick their `useInfiniteQuery` hook + copy,
 * and hand the resolved infinite-query result here. Mirrors how M6a extracted
 * `FollowListScreen` from its two follower/following routes.
 *
 * Pagination: the pages are flattened (`data.pages.flat()`) into one list;
 * `onEndReached` calls `fetchNextPage()` GUARDED by `hasNextPage &&
 * !isFetchingNextPage` (never double-fire mid-fetch or past the end). A footer
 * spinner shows only while a NEXT page is loading — the initial load uses the
 * full-screen spinner instead.
 *
 * Activity source note (deferred M3 backlog): mobile tracking does NOT yet WRITE
 * `activity_log` rows (the activity-trigger work is deferred — see
 * docs/plans/2026-07-08-mobile-profile.md). So today these feeds populate purely
 * from WEB-sourced activity; a sparse or empty feed for a mobile-only user is
 * EXPECTED, not a bug.
 *
 * Routing / safe-area (apps/mobile/AGENTS.md): these are pushed shared routes
 * inside the tab stacks (the persistent navbar stays visible; native/gesture
 * back returns within the tab). The per-tab Stack hides headers, so this
 * reserves the TOP safe-area itself and renders a translucent back pill — the
 * SAME affordance media detail + ProfileView + FollowListScreen use. The
 * FlatList pads its bottom by `useBottomInset()` so the last row clears the
 * persistent navbar.
 */
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { ActivityRow } from "@/components/profile/activity-row";
import { useBottomInset } from "@/lib/use-bottom-inset";
import type { ProfileActivityRow } from "@/queries/profile";

/** Height (pt) of the top-bar content row (back pill + title), sans safe area. */
const TOP_BAR_HEIGHT = 44;

/**
 * The paginated infinite-query result the activity/reviews routes hand in — the
 * `data.pages` (each a `ProfileActivityRow[]` page) plus the paging controls the
 * shell drives. Narrowed to just the fields used here so either
 * `useProfileActivityPage` / `useProfileReviewsPage` result satisfies it.
 */
type ActivityInfiniteResult = Pick<
  UseInfiniteQueryResult<{ pages: ProfileActivityRow[][] }>,
  "data" | "isPending" | "error" | "hasNextPage" | "isFetchingNextPage"
> & {
  fetchNextPage: () => void;
};

export function ActivityListScreen({
  title,
  emptyMessage,
  query,
}: {
  /** "Activity" / "Reviews". */
  title: string;
  /** Shown when the resolved feed is empty (not while loading). */
  emptyMessage: string;
  /** The paginated feed (from useProfileActivityPage/useProfileReviewsPage). */
  query: ActivityInfiniteResult;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  // Flatten every loaded page into one contiguous list for the FlatList.
  const rows = query.data?.pages.flat() ?? [];

  return (
    <View className="flex-1 bg-surface-default" style={{ paddingTop: insets.top }}>
      <TopBar title={title} />

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : query.error ? (
        <EmptyState message="Couldn't load this feed. Check your connection and try again." />
      ) : rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => <ActivityRow row={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bottomInset,
          }}
          // Prefetch the next page a bit before the true bottom; guard so we
          // never double-fire mid-fetch or once the last (short) page landed.
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              query.fetchNextPage();
            }
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View className="py-4">
                <ActivityIndicator color={colors["text-muted"]} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

/**
 * The headerless top bar — a centered title with the back pill overlaid on the
 * left (the SAME translucent affordance media detail + ProfileView +
 * FollowListScreen use), a solid bar with a hairline bottom border.
 */
function TopBar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View
      style={{ height: TOP_BAR_HEIGHT }}
      className="justify-center border-b border-surface-border"
    >
      <Text className="text-center text-base font-semibold text-text-primary">
        {title}
      </Text>
      <View className="absolute bottom-0 left-3 top-0 justify-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color={colors["text-primary"]} />
        </Pressable>
      </View>
    </View>
  );
}

/** A centered muted line — the empty / error body beneath the top bar. */
function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-sm text-text-muted">{message}</Text>
    </View>
  );
}
