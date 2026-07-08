/**
 * FavoritesShowcase — the profile's Top-4 favorites as a single animated row of
 * stacked "decks" (one per media type) that expand to fill the row on tap.
 *
 * ── Collapsed ───────────────────────────────────────────────────────────
 * One row, titled "Favorites", with a fanned deck per type that has favorites.
 * Each deck layers up to 4 posters: the #1 favorite is frontmost + leftmost
 * (full, on top); #2–#4 fan right, behind, and dimmed. The decks split the
 * content row into quarter-slots.
 *
 * ── Expanded (tap a deck) ───────────────────────────────────────────────
 * The tapped type's posters SLIDE + SPREAD across the row to fill it, while the
 * other decks slide OFF-SCREEN (left if they're before the tapped deck, right
 * if after) and fade out. The title switches to "Favorite {type}" with a back
 * chevron; tapping it runs the whole thing in reverse to RESTACK.
 *
 * ── How it's animated ───────────────────────────────────────────────────
 * A single reanimated shared value `progress` (0 = collapsed → 1 = expanded)
 * drives everything on the UI thread. Every poster is absolutely positioned and
 * interpolates its {left, top, width, height, opacity} between a precomputed
 * COLLAPSED box (its slot in the fan) and an EXPANDED box (spread to fill, or
 * off-screen if its deck isn't the tapped one). The stage height interpolates
 * too, so the sections below settle smoothly. Boxes are computed in plain JS
 * per render; the worklets only `interpolate` between the two — keeping the
 * UI-thread code trivial.
 *
 * Mobile primitives only; `Image` from `@/components/image`; design tokens.
 */
import { useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";

import { Image } from "@/components/image";
import type { HomeMediaItem } from "@/queries/home";

/** Fixed type order for the decks (movie → tv → book → game). */
const FAVORITE_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];
/** Max posters per deck / expanded row (the row splits into this many slots). */
const MAX_ITEMS = 4;
/** Content padding (ProfileView's SegmentBody `px-4`) + inter-slot gutter. */
const H_PADDING = 16;
const GAP = 12;
/** Frontmost poster size (collapsed) as a fraction of a slot; leaves fan room. */
const FRONT_FRACTION = 0.62;
/** Vertical peek (pt) per card behind the front in a collapsed deck. */
const STEP_Y = 6;
/** Dark overlay opacity on the behind-cards when collapsed (fades to 0 open). */
const BEHIND_DIM = 0.45;
/** Expand/collapse duration (ms). */
const DURATION = 300;

/** A poster's absolute box + opacity at one end of the transition. */
type Box = { left: number; top: number; width: number; height: number; opacity: number };

export function FavoritesShowcase({
  topFours,
}: {
  topFours: Record<MediaType, HomeMediaItem[]>;
}) {
  const { width } = useWindowDimensions();
  // `expandedType` drives the GEOMETRY (which deck is spread / others off) and
  // must stay set through the collapse animation so the posters restack. The
  // TITLE + back chevron read a separate `titleType` that flips INSTANTLY on
  // click (so "Favorite X" reverts to "Favorites" immediately, not when the
  // animation ends).
  const [expandedType, setExpandedType] = useState<MediaType | null>(null);
  const [titleType, setTitleType] = useState<MediaType | null>(null);
  const progress = useSharedValue(0);

  const types = FAVORITE_ORDER.filter((t) => topFours[t]?.length > 0);

  // Slot grid: MAX_ITEMS quarter-slots. A collapsed deck sits in one slot; an
  // expanded poster is one slot wide.
  const contentWidth = width - H_PADDING * 2;
  const cell = (contentWidth - GAP * (MAX_ITEMS - 1)) / MAX_ITEMS;
  const frontW = cell * FRONT_FRACTION;
  const frontH = frontW * 1.5;
  const fullH = cell * 1.5;
  const fanStep = (cell - frontW) / (MAX_ITEMS - 1);

  const expandedIndex = expandedType ? types.indexOf(expandedType) : -1;
  const collapsedStageH = frontH + STEP_Y * (MAX_ITEMS - 1);

  /** Collapsed + expanded boxes for the poster at deck `ti`, depth `i`. */
  const boxesFor = (ti: number, i: number): { c: Box; e: Box } => {
    const c: Box = {
      left: ti * (cell + GAP) + i * fanStep,
      top: i * STEP_Y,
      width: frontW,
      height: frontH,
      opacity: 1,
    };
    let e: Box;
    if (ti === expandedIndex) {
      // The tapped deck: spread to fill the row.
      e = { left: i * (cell + GAP), top: 0, width: cell, height: fullH, opacity: 1 };
    } else {
      // Everyone else: slide off (left if before the tapped deck, right if
      // after — or right by default while idle) and fade.
      const offLeft = ti < expandedIndex;
      e = {
        left: offLeft ? -frontW - GAP : contentWidth + GAP,
        top: i * STEP_Y,
        width: frontW,
        height: frontH,
        opacity: 0,
      };
    }
    return { c, e };
  };

  const expand = (type: MediaType) => {
    setExpandedType(type);
    setTitleType(type);
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) });
  };
  const collapse = () => {
    // Title reverts to "Favorites" NOW; geometry (expandedType) clears only
    // once the restack animation finishes.
    setTitleType(null);
    progress.value = withTiming(
      0,
      { duration: DURATION, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setExpandedType)(null);
      },
    );
  };

  const stageStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [collapsedStageH, fullH]),
  }));

  // No favorites of any type → render nothing. Placed AFTER all hooks (the
  // showcase's own + none below) so hook order stays stable across renders.
  if (types.length === 0) return null;

  const title = titleType
    ? `Favorite ${MEDIA_TYPE_CONFIG[titleType].label}`
    : "Favorites";

  return (
    <View className="gap-2">
      {/* Title row — a back chevron appears when expanded (reverts instantly). */}
      <View className="flex-row items-center gap-1.5">
        {titleType ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to all favorites"
            hitSlop={8}
            className="active:opacity-60"
            onPress={collapse}
          >
            <ChevronLeft size={20} color={colors["text-primary"]} />
          </Pressable>
        ) : null}
        <Text className="text-base font-semibold text-text-primary">
          {title}
        </Text>
      </View>

      {/* The animated stage — absolute posters over an interpolated height. */}
      <Animated.View style={[{ width: contentWidth }, stageStyle]}>
        {types.map((type, ti) =>
          topFours[type].slice(0, MAX_ITEMS).map((item, i) => {
            const { c, e } = boxesFor(ti, i);
            // Front card on top; a deck's cards stack front-over-back.
            const zIndex = MAX_ITEMS - i;
            // Interactive when idle (any deck tap → expand) or when it's the
            // expanded deck (poster tap → open). Off-screen decks are inert.
            const interactive = expandedIndex === -1 || ti === expandedIndex;
            return (
              <AnimatedPoster
                key={`${type}-${item.id}`}
                item={item}
                c={c}
                e={e}
                depth={i}
                zIndex={zIndex}
                progress={progress}
                interactive={interactive}
                isExpandedDeck={ti === expandedIndex}
                onExpand={() => expand(type)}
              />
            );
          }),
        )}
      </Animated.View>
    </View>
  );
}

/**
 * One animated poster: an absolutely-positioned card that interpolates between
 * its collapsed box `c` and expanded box `e` on the shared `progress`. Tapping
 * it expands its deck (when collapsed) or opens the title (when it's the
 * expanded deck). Behind-cards carry a dark overlay that fades out as it opens.
 */
function AnimatedPoster({
  item,
  c,
  e,
  depth,
  zIndex,
  progress,
  interactive,
  isExpandedDeck,
  onExpand,
}: {
  item: HomeMediaItem;
  c: Box;
  e: Box;
  depth: number;
  zIndex: number;
  progress: SharedValue<number>;
  interactive: boolean;
  isExpandedDeck: boolean;
  onExpand: () => void;
}) {
  const router = useRouter();

  const style = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [c.left, e.left]),
    top: interpolate(progress.value, [0, 1], [c.top, e.top]),
    width: interpolate(progress.value, [0, 1], [c.width, e.width]),
    height: interpolate(progress.value, [0, 1], [c.height, e.height]),
    opacity: interpolate(progress.value, [0, 1], [c.opacity, e.opacity]),
  }));

  // Behind-cards are dimmed while stacked; the dim fades as the deck opens.
  const dimStyle = useAnimatedStyle(() => ({
    opacity: depth > 0 ? interpolate(progress.value, [0, 1], [BEHIND_DIM, 0]) : 0,
  }));

  const onPress = () => {
    if (isExpandedDeck) router.push(`/media/${item.id}`);
    else onExpand();
  };

  return (
    <Animated.View
      style={[{ position: "absolute", zIndex }, style]}
      pointerEvents={interactive ? "auto" : "none"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isExpandedDeck ? `Open ${item.title}` : item.title}
        className="h-full w-full overflow-hidden rounded-sm border border-surface-border bg-surface-overlay active:opacity-90"
        onPress={onPress}
      >
        {item.cover_image_url ? (
          <Image
            source={{ uri: item.cover_image_url }}
            className="h-full w-full"
            contentFit="cover"
            accessible={false}
          />
        ) : null}
        <Animated.View
          pointerEvents="none"
          className="absolute inset-0 bg-surface-default"
          style={dimStyle}
        />
      </Pressable>
    </Animated.View>
  );
}
