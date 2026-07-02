import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@intertaind/design-system';
import { MEDIA_TYPE_CONFIG, type MediaType } from '@intertaind/types';

import { MEDIA_TYPE_ICONS } from '@/lib/media-type-icons';
import { useTrendingMedia, type TrendingMediaItem } from '@/queries/media';

/**
 * Per-media-type accent hex for the lucide type icon on each row. Icons
 * color via the `color` PROP (react-native-svg), not a className, so we
 * need the raw token. Keyed by domain `MediaType`; the DB enum is a
 * superset, so unknown values render no icon (see renderItem).
 */
const MEDIA_TYPE_ICON_COLOR: Record<MediaType, string> = {
  book: colors['accent-book'],
  movie: colors['accent-movie'],
  tv_show: colors['accent-tv'],
  video_game: colors['accent-game'],
};

/**
 * Trending — the home screen.
 *
 * Canonical example of the data-fetching pattern: hook from
 * `src/queries/`, no inline `useEffect`, no manual loading state.
 * TanStack handles the caching, retry, refetch-on-reconnect, etc.
 * The component just renders the three states (pending / error /
 * data) declaratively.
 */
export default function TrendingScreen() {
  const { data, isPending, error } = useTrendingMedia();
  const router = useRouter();

  if (isPending) return <ActivityIndicator className="flex-1" />;
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-default px-6">
        <Text className="text-text-primary">Couldn&apos;t load trending.</Text>
        <Text className="mt-1 text-xs text-text-muted">{error.message}</Text>
      </View>
    );
  }

  return (
    <FlatList<TrendingMediaItem>
      data={data}
      keyExtractor={(item) => item.id}
      className="flex-1 bg-surface-default"
      renderItem={({ item }) => {
        // media_type is the DB enum (superset of MediaType); render the
        // accent-colored lucide icon only for known types. Icons color
        // via the `color` prop (SVG), not className.
        const known = item.media_type in MEDIA_TYPE_CONFIG;
        const TypeIcon = known
          ? MEDIA_TYPE_ICONS[item.media_type as MediaType]
          : null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => router.push(`/media/${item.id}`)}
            className="flex-row items-center gap-3 px-4 py-2 active:opacity-60"
          >
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} className="h-20 w-14 rounded" />
            ) : null}
            <View className="flex-1">
              <Text className="text-base font-semibold text-text-primary">{item.title}</Text>
              <View className="flex-row items-center gap-1.5">
                {TypeIcon ? (
                  <TypeIcon
                    size={14}
                    color={MEDIA_TYPE_ICON_COLOR[item.media_type as MediaType]}
                  />
                ) : null}
                <Text className="text-sm text-text-muted">
                  {item.media_type} · {item.avg_rating ?? '—'}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
