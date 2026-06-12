import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Text, View } from 'react-native';

import type { MediaItem } from '@intertaind/types';

import { supabase } from '@/lib/supabase';

type TrendingItem = Pick<
  MediaItem,
  'id' | 'title' | 'cover_image_url' | 'media_type' | 'avg_rating'
>;

export default function TrendingScreen() {
  const [items, setItems] = useState<TrendingItem[] | null>(null);

  useEffect(() => {
    supabase
      .from('media_items')
      .select('id, title, cover_image_url, media_type, avg_rating')
      .order('tracking_count', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setItems((data as TrendingItem[]) ?? []);
      });
  }, []);

  if (!items) return <ActivityIndicator className="flex-1" />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      className="flex-1 bg-neutral-950"
      renderItem={({ item }) => (
        <View className="flex-row items-center gap-3 px-4 py-2">
          {item.cover_image_url && (
            <Image source={{ uri: item.cover_image_url }} className="h-20 w-14 rounded" />
          )}
          <View className="flex-1">
            <Text className="text-base font-semibold text-white">{item.title}</Text>
            <Text className="text-sm text-neutral-400">
              {item.media_type} · {item.avg_rating ?? '—'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}
