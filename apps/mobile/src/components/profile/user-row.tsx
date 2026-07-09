/**
 * UserRow — one entry in a Followers / Following list (the M6a sub-screens).
 * A circular avatar (letter fallback, matching ProfileHeader), the display name
 * + @username, and a whole-row press that pushes `/u/<username>` (opening that
 * profile in the CURRENT tab's stack — the shared-route convention). Data comes
 * in as a prop (`FollowListUser`, from `useFollowers`/`useFollowing`); the row
 * runs no inline supabase.
 *
 * Deferred (per docs/plans/2026-07-08-mobile-profile.md): a per-row follow
 * button. v1 keeps the row navigation-only to hold scope tight — the follow
 * affordance lives on each profile's own header for now.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Image } from "@/components/image";
import type { FollowListUser } from "@/queries/profile";

export function UserRow({ user }: { user: FollowListUser }) {
  const router = useRouter();
  const displayName = user.display_name ?? user.username;
  // Letter fallback for a missing avatar — first char of the username, upper
  // (same treatment as ProfileHeader's avatar).
  const avatarLetter = user.username.charAt(0).toUpperCase();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${displayName}'s profile`}
      className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
      onPress={() => router.push(`/u/${user.username}`)}
    >
      {user.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          className="h-11 w-11 rounded-full border border-surface-border bg-surface-overlay"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
          <Text className="text-base font-semibold text-text-secondary">
            {avatarLetter}
          </Text>
        </View>
      )}

      <View className="min-w-0 flex-1">
        <Text
          className="text-base font-semibold text-text-primary"
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text className="text-sm text-text-muted" numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
    </Pressable>
  );
}
