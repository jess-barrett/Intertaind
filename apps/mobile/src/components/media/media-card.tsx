/**
 * MediaCard — a poster grid/rail card for a single title. It renders a
 * normalized `CardMedia` descriptor (from `cardMediaFromCredit` /
 * `cardMediaFromHomeItem`) rather than a source-specific row, so the SAME
 * card serves BOTH the Person / Filmography grid (uncataloged movie/tv
 * credits) AND the home rails (cataloged catalog rows, all four media types).
 * The RN analogue of web's filmography grid card
 * (`apps/web/src/components/media-card.tsx`): a 2:3 poster (with a muted
 * media-type glyph fallback when there's no art), the title, and a meta row
 * beneath it.
 *
 * ── Meta row (web parity) ──────────────────────────────────────────────
 * The row mirrors web's card: the star rating shows the VIEWER's own rating
 * first (`tracking.rating`, DB scale → stars) and falls back to the
 * community average (`avgRating`, already 0–5 display scale) when they
 * haven't rated it; a loved heart in the movie accent when the viewer loves
 * it; then the year. Web has NO watched-eye badge — the viewer's own rating
 * conveys engagement — so this card doesn't either.
 *
 * ── Quick actions (tap-to-slide-out tab) ───────────────────────────────
 * A media-type-colored notched tab sits at the poster's bottom-left
 * (`CardActions`). TAPPING it slides out a row of quick actions (status ·
 * Loved · ⋯) and the ⋯ opens a per-type bottom sheet — the touch analogue
 * of web's card hover actions. It reads the viewer's `tracking` for its
 * active states and calls `onMutated` after a write so the parent can
 * refresh the batched tracking map. See `card-actions.tsx`.
 *
 * ── Always clickable (tap-to-enrich) ───────────────────────────────────
 * EVERY card is a Pressable. A cataloged descriptor (`mediaItemId` set —
 * always the case for home catalog rows) navigates straight to `/media/[id]`.
 * An uncataloged filmography credit has no catalog row yet but carries an
 * `upsert` payload, so the first tap invokes the `media-upsert` Edge Function
 * (`useMediaUpsertMutation`) to get-or-create the row, then navigates to the
 * returned id — the RN analogue of web's upsert-on-click card link. While
 * that first tap is in flight the poster shows a dim + centered spinner (the
 * "enriching…" state) and the card is non-re-tappable; a failure just clears
 * the busy state (the settle-refetch on the next screen visit / a re-tap
 * recovers).
 *
 * Visual language mirrors cast-slider.tsx: sharp corners, hairline
 * `surface-border`, 2:3 art, design tokens only. Icons color via the
 * `color` PROP (react-native-svg), never a className.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import { ratingToStars } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import StarRating from "@/components/star-rating";
import { CardActions } from "@/components/media/card-actions";
import type { CardMedia } from "@/components/media/card-media";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { useMediaUpsertMutation } from "@/queries/media";

/**
 * Poster grid/rail card for one normalized `CardMedia` descriptor.
 * Width-flexible: fills its grid/rail cell (the list owns the cell width).
 * Always tappable — a cataloged descriptor navigates, an uncataloged one
 * enriches via `media-upsert` then navigates. See the file header for the
 * meta row, the quick-actions tab, and the tap-to-enrich busy state.
 */
export function MediaCard({
  media,
  tracking,
  avgRating,
  onMutated,
}: {
  media: CardMedia;
  /** The viewer's tracking row for this catalog id (null = untracked /
      uncataloged). Drives the meta-row rating/heart AND the quick-actions
      tab's active states. */
  tracking?: {
    status: string;
    rating: number | null;
    is_favorite: boolean;
  } | null;
  /** Community average (0–5 display scale) — fallback when unrated. */
  avgRating?: number | null;
  /** Called after a quick-action write so the parent can refresh the
      batched tracking map (the card's active states then update). */
  onMutated?: () => void;
}) {
  const router = useRouter();
  const upsert = useMediaUpsertMutation();
  const [busy, setBusy] = useState(false);

  const posterUrl = media.posterUrl;
  // Fallback poster glyph mirrors cast-slider: a muted type glyph on the
  // raised card when there's no art for this title. Keyed by the domain
  // media type so all four types get their own glyph.
  const FallbackIcon = MEDIA_TYPE_ICONS[media.mediaType];

  // Stars are DISPLAY scale (0.5–5.0). The viewer's rating comes off the DB
  // scale (1–10) so it converts via ratingToStars; the community avg is
  // already display scale (migration 025), so it's used as-is.
  const displayStars =
    tracking?.rating != null
      ? ratingToStars(Number(tracking.rating))
      : avgRating != null
        ? Number(avgRating)
        : null;
  const favorite = tracking?.is_favorite ?? false;

  const onPress = async () => {
    if (media.mediaItemId) {
      router.push(`/media/${media.mediaItemId}`);
      return;
    }
    // Uncataloged → enrich-on-tap. Only filmography credits reach here (they
    // carry an `upsert` payload); catalog-row cards always have a mediaItemId
    // and returned above. Guard against a double-tap while the Edge Function
    // is in flight; leave the busy state OFF on failure so a re-tap can retry
    // (the upsert is get-or-create, so a retry is safe).
    if (!media.upsert) return;
    if (busy) return;
    setBusy(true);
    try {
      const id = await upsert.mutateAsync(media.upsert);
      router.push(`/media/${id}`);
    } catch {
      // Swallow: keep busy off so the card stays tappable for a retry. A
      // shared error toast is a follow-up; there's no runtime path yet
      // (media-upsert isn't deployed).
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${media.title}`}
      accessibilityState={{ busy }}
      className="w-full active:opacity-70"
      onPress={onPress}
    >
      <View className="aspect-[2/3] w-full overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={media.title}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <FallbackIcon size={28} color={colors["text-muted"]} />
          </View>
        )}

        {/* Enriching… — a dim + centered spinner overlaid on the poster
            while the first tap of an uncataloged title upserts. */}
        {busy ? (
          <View className="absolute inset-0 items-center justify-center bg-surface-default/60">
            <ActivityIndicator color={colors["text-primary"]} />
          </View>
        ) : null}

        {/* Quick-actions tab — bottom-left, notched, tap-to-slide-out. Sits
            inside the poster's overflow-hidden wrapper (its collapsed glyph
            + slide-out row clip to the poster). See card-actions.tsx. */}
        <CardActions
          media={media}
          tracking={tracking ?? null}
          onMutated={onMutated}
        />
      </View>

      <Text
        className="mt-1.5 text-sm font-medium text-text-primary"
        numberOfLines={1}
      >
        {media.title}
      </Text>

      {/* Meta row — viewer rating (else community avg), loved heart, year. */}
      <View className="mt-0.5 flex-row items-center gap-1.5">
        {displayStars != null ? (
          <StarRating value={displayStars} readOnly starsOnly size={12} />
        ) : null}
        {favorite ? (
          <Heart
            size={11}
            color={colors["accent-movie"]}
            fill={colors["accent-movie"]}
          />
        ) : null}
        <Text className="text-xs text-text-muted">{media.year ?? "—"}</Text>
      </View>
    </Pressable>
  );
}
