/**
 * ProfileHeader — the identity block atop the shared `ProfileView` (the
 * viewer's own `(profile)` tab AND anyone else's `u/[username]` route). The RN
 * analogue of web's profile header: avatar, display name / @username, bio, the
 * follower/following counts, and the four per-media-type engagement counts;
 * the right-hand action is a settings gear (owner) or a Follow button (else).
 *
 * ── What's wired vs deferred (M6a) ──────────────────────────────────────
 *   - The follower/following counts are TAPPABLE — they push the Followers /
 *     Following sub-screens (`/u/<username>/followers` · `/following`).
 *   - Owner → a settings gear that no-ops (no settings screen yet — M-later).
 *   - Non-owner → a LIVE Follow button driven by `useFollowState` +
 *     `useFollow`/`useUnfollow` mutations (the FollowButton state machine
 *     below). Private targets route the follow to a request ("Requested").
 *   - Deferred: per-row follow buttons in the Followers/Following lists;
 *     block-aware filtering; the private-follower-visibility gate.
 *
 * Design tokens only. Icons color via the `color` PROP (react-native-svg) —
 * never a className — per apps/mobile/AGENTS.md; the four media-type counts use
 * `MEDIA_TYPE_ICONS` + `MEDIA_TYPE_ICON_COLOR`. The read/count data arrives via
 * props from `ProfileView` (which owns those `src/queries/profile.ts` hooks);
 * the follow state + mutations are the header's OWN concern, so it calls the
 * follow hooks directly (still no inline supabase — all via profile.ts).
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, Clock, Settings, UserPlus } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { type MediaType } from "@intertaind/types";

import { Image } from "@/components/image";
import { ExpandableText } from "@/components/media/expandable-text";
import { HeaderUserSearch } from "@/components/profile/header-user-search";
import {
  MEDIA_TYPE_ICONS,
  MEDIA_TYPE_ICON_COLOR,
} from "@/lib/media-type-icons";
import {
  useFollowMutation,
  useFollowState,
  useUnfollowMutation,
  type ProfileMediaCounts,
  type ProfileRow,
} from "@/queries/profile";

/**
 * One media-type engagement count — an icon-ABOVE-number stack (no label), a
 * fixed-width cell so the header's 2×2 grid columns align. Icon colors via the
 * `color` PROP (react-native-svg). "—" while the counts read is still pending.
 */
function StatStack({
  type,
  value,
}: {
  type: MediaType;
  value: number | undefined;
}) {
  const Icon = MEDIA_TYPE_ICONS[type];
  return (
    <View style={{ width: 30 }} className="items-center gap-0.5">
      <Icon size={16} color={MEDIA_TYPE_ICON_COLOR[type]} />
      <Text className="text-sm font-semibold text-text-primary">
        {value != null ? value.toLocaleString() : "—"}
      </Text>
    </View>
  );
}

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
  const router = useRouter();
  const displayName = profile.display_name ?? profile.username;
  // Letter fallback for a missing avatar — first char of the username, upper.
  const avatarLetter = profile.username.charAt(0).toUpperCase();

  return (
    <View className="gap-4 px-4 pb-2">
      {/* Top row: avatar + name/handle on the left, the owner/visitor action
          pinned to the right. */}
      <View className="flex-row items-start gap-3">
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

        {/* LEFT — the identity block: name / @username / follower-following,
            stacked tightly and INDEPENDENT of the right column, so it sits
            within the avatar's height (nothing on the right inflates it). */}
        <View className="flex-1 gap-0.5 pt-0.5">
          <Text
            className="text-xl font-bold text-text-primary"
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text className="text-sm text-text-muted" numberOfLines={1}>
            @{profile.username}
          </Text>
          <View className="mt-1 flex-row gap-3">
            <CountPill
              value={profile.followers_count}
              label="Followers"
              onPress={() => router.push(`/u/${profile.username}/followers`)}
            />
            <CountPill
              value={profile.following_count}
              label="Following"
              onPress={() => router.push(`/u/${profile.username}/following`)}
            />
          </View>
        </View>

        {/* RIGHT — find-users + gear/Follow on top (the ＋ sits LEFT of the gear
            so its bar can slide out into open space), then the media-type
            counts as a single tight row of four beneath. */}
        <View className="items-end gap-2">
          <View className="flex-row items-center gap-2">
            {/* Find-users is the viewer's OWN tool — shown on the owner's
                profile only, not when viewing someone else. */}
            {isOwner ? <HeaderUserSearch /> : null}
            {isOwner ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={8}
                className="items-center justify-center rounded-full border border-surface-border active:opacity-70"
                style={{ width: 36, height: 36 }}
                // TODO(profile): open the settings screen once it exists.
                onPress={() => {}}
              >
                <Settings size={20} color={colors["text-secondary"]} />
              </Pressable>
            ) : (
              <FollowButton
                targetUserId={profile.id}
                username={profile.username}
                isPrivate={profile.is_private}
              />
            )}
          </View>

          <View className="flex-row gap-1.5">
            <StatStack type="movie" value={counts?.movie} />
            <StatStack type="tv_show" value={counts?.tv_show} />
            <StatStack type="book" value={counts?.book} />
            <StatStack type="video_game" value={counts?.video_game} />
          </View>
        </View>
      </View>

      {/* Bio — clamped ~3 lines with the Letterboxd fade cue; tap toggles. */}
      {profile.bio ? (
        <ExpandableText
          text={profile.bio}
          collapsedLines={3}
          className="text-sm leading-relaxed text-text-secondary"
        />
      ) : null}
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
      className="flex-row items-baseline gap-1 active:opacity-70"
      onPress={onPress}
    >
      <Text className="text-sm font-bold text-text-primary">
        {value.toLocaleString()}
      </Text>
      <Text className="text-xs text-text-muted">{label}</Text>
    </Pressable>
  );
}

/**
 * The non-owner Follow button — a small state machine over `useFollowState`:
 *
 *   "none"      → "Follow"    (brand fill, UserPlus)  → follow. A PRIVATE target
 *                 turns this into a follow REQUEST (the mutation routes it).
 *   "following" → "Following" (outline, Check)        → unfollow.
 *   "requested" → "Requested" (outline, Clock)        → cancel the request.
 *   "self"      → nothing (owner sees the settings gear instead — but the
 *                 header only mounts this for non-owners, so it's a guard).
 *
 * Optimistic-free (invalidate-only): follow/unfollow are low-frequency and a
 * pending spinner reads fine; the settle-invalidate refetches `followState` +
 * the denormalized counts (trigger-owned). While a mutation is in flight the
 * button disables + shows a spinner so a double-tap can't fire twice. Both
 * mutations already surface friendly copy via `trackingErrorMessage`; a failed
 * follow just leaves the button in its prior state (the error line is out of
 * scope for the compact header — the state simply doesn't advance).
 */
function FollowButton({
  targetUserId,
  username,
  isPrivate,
}: {
  targetUserId: string;
  username: string;
  isPrivate: boolean;
}) {
  const stateQuery = useFollowState(targetUserId);
  const follow = useFollowMutation();
  const unfollow = useUnfollowMutation();

  const state = stateQuery.data;
  const pending = follow.isPending || unfollow.isPending;

  // Nothing to render for self (guarded — the header only mounts this for
  // non-owners) or until the state resolves (avoids a flash of the wrong label).
  if (state === undefined || state === "self") {
    return (
      <View className="flex-row items-center gap-1.5 rounded-sm border border-surface-border px-4 py-2 opacity-40">
        <UserPlus size={16} color={colors["text-secondary"]} />
        <Text className="text-sm font-semibold text-text-secondary">
          Follow
        </Text>
      </View>
    );
  }

  const vars = { targetUserId, isPrivate, username };
  const isFollow = state === "none";
  const onPress = () => {
    if (pending) return;
    if (isFollow) follow.mutate(vars);
    else unfollow.mutate(vars); // following → unfollow; requested → cancel
  };

  const label =
    state === "following"
      ? "Following"
      : state === "requested"
        ? "Requested"
        : "Follow";
  const Icon = state === "following" ? Check : state === "requested" ? Clock : UserPlus;

  // "Follow" is the brand-filled primary CTA; the active states (Following /
  // Requested) read as subtle outline buttons the user taps to undo.
  const className = isFollow
    ? "flex-row items-center gap-1.5 rounded-sm bg-brand px-4 py-2 active:opacity-70"
    : "flex-row items-center gap-1.5 rounded-sm border border-surface-border px-4 py-2 active:opacity-70";
  const iconColor = isFollow ? colors["text-primary"] : colors["text-secondary"];
  const textClass = isFollow
    ? "text-sm font-semibold text-text-primary"
    : "text-sm font-semibold text-text-secondary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: pending, selected: !isFollow }}
      disabled={pending}
      className={className}
      style={pending ? { opacity: 0.6 } : undefined}
      onPress={onPress}
    >
      <Icon size={16} color={iconColor} />
      <Text className={textClass}>{label}</Text>
    </Pressable>
  );
}
