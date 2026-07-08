/**
 * MediaRail — a titled, horizontal poster rail for the home screen. The RN
 * analogue of a web homepage rail (apps/web/src/app/page.tsx's popular
 * sections): a section heading over a horizontally scrolling row of
 * `MediaCard`s. The SAME rail renders every home section (Continue,
 * Recommended, and the four Popular rails) because they all deal in
 * `HomeMediaItem`s — `ContinueItem` extends `HomeMediaItem`, so a Continue
 * array is assignable here too.
 *
 * ── Why raw HomeMediaItem[] (not pre-adapted CardMedia[]) ────────────────
 * The rail takes the raw `HomeMediaItem[]` and calls `cardMediaFromHomeItem`
 * PER CELL — the raw row keys the list + feeds the adapter. Rail cards render
 * `showMeta={false}`, so there's no title/stars/heart/year beneath the poster
 * (a denser carousel — a rail card is just the poster + its quick-actions
 * slider); the community `avg_rating` isn't shown here, so it isn't passed.
 * The viewer's own state still flows via `trackingMap` (keyed by catalog id)
 * for the quick-actions tab's active states.
 *
 * ── Fixed cell width ────────────────────────────────────────────────────
 * Each cell is a fixed-width `View` (`CARD_WIDTH`) wrapping the width-flexible
 * `MediaCard` (its root is `w-full`, so the CELL owns the width — same split
 * as cast-slider.tsx). A fixed width keeps posters uniform across a rail and
 * lets ~3 posters + a peek show across a phone, cueing horizontal scroll.
 *
 * ── Self-hide ───────────────────────────────────────────────────────────
 * Returns `null` for an empty array so each home section vanishes when its
 * hook has nothing (a signed-out viewer has no Continue/Recommended; a new
 * catalog has no Popular). The screen renders all six rails unconditionally
 * and lets each decide whether to appear.
 */
import { FlatList, Text, View } from "react-native";

import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import type { HomeMediaItem, ViewerTrackingState } from "@/queries/home";

/**
 * Rail cell width in pt — a compact 2:3 rail poster. Sized so ~3 posters
 * plus a peek fit across a phone (cueing horizontal scroll), a touch wider
 * than cast-slider's 72pt profile cards since a poster carries a title +
 * meta row beneath it.
 */
const CARD_WIDTH = 112;

/** Gap between cells + the rail's leading/trailing inset, matching the
 *  house horizontal-list style (cast-slider uses gap 12). */
const CARD_GAP = 12;
const RAIL_PADDING = 16;

/**
 * A single titled horizontal rail. Self-hides on an empty `items`. Adapts
 * each `HomeMediaItem` to a `CardMedia` per cell (see file header) and
 * overlays the viewer's per-card tracking from `trackingMap`.
 */
export function MediaRail({
  title,
  items,
  trackingMap,
  onMutated,
}: {
  title: string;
  /** Raw catalog rows for this rail (ContinueItem is assignable). */
  items: HomeMediaItem[];
  /** Viewer's per-card tracking, keyed by catalog media id. */
  trackingMap: Map<string, ViewerTrackingState>;
  /** Called after a card's quick-action write so the screen can refresh
      the batched tracking map (the card's active states then update). */
  onMutated?: () => void;
}) {
  // Self-hide: an empty section renders nothing.
  if (items.length === 0) return null;

  return (
    <View className="pb-4">
      <Text className="px-4 pb-2 text-base font-semibold text-text-primary">
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        // Catalog rows always carry an id; fall back to title only as a
        // defensive guard (should never fire for a home rail).
        keyExtractor={(item) => item.id ?? item.title}
        contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: RAIL_PADDING }}
        renderItem={({ item }) => {
          const media = cardMediaFromHomeItem(item);
          // Viewer override for this card (rating/heart); null = untracked,
          // so the card falls back to the community avg below.
          const tracking = trackingMap.get(media.mediaItemId ?? "") ?? null;
          return (
            <View style={{ width: CARD_WIDTH }}>
              {/* Rail cards are poster + quick-actions slider only — no title/
                  meta beneath (showMeta={false}) for a denser carousel. */}
              <MediaCard
                media={media}
                tracking={tracking}
                onMutated={onMutated}
                showMeta={false}
                compact
              />
            </View>
          );
        }}
      />
    </View>
  );
}
