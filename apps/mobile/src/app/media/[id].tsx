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
 *
 * Visual language (Intertaind, mirroring the web app): a full-bleed
 * backdrop hero fades into the near-black `surface-default` via a
 * react-native-svg `LinearGradient` (the RN analogue of web's
 * `from-background to-transparent`), so content sits on solid bg. The
 * poster overlaps the hero fade (a mobile detail-screen convention),
 * the title block carries the media-type accent, and the community
 * counts read as a clean spaced row.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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

/** Hero height in pt — the backdrop + its gradient fade. */
const HERO_HEIGHT = 288;

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
          // Transparent header so the backdrop hero reads full-bleed
          // behind the native back button (web's edge-to-edge hero).
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
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
            className="rounded-sm bg-brand px-4 py-3 active:opacity-70"
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

/**
 * The hero backdrop + its bottom-fading gradient. The gradient is a
 * react-native-svg `LinearGradient` (NativeWind can't express a
 * multi-stop gradient), fading from transparent at the top to opaque
 * `surface-default` across the lower ~60% — the RN analogue of web's
 * `bg-gradient-to-t from-background to-transparent`, so the content
 * below lands on solid page background.
 */
function BackdropHero({ backdropUrl }: { backdropUrl: string | null }) {
  return (
    <View style={{ height: HERO_HEIGHT }} className="w-full">
      {backdropUrl ? (
        <Image
          source={{ uri: backdropUrl }}
          className="h-full w-full"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        // No backdrop — a solid raised block of the same height keeps
        // the poster overlap consistent.
        <View className="h-full w-full bg-surface-raised" />
      )}

      {/* Bottom-to-transparent fade to solid page bg. Decorative. */}
      <View className="absolute inset-0" pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0.35"
                stopColor={colors["surface-default"]}
                stopOpacity={0}
              />
              <Stop
                offset="1"
                stopColor={colors["surface-default"]}
                stopOpacity={1}
              />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
        </Svg>
      </View>
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
    // automaticallyAdjustKeyboardInsets: iOS-only (no-op on Android) —
    // insets the scroll view so the review editor isn't covered by the
    // keyboard; Android already resizes via windowSoftInputMode.
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: 48 }}
    >
      {/* Full-bleed backdrop hero with its bottom fade. */}
      <BackdropHero backdropUrl={item.backdrop_url} />

      {/* Poster + title block, pulled up to straddle the hero fade
          (the mobile detail-screen overlap pattern). */}
      <View className="-mt-24 flex-row gap-4 px-4">
        {item.cover_image_url ? (
          <Image
            source={{ uri: item.cover_image_url }}
            // 112pt-wide 2:3 cover, sharp corners + hairline border to
            // match web's poster treatment; shadow lifts it off the bg.
            className="aspect-[2/3] w-28 rounded-sm border border-surface-border bg-surface-overlay"
            contentFit="cover"
            accessible
            accessibilityLabel={`${item.title} cover`}
            // iOS drop shadow to lift the poster off the faded hero.
            // (expo-image's ImageStyle omits Android `elevation`; the
            // hairline border carries the separation on Android.)
            style={{
              shadowColor: colors["surface-default"],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
            }}
          />
        ) : (
          <View className="aspect-[2/3] w-28 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay">
            <Text className="text-xs text-text-muted">No cover</Text>
          </View>
        )}

        {/* Title + type/year + rating — bottom-aligned so it sits on the
            poster's lower half where the hero has fully faded. */}
        <View className="flex-1 justify-end gap-1 pb-1">
          <Text className="text-2xl font-bold text-text-primary">
            {item.title}
          </Text>
          <Text className={`text-sm ${type.color}`}>
            {type.label}
            {year ? <Text className="text-text-muted"> · {year}</Text> : null}
          </Text>
          {/* Migration 025 COALESCEs avg_rating to 0 for unrated
              items, so gate on rating_count — "★ 0.0 (0 ratings)"
              reads as a terrible score, not an absence of one.
              avg_rating is already 0–5 (SQL-divided): no ÷2 here. */}
          {(item.rating_count ?? 0) > 0 && item.avg_rating != null ? (
            <Text className="text-sm text-text-secondary">
              <Text style={{ color: colors["accent-game"] }}>★</Text>{" "}
              {Number(item.avg_rating).toFixed(1)}
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

      <View className="gap-6 px-4 pt-6">
        {/* Community counts — a clean spaced row (count over label),
            fixing the old run-together "TrackingCompletedFavorites". */}
        <View className="flex-row gap-8 rounded-sm border border-surface-border bg-surface-raised px-4 py-3">
          <StatBlock count={item.tracking_count ?? 0} label="Tracking" />
          <StatBlock count={item.completed_count} label="Completed" />
          <StatBlock count={item.favorites_count} label="Favorites" />
        </View>

        {/* Description */}
        {item.description ? (
          <Text className="text-sm leading-relaxed text-text-secondary">
            {item.description}
          </Text>
        ) : null}

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
    <View className="gap-0.5">
      <Text className="text-base font-semibold text-text-primary">
        {count.toLocaleString()}
      </Text>
      <Text className="text-xs text-text-muted">{label}</Text>
    </View>
  );
}
