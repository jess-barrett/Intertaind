/**
 * MediaCard — a poster grid card for a single filmography credit on the
 * mobile Person / Filmography page. The RN analogue of web's filmography
 * grid card (`apps/web/src/components/media-card.tsx`): a 2:3 poster (with a
 * muted media-type glyph fallback when TMDb has no art), the title, and a
 * meta row beneath it.
 *
 * ── Meta row (web parity) ──────────────────────────────────────────────
 * The row mirrors web's card: the star rating shows the VIEWER's own rating
 * first (`viewerRating`, DB scale → stars) and falls back to the community
 * average (`avgRating`, already 0–5 display scale) when they haven't rated
 * it; a loved heart in the movie accent when `favorite`; then the year. Web
 * has NO watched-eye badge — the viewer's own rating conveys engagement — so
 * this card doesn't either (dropped from the previous version).
 *
 * ── Always clickable (tap-to-enrich) ───────────────────────────────────
 * EVERY card is a Pressable. A cataloged credit (`media_item_id` set)
 * navigates straight to `/media/[id]`. An uncataloged credit has no catalog
 * row yet, so the first tap invokes the `media-upsert` Edge Function
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
import { Film, Heart, Tv } from "lucide-react-native";
import { tmdbImageUrl, type MergedCredit } from "@intertaind/media";
import { ratingToStars } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import StarRating from "@/components/star-rating";
import { useMediaUpsertMutation } from "@/queries/media";

/**
 * Poster grid card for one filmography credit. Width-flexible: fills its
 * grid cell (the list owns the column width). Always tappable — cataloged
 * navigates, uncataloged enriches via `media-upsert` then navigates. See the
 * file header for the meta row and the tap-to-enrich busy state.
 */
export function MediaCard({
  credit,
  viewerRating,
  favorite = false,
  avgRating,
}: {
  credit: MergedCredit;
  /** The viewer's own rating (1–10 DB scale) — takes priority in the row. */
  viewerRating?: number | null;
  /** The viewer has loved this title → a filled heart in the movie accent. */
  favorite?: boolean;
  /** Community average (0–5 display scale) — fallback when unrated. */
  avgRating?: number | null;
}) {
  const router = useRouter();
  const upsert = useMediaUpsertMutation();
  const [busy, setBusy] = useState(false);

  const posterUrl = tmdbImageUrl(credit.poster_path, "w342");
  // Fallback poster glyph mirrors cast-slider: a muted type glyph on the
  // raised card when TMDb has no art for this title.
  const FallbackIcon = credit.media_type === "tv" ? Tv : Film;

  // Stars are DISPLAY scale (0.5–5.0). Viewer rating comes off the DB scale
  // (1–10) so it converts via ratingToStars; the community avg is already
  // display scale (migration 025), so it's used as-is.
  const displayStars =
    viewerRating != null
      ? ratingToStars(Number(viewerRating))
      : avgRating != null
        ? Number(avgRating)
        : null;

  const onPress = async () => {
    if (credit.media_item_id) {
      router.push(`/media/${credit.media_item_id}`);
      return;
    }
    // Uncataloged → enrich-on-tap. Guard against a double-tap while the
    // Edge Function is in flight; leave the busy state OFF on failure so a
    // re-tap can retry (the upsert is get-or-create, so a retry is safe).
    if (busy) return;
    setBusy(true);
    try {
      const id = await upsert.mutateAsync({
        mediaType: credit.media_type,
        tmdbId: credit.id,
      });
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
      accessibilityLabel={`Open ${credit.title}`}
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
            accessibilityLabel={credit.title}
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
      </View>

      <Text
        className="mt-1.5 text-sm font-medium text-text-primary"
        numberOfLines={1}
      >
        {credit.title}
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
        <Text className="text-xs text-text-muted">{credit.year ?? "—"}</Text>
      </View>
    </Pressable>
  );
}
