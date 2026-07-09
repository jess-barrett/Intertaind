/**
 * FollowListScreen — the shared shell behind the Followers AND Following
 * sub-screens (M6a). Both are the SAME layout — a headerless top bar (back pill
 * + title) over a `FlatList` of `UserRow` with loading / empty / error states —
 * differing only in title, empty copy, and which hook feeds the list. So the
 * two route files (`u/[username]/followers.tsx` + `following.tsx`) each resolve
 * the profile by username, pick their hook + copy, and hand a resolved
 * `FollowListUser[]` query result here.
 *
 * Routing / safe-area (apps/mobile/AGENTS.md): these are pushed shared routes
 * inside the tab stacks (the persistent navbar stays visible; native/gesture
 * back returns within the tab). The per-tab Stack hides headers, so this
 * reserves the TOP safe-area itself and renders a translucent back pill — the
 * SAME affordance media detail + ProfileView use. The FlatList pads its bottom
 * by `useBottomInset()` so the last row clears the persistent navbar.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { UserRow } from "@/components/profile/user-row";
import { useBottomInset } from "@/lib/use-bottom-inset";
import type { FollowListUser } from "@/queries/profile";

/** Height (pt) of the top-bar content row (back pill + title), sans safe area. */
const TOP_BAR_HEIGHT = 44;

export function FollowListScreen({
  title,
  emptyMessage,
  query,
}: {
  /** "Followers" / "Following". */
  title: string;
  /** Shown when the resolved list is empty (not while loading). */
  emptyMessage: string;
  /** The resolved followers/following query (from useFollowers/useFollowing). */
  query: UseQueryResult<FollowListUser[]>;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const users = query.data ?? [];

  return (
    <View className="flex-1 bg-surface-default" style={{ paddingTop: insets.top }}>
      <TopBar title={title} />

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : query.error ? (
        <EmptyState message="Couldn't load this list. Check your connection and try again." />
      ) : users.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => <UserRow user={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset }}
        />
      )}
    </View>
  );
}

/**
 * The headerless top bar — a centered title with the back pill overlaid on the
 * left (the same translucent affordance media detail + ProfileView use). Not
 * scroll-fading here (the list has no full-bleed hero to fade over): a solid bar
 * with a hairline bottom border reads cleanly at rest.
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
