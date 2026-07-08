/**
 * OverviewTab — the "Profile" segment of the shared `ProfileView`. Mirrors the
 * top of web's `/u/[username]`: the Top-4 favorites, a Recent activity preview,
 * and a Recent reviews preview. Each block self-hides when empty; a thin
 * divider separates the visible blocks; when EVERYTHING is empty a single muted
 * "Nothing here yet." shows.
 *
 * All data arrives via the `src/queries/profile.ts` hooks (no inline supabase):
 *   - `useProfileTopFours`   → the four `__top5_<type>` favorites shelves.
 *   - `useProfileRecentActivity` / `useProfileRecentReviews` → activity_log.
 *
 * Favorites render via `FavoritesShowcase` — one "Favorites" row of fanned
 * per-type decks that expand to fill the row on tap (see that file). Activity /
 * reviews render as `ActivityRow` lists (shared `formatActivity` phrasing),
 * each with a "See all ›" affordance (full screens land in M6).
 *
 * Owner sign-out: NOT rendered here — `ProfileView`'s `SegmentBody` keeps the
 * existing `SignOutButton` after this component for the owner (there's no
 * settings surface yet), so the action isn't lost. `isOwner` is accepted for
 * symmetry / future owner-only Overview affordances.
 *
 * Mobile primitives only; icons color via the `color` PROP.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { MediaType } from "@intertaind/types";

import { ActivityRow } from "@/components/profile/activity-row";
import { FavoritesShowcase } from "@/components/profile/favorites-showcase";
import {
  useProfileRecentActivity,
  useProfileRecentReviews,
  useProfileTopFours,
} from "@/queries/profile";

/** Fixed media-type order for the favorites empty-check (movie → tv → book → game). */
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

  // Collect the present sections, then render them with a thin divider between
  // each visible pair (so a hidden section never leaves a dangling line).
  const sections: { key: string; node: ReactNode }[] = [];

  if (hasFavorites) {
    sections.push({
      key: "favorites",
      // The stacked-deck showcase: one "Favorites" row of fanned decks that
      // expand to fill the row per type (see FavoritesShowcase).
      node: <FavoritesShowcase topFours={topFours!} />,
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
