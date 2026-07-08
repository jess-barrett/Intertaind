/**
 * ActivityRow — one line of the profile Overview's Recent activity / Recent
 * reviews lists. The RN analogue of web's `ActivityItem` distilled to a compact
 * row: a small cover thumbnail (or a muted media-type glyph fallback), the
 * `formatActivity(row)` sentence, and a relative timestamp. The WHOLE row is a
 * Pressable → `/media/<media_id>` when the row carries a media id (list-only
 * activities like created_list have none, so those rows aren't tappable).
 *
 * The sentence phrasing comes from the shared `formatActivity` (@intertaind/
 * types) so mobile + web read consistently. Mobile primitives only; the glyph
 * colors via the `color` PROP (react-native-svg), never a className.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatActivity, type MediaType } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { timeAgo } from "@/lib/time";
import type { ProfileActivityRow } from "@/queries/profile";

/** Fallback glyph for a row whose media has no cover (or no media at all). */
function CoverFallback({ mediaType }: { mediaType: MediaType | null }) {
  const Icon = mediaType ? MEDIA_TYPE_ICONS[mediaType] : null;
  return (
    <View className="h-full w-full items-center justify-center">
      {Icon ? <Icon size={16} color={colors["text-muted"]} /> : null}
    </View>
  );
}

export function ActivityRow({ row }: { row: ProfileActivityRow }) {
  const router = useRouter();
  const cover = row.media?.cover_image_url ?? null;
  // The DB enum has a 5th type (board_game) the profile never surfaces; the
  // glyph map is keyed by the 4 domain types, so narrow (or null) it here.
  const mediaType = (row.media?.media_type ?? null) as MediaType | null;
  const canOpen = !!row.media_id;

  return (
    <Pressable
      accessibilityRole={canOpen ? "button" : undefined}
      accessibilityLabel={canOpen ? formatActivity(row) : undefined}
      disabled={!canOpen}
      className="flex-row items-center gap-3 py-1.5 active:opacity-70"
      onPress={
        canOpen ? () => router.push(`/media/${row.media_id}`) : undefined
      }
    >
      {/* Cover thumbnail — 2:3, with the muted type-glyph fallback. */}
      <View className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {cover ? (
          <Image
            source={{ uri: cover }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={row.media?.title ?? "Cover"}
          />
        ) : (
          <CoverFallback mediaType={mediaType} />
        )}
      </View>

      {/* Sentence + relative time. */}
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text
          className="min-w-0 flex-1 text-sm text-text-secondary"
          numberOfLines={2}
        >
          {formatActivity(row)}
        </Text>
        {row.created_at ? (
          <Text className="shrink-0 text-xs text-text-muted">
            {timeAgo(row.created_at)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
