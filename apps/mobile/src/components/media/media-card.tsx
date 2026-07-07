/**
 * MediaCard — a poster grid card for a single filmography credit on the
 * mobile Person / Filmography page. The RN analogue of web's filmography
 * grid card. A 2:3 poster (with a muted fallback glyph when TMDb has no
 * art), the title, and a media-type icon + year line beneath it.
 *
 * ── Tappable only when the title is in our catalog ─────────────────────
 * A credit is a link to the media detail screen ONLY when `media_item_id`
 * is set — i.e. the title already exists as a `media_items` row. When it's
 * null the title isn't in our catalog yet, so the card renders as a plain,
 * NON-tappable `View` (no press affordance, no route to push to). A mobile
 * media-upsert path (create-on-tap from a TMDb credit) is a documented
 * follow-up; until then an uncataloged credit is display-only.
 *
 * ── Watched badge ──────────────────────────────────────────────────────
 * When `watched` is true, a small unobtrusive chip overlays the poster's
 * top-right corner: a filled `Eye` glyph in the GREEN watched accent
 * (`accent-book`, web's universal "completed"/watched color) on a subtle
 * translucent surface. It signals the viewer has already watched this
 * title without competing with the poster art.
 *
 * Visual language mirrors cast-slider.tsx: sharp corners, hairline
 * `surface-border`, 2:3 art, design tokens only. Icons color via the
 * `color` PROP (react-native-svg), never a className.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Eye, Film, Tv } from "lucide-react-native";
import { tmdbImageUrl, type MergedCredit } from "@intertaind/media";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";

/**
 * The card's inner content — poster (art or fallback glyph + watched
 * badge), title, and the type-icon + year row. Shared by both the
 * tappable (Pressable) and non-tappable (View) shells so the two branches
 * can't drift.
 */
function CardBody({
  credit,
  watched,
}: {
  credit: MergedCredit;
  watched: boolean;
}) {
  const posterUrl = tmdbImageUrl(credit.poster_path, "w342");
  // The credit's media_type is TMDb's ("movie" | "tv"); map it onto the
  // domain MediaType keys the mobile icon map + accent colors use.
  const mediaType = credit.media_type === "tv" ? "tv_show" : "movie";
  const TypeIcon = MEDIA_TYPE_ICONS[mediaType];
  const typeColor =
    credit.media_type === "tv" ? colors["accent-tv"] : colors["accent-movie"];
  // Fallback poster glyph mirrors cast-slider: a muted type glyph on the
  // raised card when TMDb has no art for this title.
  const FallbackIcon = credit.media_type === "tv" ? Tv : Film;

  return (
    <View className="w-full">
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

        {/* Watched badge — a small filled Eye in the green watched accent
            on a subtle translucent chip, pinned top-right so it never
            overlaps the type/year line beneath the poster. */}
        {watched ? (
          <View className="absolute right-1 top-1 rounded-full bg-surface-default/80 p-1">
            <Eye
              size={12}
              color={colors["accent-book"]}
              fill={colors["accent-book"]}
            />
          </View>
        ) : null}
      </View>

      <Text
        className="mt-1.5 text-sm font-medium text-text-primary"
        numberOfLines={1}
      >
        {credit.title}
      </Text>
      <View className="flex-row items-center gap-1">
        <TypeIcon size={12} color={typeColor} />
        <Text className="text-xs text-text-muted">{credit.year ?? "—"}</Text>
      </View>
    </View>
  );
}

/**
 * Poster grid card for one filmography credit. Width-flexible: fills its
 * grid cell (the list owns the column width). Tappable only when the title
 * is in our catalog — see the file header for the `media_item_id` rule and
 * the watched badge.
 */
export function MediaCard({
  credit,
  watched = false,
}: {
  credit: MergedCredit;
  watched?: boolean;
}) {
  const router = useRouter();

  // Uncataloged credit (no media_items row yet) → NON-tappable plain View.
  // There's nowhere to route to, and a create-on-tap upsert path is a
  // documented follow-up. See file header.
  if (!credit.media_item_id) {
    return <CardBody credit={credit} watched={watched} />;
  }

  const mediaItemId = credit.media_item_id;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${credit.title}`}
      className="active:opacity-70"
      onPress={() => router.push(`/media/${mediaItemId}`)}
    >
      <CardBody credit={credit} watched={watched} />
    </Pressable>
  );
}
