/**
 * FeedActivityRow — one row of the Activity tab's FRIENDS feed. Like the
 * profile `ActivityRow`, but a feed row must show WHO acted: an actor avatar +
 * name lead the row. Attribution comes from the shared `formatActivity`
 * sentence ("Jess rated Inception"), and — matching the You feed — the rich
 * bits render beneath it: stars + Loved heart, review text, or (for
 * `recommended`) the SOURCE → TARGET pairing.
 *
 * Rows are separated by a hairline (`border-b`); text is grayish. Tap targets:
 * the avatar → the actor's profile; content/cover/pairing posters → the media.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import { formatActivity, ratingToStars, type MediaType } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import StarRating from "@/components/star-rating";
import {
  RecommendationPairing,
  type PairMedia,
} from "@/components/activity/recommendation-pairing";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { timeAgo } from "@/lib/time";
import type { ActivityFeedRow } from "@/queries/activity";

/** Read `metadata` defensively (Json | null → object or empty). */
function readMeta(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/** A small pink Loved heart (filled). */
function LovedHeart() {
  return (
    <Heart size={13} color={colors["accent-movie"]} fill={colors["accent-movie"]} />
  );
}

/** The actor's avatar → their profile (letter fallback). */
function ActorAvatar({
  actor,
  name,
}: {
  actor: ActivityFeedRow["actor"];
  name: string;
}) {
  const router = useRouter();
  const avatarLetter = (actor?.username ?? "?").charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole={actor ? "button" : undefined}
      accessibilityLabel={actor ? `View ${name}'s profile` : undefined}
      disabled={!actor}
      className="active:opacity-70"
      onPress={actor ? () => router.push(`/u/${actor.username}`) : undefined}
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
  );
}

export function FeedActivityRow({ row }: { row: ActivityFeedRow }) {
  const router = useRouter();
  const actor = row.actor;
  const name = actor?.display_name ?? actor?.username ?? "Someone";

  const meta = readMeta(row.metadata);
  const cover = row.media?.cover_image_url ?? null;
  const mediaType = (row.media?.media_type ?? null) as MediaType | null;
  const MediaGlyph = mediaType ? MEDIA_TYPE_ICONS[mediaType] : null;
  const canOpenMedia = !!row.media_id;
  const openMedia = canOpenMedia
    ? () => router.push(`/media/${row.media_id}`)
    : undefined;

  // Sentence, first letter lowercased so it follows the actor's name.
  const sentence = formatActivity(row);
  const tail = sentence.charAt(0).toLowerCase() + sentence.slice(1);

  // Rich enrichments (same rules as ActivityRow).
  const ratingDb = typeof meta.rating === "number" ? meta.rating : null;
  const stars = ratingDb != null ? ratingToStars(ratingDb) : null;
  const isFavorite = meta.is_favorite === true;
  const reviewText =
    typeof meta.review_text === "string" && meta.review_text.trim().length > 0
      ? meta.review_text
      : null;
  const isSeasonEpisode =
    row.activity_type === "logged_season" ||
    row.activity_type === "logged_episode";
  const showStars = !isSeasonEpisode && stars != null;
  const showReview = !isSeasonEpisode && reviewText != null;
  const isFavoritedOnly = row.activity_type === "favorited";

  // ── Recommended → actor + the SOURCE → TARGET pairing. Older recs lacking
  // the source metadata fall through to the sentence render below. ──
  const sourceMediaId =
    row.activity_type === "recommended" &&
    typeof meta.source_media_id === "string"
      ? meta.source_media_id
      : null;
  if (sourceMediaId) {
    const source: PairMedia = {
      id: sourceMediaId,
      title:
        typeof meta.source_title === "string" ? meta.source_title : "Untitled",
      cover:
        typeof meta.source_cover_url === "string"
          ? meta.source_cover_url
          : null,
      mediaType: (typeof meta.source_media_type === "string"
        ? meta.source_media_type
        : null) as MediaType | null,
    };
    const target: PairMedia = {
      id: row.media_id,
      title: row.media?.title ?? "Untitled",
      cover: row.media?.cover_image_url ?? null,
      mediaType,
    };
    return (
      <View className="flex-row gap-3 border-b border-surface-border py-3">
        <ActorAvatar actor={actor} name={name} />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className="min-w-0 flex-1 text-sm text-text-secondary"
              numberOfLines={1}
            >
              <Text className="font-semibold text-text-secondary">{name}</Text>{" "}
              intertaind
            </Text>
            {row.created_at ? (
              <Text className="shrink-0 text-xs text-text-muted">
                {timeAgo(row.created_at)}
              </Text>
            ) : null}
          </View>
          <RecommendationPairing source={source} target={target} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row gap-3 border-b border-surface-border py-3">
      <ActorAvatar actor={actor} name={name} />

      {/* Content → media. */}
      <Pressable
        accessibilityRole={canOpenMedia ? "button" : undefined}
        accessibilityLabel={canOpenMedia ? `${name} ${tail}` : undefined}
        disabled={!canOpenMedia}
        className="min-w-0 flex-1 gap-1 active:opacity-70"
        onPress={openMedia}
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text
              className="shrink text-sm text-text-secondary"
              numberOfLines={2}
            >
              <Text className="font-semibold text-text-secondary">{name}</Text>{" "}
              {tail}
            </Text>
            {isFavoritedOnly ? <LovedHeart /> : null}
          </View>
          {row.created_at ? (
            <Text className="shrink-0 text-xs text-text-muted">
              {timeAgo(row.created_at)}
            </Text>
          ) : null}
        </View>

        {showStars && (stars != null || isFavorite) ? (
          <View className="flex-row items-center gap-1.5">
            {stars != null ? (
              <StarRating value={stars} readOnly starsOnly hideEmpty size={13} />
            ) : null}
            {isFavorite ? <LovedHeart /> : null}
          </View>
        ) : null}

        {showReview ? (
          <Text className="text-sm text-text-secondary" numberOfLines={4}>
            {reviewText}
          </Text>
        ) : null}
      </Pressable>

      {/* Media cover → media. */}
      {canOpenMedia ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.media?.title ?? "Open media"}
          className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay active:opacity-70"
          onPress={openMedia}
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
