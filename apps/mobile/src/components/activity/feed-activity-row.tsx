/**
 * FeedActivityRow — one row of the Activity tab's FRIENDS feed. Unlike the
 * profile's `ActivityRow` (where the actor is implied by whose profile you're
 * on), a feed row must show WHO acted: an avatar + name, then the shared
 * `formatActivity` sentence (its leading verb lowercased so it reads
 * "Jess added Heat to Watchlist"), a relative time, and the media thumbnail.
 *
 * Two tap targets: the avatar/name → the actor's profile (`/u/<username>`);
 * the sentence + thumbnail → the media (`/media/<id>`) when the row has one.
 * Mobile primitives only; glyph colors via the `color` PROP.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatActivity, type MediaType } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { timeAgo } from "@/lib/time";
import type { ActivityFeedRow } from "@/queries/activity";

export function FeedActivityRow({ row }: { row: ActivityFeedRow }) {
  const router = useRouter();
  const actor = row.actor;
  const name = actor?.display_name ?? actor?.username ?? "Someone";
  const avatarLetter = (actor?.username ?? "?").charAt(0).toUpperCase();

  const cover = row.media?.cover_image_url ?? null;
  // DB enum has a 5th type (board_game) the app doesn't surface; narrow to the
  // 4 domain types (or null) for the glyph map.
  const mediaType = (row.media?.media_type ?? null) as MediaType | null;
  const MediaGlyph = mediaType ? MEDIA_TYPE_ICONS[mediaType] : null;
  const canOpenMedia = !!row.media_id;

  // Shared sentence, first letter lowercased so it follows the actor's name.
  const sentence = formatActivity(row);
  const tail = sentence.charAt(0).toLowerCase() + sentence.slice(1);

  return (
    <View className="flex-row items-center gap-3 py-2.5">
      {/* Actor avatar → profile. */}
      <Pressable
        accessibilityRole={actor ? "button" : undefined}
        accessibilityLabel={actor ? `View ${name}'s profile` : undefined}
        disabled={!actor}
        className="active:opacity-70"
        onPress={
          actor ? () => router.push(`/u/${actor.username}`) : undefined
        }
      >
        {actor?.avatar_url ? (
          <Image
            source={{ uri: actor.avatar_url }}
            className="h-10 w-10 rounded-full border border-surface-border bg-surface-overlay"
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
            <Text className="text-sm font-semibold text-text-secondary">
              {avatarLetter}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Sentence (actor name bold + lowercased verb) + relative time. */}
      <Pressable
        accessibilityRole={canOpenMedia ? "button" : undefined}
        accessibilityLabel={canOpenMedia ? `${name} ${tail}` : undefined}
        disabled={!canOpenMedia}
        className="min-w-0 flex-1 active:opacity-70"
        onPress={
          canOpenMedia ? () => router.push(`/media/${row.media_id}`) : undefined
        }
      >
        <Text className="text-sm text-text-secondary" numberOfLines={2}>
          <Text className="font-semibold text-text-primary">{name}</Text> {tail}
        </Text>
        {row.created_at ? (
          <Text className="mt-0.5 text-xs text-text-muted">
            {timeAgo(row.created_at)}
          </Text>
        ) : null}
      </Pressable>

      {/* Media thumbnail → media. */}
      {canOpenMedia ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.media?.title ?? "Open media"}
          className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay active:opacity-70"
          onPress={() => router.push(`/media/${row.media_id}`)}
        >
          {cover ? (
            <Image
              source={{ uri: cover }}
              className="h-full w-full"
              contentFit="cover"
              accessible={false}
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              {MediaGlyph ? (
                <MediaGlyph size={16} color={colors["text-muted"]} />
              ) : null}
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
