/**
 * RecommendationPairing — the SOURCE → Share2 → TARGET layout for a
 * `recommended` activity, matching the profile Recs tab's PairingCard. Two
 * small posters with the intertain glyph between, and a
 * "If you liked {source}, try {target}" caption where BOTH titles (and both
 * posters) tap through to their media page. Shared by the You + Friends feeds.
 *
 * Source comes from the activity metadata (cover/title/type), the target from
 * the row's media embed — the caller assembles both into `PairMedia`.
 */
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
      className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay active:opacity-70"
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
}: {
  source: PairMedia;
  target: PairMedia;
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
      {/* Source → intertain glyph → target, posters tap to media. */}
      <View className="flex-row items-center gap-2">
        <Poster media={source} onPress={openSource} />
        <Share2 size={16} color={colors["text-muted"]} accessibilityLabel="recommends" />
        <Poster media={target} onPress={openTarget} />
      </View>

      {/* Caption — both titles tap to their media. */}
      <Text className="text-sm text-text-secondary" numberOfLines={2}>
        If you liked{" "}
        <Text className="font-medium text-text-primary" onPress={openSource}>
          {source.title}
        </Text>
        , try{" "}
        <Text className="font-medium text-text-primary" onPress={openTarget}>
          {target.title}
        </Text>
      </Text>
    </View>
  );
}
