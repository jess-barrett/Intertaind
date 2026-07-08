/**
 * ProfileHeader — the identity block atop the shared `ProfileView` (the
 * viewer's own `(profile)` tab AND anyone else's `u/[username]` route). The RN
 * analogue of web's profile header: avatar, display name / @username, bio, the
 * follower/following counts, and the four per-media-type engagement counts;
 * the right-hand action is a settings gear (owner) or a Follow button (else).
 *
 * ── What's wired vs deferred ────────────────────────────────────────────
 *   - The follower/following counts are TAPPABLE but no-op with a TODO — the
 *     Followers / Following sub-screens are M6.
 *   - Owner → a settings gear that no-ops (no settings screen yet — M-later).
 *   - Non-owner → a Follow button rendered as a VISUAL PLACEHOLDER (disabled);
 *     the follow state + mutations are M6. Kept visually present per the plan.
 *
 * Design tokens only. Icons color via the `color` PROP (react-native-svg) —
 * never a className — per apps/mobile/AGENTS.md; the four media-type counts use
 * `MEDIA_TYPE_ICONS` + `MEDIA_TYPE_ICON_COLOR`. All data arrives via props from
 * `ProfileView` (which owns the `src/queries/profile.ts` hooks) — the header
 * runs NO inline supabase.
 */
import { Pressable, Text, View } from "react-native";
import { Settings, UserPlus } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";

import { Image } from "@/components/image";
import { ExpandableText } from "@/components/media/expandable-text";
import {
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_ICON_COLOR,
} from "@/lib/media-type-icons";
import type { ProfileMediaCounts, ProfileRow } from "@/queries/profile";

/** Fixed media-type order for the header count row (movie → tv → book → game). */
const COUNT_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];

export function ProfileHeader({
  profile,
  counts,
  isOwner,
}: {
  profile: ProfileRow;
  /** The four per-type counts (from `useProfileMediaCounts`); undefined while
   *  the counts read is still pending — the row renders "—" placeholders. */
  counts?: ProfileMediaCounts;
  /** Viewer is looking at their OWN profile → settings gear vs Follow button. */
  isOwner: boolean;
}) {
  const displayName = profile.display_name ?? profile.username;
  // Letter fallback for a missing avatar — first char of the username, upper.
  const avatarLetter = profile.username.charAt(0).toUpperCase();

  return (
    <View className="gap-4 px-4 pb-2">
      {/* Top row: avatar + name/handle on the left, the owner/visitor action
          pinned to the right. */}
      <View className="flex-row items-start gap-4">
        {/* Avatar — circular; the letter fallback sits on a surface-overlay
            circle when there's no avatar_url. */}
        {profile.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            className="h-20 w-20 rounded-full border border-surface-border bg-surface-overlay"
            contentFit="cover"
            accessible
            accessibilityLabel={`${displayName}'s avatar`}
          />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
            <Text className="text-2xl font-semibold text-text-secondary">
              {avatarLetter}
            </Text>
          </View>
        )}

        <View className="flex-1 gap-0.5 pt-1">
          <Text
            className="text-xl font-bold text-text-primary"
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text className="text-sm text-text-muted" numberOfLines={1}>
            @{profile.username}
          </Text>
        </View>

        {/* Right action — settings gear (owner) or a Follow placeholder. */}
        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-surface-border active:opacity-70"
            // TODO(profile): open the settings screen once it exists.
            onPress={() => {}}
          >
            <Settings size={20} color={colors["text-secondary"]} />
          </Pressable>
        ) : (
          // Visual placeholder — the follow state + mutations land in M6. Kept
          // present (and disabled) so the header reads complete now.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Follow"
            accessibilityState={{ disabled: true }}
            disabled
            className="flex-row items-center gap-1.5 rounded-full bg-brand px-4 py-2 opacity-60"
          >
            <UserPlus size={16} color={colors["text-primary"]} />
            <Text className="text-sm font-semibold text-text-primary">
              Follow
            </Text>
          </Pressable>
        )}
      </View>

      {/* Bio — clamped ~3 lines with the Letterboxd fade cue; tap toggles. */}
      {profile.bio ? (
        <ExpandableText
          text={profile.bio}
          collapsedLines={3}
          className="text-sm leading-relaxed text-text-secondary"
        />
      ) : null}

      {/* Follower / following counts — tappable (M6 sub-screens); no-op now. */}
      <View className="flex-row gap-6">
        <CountPill
          value={profile.followers_count}
          label="Followers"
          // TODO(M6): navigate to the followers sub-screen.
          onPress={() => {}}
        />
        <CountPill
          value={profile.following_count}
          label="Following"
          // TODO(M6): navigate to the following sub-screen.
          onPress={() => {}}
        />
      </View>

      {/* Per-media-type engagement counts — icon (accent via `color` prop) +
          number, one block per type. "—" while the counts read is pending. */}
      <View className="flex-row flex-wrap gap-x-5 gap-y-3">
        {COUNT_ORDER.map((type) => {
          const Icon = MEDIA_TYPE_ICONS[type];
          const value = counts?.[type];
          return (
            <View key={type} className="flex-row items-center gap-1.5">
              <Icon size={16} color={MEDIA_TYPE_ICON_COLOR[type]} />
              <Text className="text-sm font-semibold text-text-primary">
                {value != null ? value.toLocaleString() : "—"}
              </Text>
              <Text className="text-xs text-text-muted">
                {MEDIA_TYPE_CONFIG[type].label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** One tappable "N Label" count block (followers / following). */
function CountPill({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      className="flex-row items-baseline gap-1.5 active:opacity-70"
      onPress={onPress}
    >
      <Text className="text-base font-bold text-text-primary">
        {value.toLocaleString()}
      </Text>
      <Text className="text-sm text-text-muted">{label}</Text>
    </Pressable>
  );
}
