import { ActivityIndicator, FlatList, Image, Text, View } from 'react-native';

import { useTrendingMedia, type TrendingMediaItem } from '@/queries/media';

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
      renderItem={({ item }) => (
        <View className="flex-row items-center gap-3 px-4 py-2">
          {item.cover_image_url ? (
            <Image source={{ uri: item.cover_image_url }} className="h-20 w-14 rounded" />
          ) : null}
          <View className="flex-1">
            <Text className="text-base font-semibold text-text-primary">{item.title}</Text>
            <Text className="text-sm text-text-muted">
              {item.media_type} · {item.avg_rating ?? '—'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}
