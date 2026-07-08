/**
 * OverviewTab — the Overview segment of the shared `ProfileView`. Mirrors the
 * top of web's `/u/[username]`: the Top-4 favorites (per media type), a Recent
 * activity preview, and a Recent reviews preview. Each block self-hides when
 * empty; when EVERYTHING is empty a single muted "Nothing here yet." shows.
 *
 * All data arrives via the `src/queries/profile.ts` hooks (no inline supabase):
 *   - `useProfileTopFours`   → the four `__top5_<type>` favorites shelves.
 *   - `useProfileRecentActivity` / `useProfileRecentReviews` → activity_log.
 *
 * Favorites are catalog `media_items` rows, so they adapt through
 * `cardMediaFromHomeItem` into `MediaCard` (poster-only: `showMeta={false}`,
 * `compact`) laid out as a small poster row per type. Activity rows render via
 * `ActivityRow` (shared `formatActivity` phrasing).
 *
 * Owner sign-out: NOT rendered here — `ProfileView`'s `SegmentBody` keeps the
 * existing `SignOutButton` after this component for the owner (there's no
 * settings surface yet), so the action isn't lost. `isOwner` is accepted for
 * symmetry / future owner-only Overview affordances.
 *
 * Mobile primitives only; icons color via the `color` PROP.
 */
import { Text, View } from "react-native";
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

  return (
    <View className="gap-6">
      {/* ── Favorites ─────────────────────────────────────────────────── */}
      {hasFavorites ? (
        <View className="gap-5">
          {favoriteTypes.map((type) => (
            <FavoriteSection
              key={type}
              label={MEDIA_TYPE_CONFIG[type].label}
              items={topFours![type]}
            />
          ))}
        </View>
      ) : null}

      {/* ── Recent activity ───────────────────────────────────────────── */}
      {activity.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Recent activity</SectionHeading>
          <View>
            {activity.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Recent reviews ────────────────────────────────────────────── */}
      {reviews.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Recent reviews</SectionHeading>
          <View>
            {reviews.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Everything empty ──────────────────────────────────────────── */}
      {anySettled && everythingEmpty ? (
        <Text className="text-center text-sm text-text-muted">
          Nothing here yet.
        </Text>
      ) : null}
    </View>
  );
}

/** A section title above a favorites grid / activity list. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-base font-semibold text-text-primary">
      {children}
    </Text>
  );
}

/**
 * One media-type favorites block: a label + a row of up to 4 poster-only
 * `MediaCard`s (fixed-width cells so the posters keep their 2:3 ratio). The
 * cards are catalog rows → `cardMediaFromHomeItem`; `showMeta={false}` +
 * `compact` keeps them poster-only and dense.
 */
function FavoriteSection({
  label,
  items,
}: {
  label: string;
  items: HomeMediaItem[];
}) {
  return (
    <View className="gap-2">
      <SectionHeading>{label}</SectionHeading>
      <View className="flex-row gap-3">
        {items.map((item) => (
          <View key={item.id} className="w-[22%]">
            <MediaCard
              media={cardMediaFromHomeItem(item)}
              showMeta={false}
              compact
            />
          </View>
        ))}
      </View>
    </View>
  );
}
