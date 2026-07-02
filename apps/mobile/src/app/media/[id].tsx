/**
 * Media detail — catalog info (M1) + the viewer's tracking panel (M2).
 *
 * Top-level route (sibling of the `(auth)`/`(tabs)` groups) so it
 * pushes onto the root Stack OVER the tabs with a native back button.
 * The root layout hides headers globally; this screen opts back in via
 * `<Stack.Screen options>` (the expo-router per-screen idiom) because a
 * pushed detail screen needs the native back affordance.
 *
 * Route gating: `RootNavigator` only redirects signed-in users away
 * from `(auth)` routes, so this route renders freely for them. Signed-
 * OUT users are redirected to login (`!session && !inAuthGroup`), which
 * makes this screen signed-in-only for now — acceptable while the only
 * entry points are inside the tabs (and why `TrackingPanel` needs no
 * signed-out treatment).
 *
 * The screen stays thin: all tracking mutations live inside
 * `TrackingPanel` (components/media/tracking-panel.tsx); this file only
 * feeds it the media item + the viewer's row.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";
import { TrackingPanel } from "@/components/media/tracking-panel";
import {
  useMediaDetail,
  useViewerTracking,
  type MediaDetailItem,
} from "@/queries/media";

/**
 * Label + accent class for a media type. The DB enum is a superset of
 * the domain `MediaType` (it already contains `board_game`), so fall
 * back to the raw enum value for types the config doesn't know yet.
 */
function mediaTypeDisplay(mediaType: Tables<"media_items">["media_type"]): {
  label: string;
  color: string;
} {
  if (mediaType in MEDIA_TYPE_CONFIG) {
    const config = MEDIA_TYPE_CONFIG[mediaType as MediaType];
    return { label: config.label, color: config.color };
  }
  return { label: mediaType, color: "text-text-muted" };
}

/** First 4 digits of an ISO date string, mirroring web's yearFromDateString. */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMediaDetail(id);
  const tracking = useViewerTracking(id);

  return (
    <View className="flex-1 bg-surface-default">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "",
          headerStyle: { backgroundColor: colors["surface-default"] },
          headerTintColor: colors["text-primary"],
          headerShadowVisible: false,
        }}
      />

      {detail.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-text-primary">
            Couldn&apos;t load this title.
          </Text>
          <Text className="text-center text-xs text-text-muted">
            {detail.error.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading this title"
            className="rounded-lg bg-brand px-4 py-3 active:opacity-70"
            onPress={() => detail.refetch()}
          >
            <Text className="font-semibold text-text-primary">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <MediaDetailBody
          item={detail.data}
          viewerRow={tracking.data ?? null}
          // isLoading = pending AND actually fetching (i.e. enabled) —
          // a disabled (signed-out) query stays "pending" forever and
          // must not render as an eternal placeholder.
          trackingPending={tracking.isLoading}
        />
      )}
    </View>
  );
}

function MediaDetailBody({
  item,
  viewerRow,
  trackingPending,
}: {
  item: MediaDetailItem;
  viewerRow: Tables<"user_media"> | null;
  trackingPending: boolean;
}) {
  const type = mediaTypeDisplay(item.media_type);
  const year = yearFrom(item.release_date);

  return (
    // keyboardShouldPersistTaps: without it, the first tap on the
    // review editor's Save button only dismisses the keyboard.
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      {/* Backdrop hero — decorative, hidden from a11y tree. */}
      {item.backdrop_url ? (
        <Image
          source={{ uri: item.backdrop_url }}
          className="h-52 w-full"
          contentFit="cover"
          accessible={false}
        />
      ) : null}

      <View className="gap-6 px-4 py-4 pb-12">
        {/* Cover + title block */}
        <View className="flex-row gap-4">
          {item.cover_image_url ? (
            <Image
              source={{ uri: item.cover_image_url }}
              className="h-36 w-24 rounded-md bg-surface-overlay"
              contentFit="cover"
              accessible
              accessibilityLabel={`${item.title} cover`}
            />
          ) : (
            <View className="h-36 w-24 items-center justify-center rounded-md bg-surface-overlay">
              <Text className="text-xs text-text-muted">No cover</Text>
            </View>
          )}

          <View className="flex-1 justify-center gap-1">
            <Text className="text-2xl font-bold text-text-primary">
              {item.title}
            </Text>
            <Text className={`text-sm ${type.color}`}>
              {type.label}
              {year ? (
                <Text className="text-text-muted"> · {year}</Text>
              ) : null}
            </Text>
            {/* Migration 025 COALESCEs avg_rating to 0 for unrated
                items, so gate on rating_count — "★ 0.0 (0 ratings)"
                reads as a terrible score, not an absence of one.
                avg_rating is already 0–5 (SQL-divided): no ÷2 here. */}
            {(item.rating_count ?? 0) > 0 && item.avg_rating != null ? (
              <Text className="text-sm text-text-secondary">
                ★ {Number(item.avg_rating).toFixed(1)}
                <Text className="text-text-muted">
                  {" "}
                  ({item.rating_count}{" "}
                  {item.rating_count === 1 ? "rating" : "ratings"})
                </Text>
              </Text>
            ) : (
              <Text className="text-sm text-text-muted">No ratings yet</Text>
            )}
          </View>
        </View>

        {/* Description */}
        {item.description ? (
          <Text className="text-base leading-relaxed text-text-secondary">
            {item.description}
          </Text>
        ) : null}

        {/* Denormalized community counts */}
        <View className="flex-row justify-around rounded-lg bg-surface-raised px-4 py-3">
          <StatBlock count={item.tracking_count ?? 0} label="Tracking" />
          <StatBlock count={item.completed_count} label="Completed" />
          <StatBlock count={item.favorites_count} label="Favorites" />
        </View>

        {/* Viewer tracking panel — status/rating/review/favorite/remove
            (replaces M1's read-only badge; the "…" in-flight treatment
            lives inside the panel via trackingPending). */}
        <TrackingPanel
          media={item}
          viewerRow={viewerRow}
          trackingPending={trackingPending}
        />
      </View>
    </ScrollView>
  );
}

function StatBlock({ count, label }: { count: number; label: string }) {
  return (
    <View className="items-center gap-0.5">
      <Text className="text-base font-semibold text-text-primary">
        {count.toLocaleString()}
      </Text>
      <Text className="text-xs text-text-muted">{label}</Text>
    </View>
  );
}
