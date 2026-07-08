/**
 * FavoritesShowcase — the profile's Top-4 favorites, as a single interactive
 * row of stacked "decks" (one per media type) instead of four separate rows.
 *
 * ── Collapsed ───────────────────────────────────────────────────────────
 * One row, titled "Favorites", with a fanned deck per type that has favorites.
 * Each deck layers up to 4 posters: the #1 favorite is frontmost + leftmost
 * (full opacity, on top); #2–#4 fan to the right, behind, and dimmed. The four
 * decks split the content row into quarter-width slots.
 *
 * ── Expanded (tap a deck) ───────────────────────────────────────────────
 * The tapped type's four posters spread out to fill the whole row (the other
 * decks clear away), and the title switches to "Favorite {type}" with a back
 * chevron to collapse. Each spread poster taps through to its media detail
 * (via `MediaCard`). Tapping the chevron (or it) returns to the four decks.
 *
 * The expand/collapse is animated with `LayoutAnimation` (native, no worklets).
 * Data is the `useProfileTopFours` map, passed in by `OverviewTab`.
 *
 * Mobile primitives only; `Image` from `@/components/image`; design tokens.
 */
import { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";

import { Image } from "@/components/image";
import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import type { HomeMediaItem } from "@/queries/home";

// LayoutAnimation is opt-in on Android (a no-op toggle on iOS).
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Fixed type order for the decks (movie → tv → book → game). */
const FAVORITE_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];
/** Max posters per deck / expanded row. */
const MAX_ITEMS = 4;
/** Content padding (ProfileView's SegmentBody `px-4`) + inter-column gutter. */
const H_PADDING = 16;
const GAP = 12;
/** Frontmost poster width as a fraction of the slot, leaving room for the fan. */
const FRONT_FRACTION = 0.62;
/** Vertical peek (pt) per card behind the front, for a layered look. */
const STEP_Y = 6;
/** LayoutAnimation preset for the expand/collapse. */
const MORPH = LayoutAnimation.create(
  260,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

export function FavoritesShowcase({
  topFours,
}: {
  topFours: Record<MediaType, HomeMediaItem[]>;
}) {
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState<MediaType | null>(null);

  const types = FAVORITE_ORDER.filter((t) => topFours[t]?.length > 0);
  if (types.length === 0) return null;

  // The row splits into MAX_ITEMS quarter-slots — a deck occupies one slot
  // (collapsed), a spread poster is one slot wide (expanded).
  const contentWidth = width - H_PADDING * 2;
  const slotWidth = (contentWidth - GAP * (MAX_ITEMS - 1)) / MAX_ITEMS;

  const toggle = (next: MediaType | null) => {
    LayoutAnimation.configureNext(MORPH);
    setExpanded(next);
  };

  const title = expanded
    ? `Favorite ${MEDIA_TYPE_CONFIG[expanded].label}`
    : "Favorites";

  return (
    <View className="gap-2">
      {/* Title row — a back chevron appears when expanded. */}
      <View className="flex-row items-center gap-1.5">
        {expanded ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to all favorites"
            hitSlop={8}
            className="active:opacity-60"
            onPress={() => toggle(null)}
          >
            <ChevronLeft size={20} color={colors["text-primary"]} />
          </Pressable>
        ) : null}
        <Text className="text-base font-semibold text-text-primary">
          {title}
        </Text>
      </View>

      {expanded ? (
        // Expanded: the type's four favorites spread across the row.
        <View className="flex-row" style={{ gap: GAP }}>
          {topFours[expanded].slice(0, MAX_ITEMS).map((item) => (
            <View key={item.id} style={{ width: slotWidth }}>
              <MediaCard
                media={cardMediaFromHomeItem(item)}
                showMeta={false}
                showActions={false}
              />
            </View>
          ))}
        </View>
      ) : (
        // Collapsed: one fanned deck per type, quarter-slots across the row.
        <View className="flex-row" style={{ gap: GAP }}>
          {types.map((type) => (
            <FavoritesDeck
              key={type}
              type={type}
              items={topFours[type].slice(0, MAX_ITEMS)}
              slotWidth={slotWidth}
              onPress={() => toggle(type)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * One media-type deck: up to 4 posters fanned right — #1 frontmost/leftmost/on
 * top, the rest layered behind and dimmed. Tapping the deck expands its type.
 */
function FavoritesDeck({
  type,
  items,
  slotWidth,
  onPress,
}: {
  type: MediaType;
  items: HomeMediaItem[];
  slotWidth: number;
  onPress: () => void;
}) {
  const count = Math.min(items.length, MAX_ITEMS);
  const frontWidth = slotWidth * FRONT_FRACTION;
  const posterHeight = frontWidth * 1.5; // 2:3
  const stepX = count > 1 ? (slotWidth - frontWidth) / (count - 1) : 0;
  const deckHeight = posterHeight + STEP_Y * (count - 1);

  // Depth order back→front so the frontmost (i=0) paints last (on top).
  const backToFront = Array.from({ length: count }, (_, i) => i).reverse();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show favorite ${MEDIA_TYPE_CONFIG[type].label.toLowerCase()}`}
      className="active:opacity-80"
      style={{ width: slotWidth, height: deckHeight }}
      onPress={onPress}
    >
      {backToFront.map((i) => {
        const item = items[i];
        return (
          <View
            key={item.id}
            style={{
              position: "absolute",
              left: i * stepX,
              top: i * STEP_Y,
              width: frontWidth,
              height: posterHeight,
              zIndex: count - i,
            }}
            className="overflow-hidden rounded-sm border border-surface-border bg-surface-overlay"
          >
            {item.cover_image_url ? (
              <Image
                source={{ uri: item.cover_image_url }}
                className="h-full w-full"
                contentFit="cover"
                accessible={false}
              />
            ) : null}
            {/* Dim the cards behind the front so the #1 favorite pops. */}
            {i > 0 ? (
              <View className="absolute inset-0 bg-surface-default/40" />
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}
