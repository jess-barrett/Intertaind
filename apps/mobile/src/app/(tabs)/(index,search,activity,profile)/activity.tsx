/**
 * ActivityScreen — the Activity bottom-tab. A segmented feed:
 *   - Friends: activity from the people you follow (actor shown), via
 *     `useFriendsActivityFeed` over the ids from `useFollowingIds`.
 *   - You: your own activity, reusing `useProfileActivityPage(user.id)`.
 *
 * Both are paginated infinite queries rendered through one generic
 * `InfiniteFeed` (loading / error / empty / footer-spinner + `onEndReached`
 * paging, guarded against double-fire). Headerless tab, so it reserves the TOP
 * safe-area itself and pads the list bottom by `useBottomInset()` to clear the
 * persistent navbar.
 *
 * Until the activity-writes trigger ships, feeds populate only from web-sourced
 * activity — a sparse/empty feed for a mobile-only user is EXPECTED.
 */
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { colors } from "@intertaind/design-system";

import { useAuth } from "@/components/auth-provider";
import { SegmentedControl } from "@/components/profile/segmented-control";
import { ActivityRow } from "@/components/profile/activity-row";
import { FeedActivityRow } from "@/components/activity/feed-activity-row";
import { useBottomInset } from "@/lib/use-bottom-inset";
import {
  useFollowingIds,
  useFriendsActivityFeed,
  type ActivityFeedRow,
} from "@/queries/activity";
import { useProfileActivityPage, type ProfileActivityRow } from "@/queries/profile";

const TABS = ["Friends", "You"] as const;
type Tab = (typeof TABS)[number];

/** The infinite-query fields the feed list drives (either scope satisfies it). */
type InfiniteFeedResult<T> = Pick<
  UseInfiniteQueryResult<{ pages: T[][] }>,
  "data" | "isPending" | "error" | "hasNextPage" | "isFetchingNextPage"
> & { fetchNextPage: () => void };

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Friends");

  const followingIds = useFollowingIds(user?.id);
  const friends = useFriendsActivityFeed(user?.id, followingIds.data);
  const you = useProfileActivityPage(user?.id);

  return (
    <View
      className="flex-1 bg-surface-default"
      style={{ paddingTop: insets.top + 12 }}
    >
      <View className="gap-3 px-4 pb-3">
        <Text className="text-2xl font-bold text-text-primary">Activity</Text>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {tab === "Friends" ? (
        followingIds.isError ? (
          <EmptyState message="Couldn't load your feed. Check your connection and try again." />
        ) : (
          <InfiniteFeed<ActivityFeedRow>
            query={friends}
            renderRow={(row) => <FeedActivityRow row={row} />}
            emptyMessage="Follow people to see their activity here."
            bottomInset={bottomInset}
          />
        )
      ) : (
        <InfiniteFeed<ProfileActivityRow>
          query={you}
          renderRow={(row) => <ActivityRow row={row} />}
          emptyMessage="You haven't logged anything yet."
          bottomInset={bottomInset}
        />
      )}
    </View>
  );
}

/** Generic paginated feed list — loading / error / empty / footer-spinner. */
function InfiniteFeed<T extends { id: string }>({
  query,
  renderRow,
  emptyMessage,
  bottomInset,
}: {
  query: InfiniteFeedResult<T>;
  renderRow: (row: T) => React.ReactElement;
  emptyMessage: string;
  bottomInset: number;
}) {
  const rows = query.data?.pages.flat() ?? [];

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors["text-muted"]} />
      </View>
    );
  }
  if (query.error) {
    return (
      <EmptyState message="Couldn't load this feed. Check your connection and try again." />
    );
  }
  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => renderRow(item)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View className="py-4">
            <ActivityIndicator color={colors["text-muted"]} />
          </View>
        ) : null
      }
    />
  );
}

/** A centered muted line — the empty / error body beneath the header. */
function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-sm text-text-muted">{message}</Text>
    </View>
  );
}
