/**
 * ListRail — a titled, horizontal rail of curated-list cards for the home
 * screen's "Popular Lists" section, the RN analogue of web's homepage Popular
 * Lists rail (apps/web/src/app/page.tsx). Sits alongside the `MediaRail`s but
 * deals in `PopularListCard`s (a list + author + cover previews) rather than
 * single titles, so each cell is a cover collage + title + meta, tapping
 * through to the shared `/list/<id>` detail route.
 *
 * Self-hides on an empty `lists` (mirrors MediaRail) — no public lists → the
 * section vanishes. Was deferred until the list-detail route existed (cards
 * would have dead-ended); now that `list/[id]` is live, the home screen mounts
 * it.
 */
import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart, ListMusic } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import type { PopularListCard } from "@/queries/home";

/** Fixed rail-card width (pt) — a couple of cards + a peek fit across a phone. */
const CARD_WIDTH = 150;
const CARD_GAP = 12;
const RAIL_PADDING = 16;

/** Cover collage metrics — capped to 4 thumbnails so the strip fits the card. */
const COVER_WIDTH = 46;
const COVER_HEIGHT = 68;
const COVER_OFFSET = 30;
const MAX_COVERS = 4;

export function ListRail({
  title,
  lists,
}: {
  title: string;
  lists: PopularListCard[];
}) {
  // Self-hide: an empty section renders nothing.
  if (lists.length === 0) return null;

  return (
    <View className="pb-4">
      <Text className="px-4 pb-2 text-base font-semibold text-text-primary">
        {title}
      </Text>
      <FlatList
        horizontal
        data={lists}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(card) => card.list.id}
        contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: RAIL_PADDING }}
        renderItem={({ item }) => <ListRailCard card={item} />}
      />
    </View>
  );
}

/** One rail cell: overlapping cover collage + title + (items · likes) meta. */
function ListRailCard({ card }: { card: PopularListCard }) {
  const router = useRouter();
  const { list, covers } = card;
  const shown = covers.slice(0, MAX_COVERS);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open list ${list.title}`}
      style={{ width: CARD_WIDTH }}
      className="gap-2 active:opacity-70"
      onPress={() => router.push(`/list/${list.id}`)}
    >
      {shown.length > 0 ? (
        <View
          className="flex-row"
          style={{
            height: COVER_HEIGHT,
            width: COVER_OFFSET * (shown.length - 1) + COVER_WIDTH,
          }}
        >
          {shown.map((src, i) => (
            <Image
              key={`${list.id}-${i}`}
              source={{ uri: src }}
              contentFit="cover"
              className="absolute rounded-md border border-surface-border bg-surface-overlay"
              style={{
                width: COVER_WIDTH,
                height: COVER_HEIGHT,
                left: i * COVER_OFFSET,
                zIndex: i,
              }}
            />
          ))}
        </View>
      ) : (
        <View
          className="items-center justify-center rounded-md border border-surface-border bg-surface-overlay"
          style={{ width: COVER_WIDTH, height: COVER_HEIGHT }}
        >
          <ListMusic size={18} color={colors["text-muted"]} />
        </View>
      )}

      <Text
        className="text-sm font-semibold text-text-primary"
        numberOfLines={2}
      >
        {list.title}
      </Text>

      <View className="flex-row items-center gap-2">
        <Text className="text-xs text-text-muted">
          {list.item_count} {list.item_count === 1 ? "item" : "items"}
        </Text>
        <Text className="text-xs text-text-muted" accessibilityElementsHidden>
          ·
        </Text>
        <View className="flex-row items-center gap-1">
          <Heart size={11} color={colors["text-muted"]} />
          <Text className="text-xs text-text-muted">{list.like_count ?? 0}</Text>
        </View>
      </View>
    </Pressable>
  );
}
