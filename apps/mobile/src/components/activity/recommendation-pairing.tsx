/**
 * RecommendationPairing — the shared visual for a `recommended` ("intertain")
 * pairing, used by the You feed (`ActivityRow`), the Friends feed
 * (`FeedActivityRow`), and the profile Recs tab (`RecommendationsTab`). One
 * layout everywhere:
 *
 *   [source]→[target]   If you liked {source}, try   (small, muted)
 *    posters             {target title}              (larger, primary)
 *                        {time}                      (xs, muted — optional)
 *   "{note}"                                          (below, full width — optional)
 *
 * The "If you liked…" caption sits to the RIGHT of the two posters (smaller,
 * above the slightly larger recommendation title — the profile-card grammar the
 * app standardized on), with the author's reasoning note beneath the whole row.
 * BOTH titles and BOTH posters tap through to their media page.
 *
 * Source comes from the activity metadata (cover/title/type) or the rec row;
 * the target from the row's media embed — the caller assembles both into
 * `PairMedia`. `trailing` is an optional top-right slot (the Recs tab passes its
 * owner-only delete button there).
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { MediaType } from "@intertaind/types";

import { Image } from "@/components/image";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";

export type PairMedia = {
  id: string | null;
  title: string;
  cover: string | null;
  mediaType: MediaType | null;
};

function Poster({ media, onPress }: { media: PairMedia; onPress?: () => void }) {
  const Glyph = media.mediaType ? MEDIA_TYPE_ICONS[media.mediaType] : null;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open ${media.title}` : undefined}
      disabled={!onPress}
      className="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay active:opacity-70"
      onPress={onPress}
    >
      {media.cover ? (
        <Image
          source={{ uri: media.cover }}
          className="h-full w-full"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          {Glyph ? <Glyph size={16} color={colors["text-muted"]} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export function RecommendationPairing({
  source,
  target,
  note,
  timeLabel,
  trailing,
}: {
  source: PairMedia;
  target: PairMedia;
  /** The author's reasoning, rendered beneath the row. */
  note?: string | null;
  /** Relative time, shown under the title (omit where the caller shows it
   *  elsewhere, e.g. the Friends feed's actor header). */
  timeLabel?: string | null;
  /** Top-right slot — the Recs tab passes its owner-only delete button. */
  trailing?: ReactNode;
}) {
  const router = useRouter();
  const openSource = source.id
    ? () => router.push(`/media/${source.id}`)
    : undefined;
  const openTarget = target.id
    ? () => router.push(`/media/${target.id}`)
    : undefined;

  return (
    <View className="gap-2">
      <View className="flex-row items-start gap-3">
        {/* Source → intertain glyph → target, posters tap to media. */}
        <View className="shrink-0 flex-row items-center gap-2">
          <Poster media={source} onPress={openSource} />
          <Share2
            size={16}
            color={colors["text-muted"]}
            accessibilityLabel="recommends"
          />
          <Poster media={target} onPress={openTarget} />
        </View>

        {/* Right column: small "If you liked…" caption above the larger title. */}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-xs text-text-muted" numberOfLines={2}>
            If you liked{" "}
            <Text className="font-medium text-text-secondary" onPress={openSource}>
              {source.title}
            </Text>
            , try
          </Text>
          <Text
            className="text-base font-semibold text-text-primary"
            numberOfLines={2}
            onPress={openTarget}
          >
            {target.title}
          </Text>
          {timeLabel ? (
            <Text className="text-xs text-text-muted">{timeLabel}</Text>
          ) : null}
        </View>

        {trailing ? <View className="shrink-0">{trailing}</View> : null}
      </View>

      {/* Optional note — the author's "why", full width beneath the row. */}
      {note ? (
        <Text
          className="text-sm leading-relaxed text-text-secondary"
          numberOfLines={5}
        >
          “{note}”
        </Text>
      ) : null}
    </View>
  );
}
