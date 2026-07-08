/**
 * OverviewTab — the Overview segment of the shared `ProfileView`. Mirrors the
 * top of web's `/u/[username]`: the Top-4 favorites (per media type), a Recent
 * activity preview, and a Recent reviews preview. Each block self-hides when
 * empty; a thin divider separates the visible blocks; when EVERYTHING is empty
 * a single muted "Nothing here yet." shows.
 *
 * All data arrives via the `src/queries/profile.ts` hooks (no inline supabase):
 *   - `useProfileTopFours`   → the four `__top5_<type>` favorites shelves.
 *   - `useProfileRecentActivity` / `useProfileRecentReviews` → activity_log.
 *
 * Favorites are catalog `media_items` rows, so they adapt through
 * `cardMediaFromHomeItem` into `MediaCard` as PURE POSTERS (`showMeta={false}`
 * + `showActions={false}` — no title/meta, no quick-actions tab), laid out as a
 * small poster row per type under a "Favorite {type}" heading. Activity rows
 * render via `ActivityRow` (shared `formatActivity` phrasing).
 *
 * Owner sign-out: NOT rendered here — `ProfileView`'s `SegmentBody` keeps the
 * existing `SignOutButton` after this component for the owner (there's no
 * settings surface yet), so the action isn't lost. `isOwner` is accepted for
 * symmetry / future owner-only Overview affordances.
 *
 * Mobile primitives only; icons color via the `color` PROP.
 */
import type { ReactNode } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";

import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import { ActivityRow } from "@/components/profile/activity-row";
import type { HomeMediaItem } from "@/queries/home";
import {
  useProfileRecentActivity,
  useProfileRecentReviews,
  useProfileTopFours,
} from "@/queries/profile";

/** Fixed media-type order for the favorites sections (movie → tv → book → game). */
const FAVORITE_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];

/** Favorites row geometry. The four posters are sized to EXACTLY fill the
 *  content width (mirrors the search grid) so a full row's left/right margins
 *  both equal the container padding — no slack collecting on the right. */
const FAV_COLUMNS = 4;
const FAV_GAP = 12; // gutter between the four posters
/** Horizontal padding of the segment content — ProfileView's SegmentBody wraps
 *  each segment in `px-4` (16pt each side); the cell width subtracts it. Keep
 *  in sync if that padding changes. */
const CONTENT_H_PADDING = 16;

export function OverviewTab({
  userId,
  // Accepted for symmetry with the other segments + future owner-only Overview
  // affordances; sign-out itself stays in ProfileView's SegmentBody.
  isOwner: _isOwner,
}: {
  userId: string;
  isOwner: boolean;
}) {
  const topFoursQuery = useProfileTopFours(userId);
  const activityQuery = useProfileRecentActivity(userId);
  const reviewsQuery = useProfileRecentReviews(userId);

  const topFours = topFoursQuery.data;
  const activity = activityQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  // Which favorite types actually have items (skip empty types entirely).
  const favoriteTypes = topFours
    ? FAVORITE_ORDER.filter((type) => topFours[type].length > 0)
    : [];
  const hasFavorites = favoriteTypes.length > 0;

  // Still loading the first paint of every section → render nothing (the
  // ProfileView already showed a spinner for the profile itself; the sections
  // pop in). Only show "Nothing here yet." once the reads have SETTLED empty.
  const anySettled =
    !topFoursQuery.isPending ||
    !activityQuery.isPending ||
    !reviewsQuery.isPending;
  const everythingEmpty =
    !hasFavorites && activity.length === 0 && reviews.length === 0;

  // Collect the present sections, then render them with a thin divider between
  // each visible pair (so a hidden section never leaves a dangling line).
  const sections: { key: string; node: ReactNode }[] = [];

  if (hasFavorites) {
    sections.push({
      key: "favorites",
      node: (
        <View className="gap-5">
          {favoriteTypes.map((type) => (
            <FavoriteSection
              key={type}
              label={`Favorite ${MEDIA_TYPE_CONFIG[type].label}`}
              items={topFours![type]}
            />
          ))}
        </View>
      ),
    });
  }

  if (activity.length > 0) {
    sections.push({
      key: "activity",
      node: (
        <View className="gap-2">
          {/* TODO(M6): route to the full activity screen. */}
          <SectionHeaderRow title="Recent activity" onSeeAll={() => {}} />
          <View>
            {activity.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </View>
        </View>
      ),
    });
  }

  if (reviews.length > 0) {
    sections.push({
      key: "reviews",
      node: (
        <View className="gap-2">
          {/* TODO(M6): route to the full reviews screen. */}
          <SectionHeaderRow title="Recent reviews" onSeeAll={() => {}} />
          <View>
            {reviews.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </View>
        </View>
      ),
    });
  }

  return (
    <View>
      {sections.map((section, i) => (
        <View key={section.key}>
          {/* Thin divider between visible sections (not before the first). */}
          {i > 0 ? <View className="my-5 h-px bg-surface-border" /> : null}
          {section.node}
        </View>
      ))}

      {anySettled && everythingEmpty ? (
        <Text className="text-center text-sm text-text-muted">
          Nothing here yet.
        </Text>
      ) : null}
    </View>
  );
}

/** A section title above a favorites grid / activity list. */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text className="text-base font-semibold text-text-primary">
      {children}
    </Text>
  );
}

/**
 * A section header with a trailing "See all ›" affordance — used by the Recent
 * activity / reviews previews to open their full screen (wired in M6). The
 * arrow is right-aligned; the title keeps the standard heading style.
 */
function SectionHeaderRow({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <SectionHeading>{title}</SectionHeading>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`See all ${title.toLowerCase()}`}
        hitSlop={8}
        className="flex-row items-center gap-0.5 active:opacity-60"
        onPress={onSeeAll}
      >
        <Text className="text-xs font-medium text-text-muted">See all</Text>
        <ChevronRight size={16} color={colors["text-muted"]} />
      </Pressable>
    </View>
  );
}

/**
 * One media-type favorites block: a "Favorite {type}" label + a row of up to 4
 * PURE-POSTER `MediaCard`s (fixed-width cells keep the 2:3 ratio). The cards are
 * catalog rows → `cardMediaFromHomeItem`; `showMeta={false}` + `showActions={false}`
 * strip the title/meta AND the quick-actions tab, leaving just tappable cover art.
 */
function FavoriteSection({
  label,
  items,
}: {
  label: string;
  items: HomeMediaItem[];
}) {
  const { width } = useWindowDimensions();
  // Fixed poster width so 4 cells + 3 gutters exactly fill the content width —
  // a full row's outer margins then equal the container padding on both sides,
  // and a partial (<4) row left-aligns at the same size.
  const cellWidth =
    (width - CONTENT_H_PADDING * 2 - FAV_GAP * (FAV_COLUMNS - 1)) / FAV_COLUMNS;

  return (
    <View className="gap-2">
      <SectionHeading>{label}</SectionHeading>
      <View className="flex-row" style={{ gap: FAV_GAP }}>
        {items.map((item) => (
          <View key={item.id} style={{ width: cellWidth }}>
            <MediaCard
              media={cardMediaFromHomeItem(item)}
              showMeta={false}
              showActions={false}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
