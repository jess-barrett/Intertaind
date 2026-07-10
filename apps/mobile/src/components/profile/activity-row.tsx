/**
 * ActivityRow — one row of an activity feed (profile Overview's recent
 * activity, the full Activity list, and the Activity tab's "You" feed).
 * Rows are separated by a hairline (`border-b`) — no per-row box.
 *
 * Two shapes, driven by the row's `metadata`:
 *   - REVIEW (has `review_text`): cover · media title (+ a game's "Nh played") ·
 *     a stars row with a Loved heart · the review text, stacked.
 *   - EVERYTHING ELSE: a single line (cover + one line + time):
 *       · rated → title followed by its stars (+ heart if also loved)
 *       · loved-only → "Loved {title}" with a heart
 *       · anything else → the shared `formatActivity` sentence
 *
 * All text is muted/grayish (`text-text-secondary`) for a calm, uniform feed;
 * stars come from `metadata.rating` (DB→display, earned-only), the heart from
 * `metadata.is_favorite`. The whole row is a Pressable → `/media/<id>`.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import { formatActivity, ratingToStars, type MediaType } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import StarRating from "@/components/star-rating";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { timeAgo } from "@/lib/time";
import type { ProfileActivityRow } from "@/queries/profile";

/** Fallback glyph for a row whose media has no cover (or no media at all). */
function CoverFallback({
  mediaType,
  size,
}: {
  mediaType: MediaType | null;
  size: number;
}) {
  const Icon = mediaType ? MEDIA_TYPE_ICONS[mediaType] : null;
  return (
    <View className="h-full w-full items-center justify-center">
      {Icon ? <Icon size={size} color={colors["text-muted"]} /> : null}
    </View>
  );
}

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

export function ActivityRow({ row }: { row: ProfileActivityRow }) {
  const router = useRouter();
  const meta = readMeta(row.metadata);
  const cover = row.media?.cover_image_url ?? null;
  const mediaType = (row.media?.media_type ?? null) as MediaType | null;
  const title = row.media?.title ?? "Untitled";
  const canOpen = !!row.media_id;
  const onPress = canOpen
    ? () => router.push(`/media/${row.media_id}`)
    : undefined;

  const ratingDb = typeof meta.rating === "number" ? meta.rating : null;
  const stars = ratingDb != null ? ratingToStars(ratingDb) : null;
  const isFavorite = meta.is_favorite === true;
  const reviewText =
    typeof meta.review_text === "string" && meta.review_text.trim().length > 0
      ? meta.review_text
      : null;
  const hours = typeof meta.hours_played === "number" ? meta.hours_played : null;

  // Season/episode logs keep their sentence (it carries the S/E context).
  const isSeasonEpisode =
    row.activity_type === "logged_season" ||
    row.activity_type === "logged_episode";
  const isReview = !isSeasonEpisode && reviewText != null;

  // ── Review → the stacked layout (separated by the row's border, no box). ──
  if (isReview) {
    return (
      <Pressable
        accessibilityRole={canOpen ? "button" : undefined}
        accessibilityLabel={canOpen ? formatActivity(row) : undefined}
        disabled={!canOpen}
        className="flex-row gap-3 border-b border-surface-border py-3 active:opacity-70"
        onPress={onPress}
      >
        <View className="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
          {cover ? (
            <Image
              source={{ uri: cover }}
              className="h-full w-full"
              contentFit="cover"
              accessible
              accessibilityLabel={row.media?.title ?? "Cover"}
            />
          ) : (
            <CoverFallback mediaType={mediaType} size={18} />
          )}
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className="min-w-0 flex-1 text-sm text-text-secondary"
              numberOfLines={2}
            >
              {title}
              {hours != null ? (
                <Text className="text-text-muted">  {hours}h played</Text>
              ) : null}
            </Text>
            {row.created_at ? (
              <Text className="shrink-0 text-xs text-text-muted">
                {timeAgo(row.created_at)}
              </Text>
            ) : null}
          </View>

          {stars != null || isFavorite ? (
            <View className="flex-row items-center gap-1.5">
              {stars != null ? (
                <StarRating value={stars} readOnly starsOnly hideEmpty size={13} />
              ) : null}
              {isFavorite ? <LovedHeart /> : null}
            </View>
          ) : null}

          <Text className="text-sm text-text-secondary" numberOfLines={4}>
            {reviewText}
          </Text>
        </View>
      </Pressable>
    );
  }

  // ── Everything else → the thin, single-line row. ──────────────────────
  const hasRating = !isSeasonEpisode && stars != null;
  const isFavoritedOnly = row.activity_type === "favorited";

  return (
    <Pressable
      accessibilityRole={canOpen ? "button" : undefined}
      accessibilityLabel={canOpen ? formatActivity(row) : undefined}
      disabled={!canOpen}
      className="flex-row items-center gap-3 border-b border-surface-border py-3 active:opacity-70"
      onPress={onPress}
    >
      <View className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {cover ? (
          <Image
            source={{ uri: cover }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={row.media?.title ?? "Cover"}
          />
        ) : (
          <CoverFallback mediaType={mediaType} size={16} />
        )}
      </View>

      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          {hasRating ? (
            <>
              <Text
                className="shrink text-sm text-text-secondary"
                numberOfLines={1}
              >
                {title}
              </Text>
              <StarRating value={stars} readOnly starsOnly hideEmpty size={13} />
              {isFavorite ? <LovedHeart /> : null}
            </>
          ) : (
            <>
              <Text
                className="shrink text-sm text-text-secondary"
                numberOfLines={2}
              >
                {formatActivity(row)}
              </Text>
              {isFavoritedOnly ? <LovedHeart /> : null}
            </>
          )}
        </View>
        {row.created_at ? (
          <Text className="shrink-0 text-xs text-text-muted">
            {timeAgo(row.created_at)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
