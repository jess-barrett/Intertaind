/**
 * ListDetailView — the whole list-detail screen body (the `list/[id]` route just
 * resolves the id and mounts this). The RN mirror of web's
 * `apps/web/src/app/lists/[id]/page.tsx`: a headerless back bar over a scroll of
 *
 *   title · curator · media-type icons + type badge → like/save →
 *   description → source block (if_you_liked / vibe) → tags → items grid.
 *
 * The items grid reuses the shared `MediaCard` (via `cardMediaFromHomeItem`) with
 * the viewer's per-card rating/heart overlaid from `useViewerTrackingMap` — the
 * same batched-tracking pattern the home rails + profile shelves use — so cards
 * show the viewer's own state and can quick-log straight from the list. Ranked
 * lists show a position badge; per-item `reason` renders beneath its card.
 *
 * v1 scope (deferred, noted): no filter/sort/pagination controls on the items
 * (web's `ListItemsGrid` has them — position order is fine for v1), no comments
 * thread, no backdrop hero, and no edit affordance (mobile has no list
 * authoring yet). Reads-only + like/save, matching what the mobile Lists tab
 * exposes today.
 *
 * Routing / safe-area (apps/mobile/AGENTS.md): a pushed shared route inside the
 * tab stacks — the persistent navbar stays visible, native/gesture back returns
 * within the tab. The per-tab Stack hides headers, so this reserves the TOP
 * safe-area itself + renders the translucent back pill (same affordance media
 * detail / ProfileView / the follow lists use); the scroll pads its bottom by
 * `useBottomInset()` so the last row clears the navbar.
 */
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, Heart, User } from "lucide-react-native";
import {
  LIST_TYPE_LABELS,
  LIST_VISIBILITY_OPTIONS,
  type MediaType,
} from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { Image } from "@/components/image";
import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromHomeItem } from "@/components/media/card-media";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { useAuth } from "@/components/auth-provider";
import { useViewerTrackingMap } from "@/queries/home";
import { queryKeys } from "@/queries/keys";
import {
  useListDetail,
  useToggleListLikeMutation,
  useToggleListSaveMutation,
  type ListDetailData,
} from "@/queries/lists";

/** Height (pt) of the top-bar content row (back pill + title), sans safe area. */
const TOP_BAR_HEIGHT = 44;
/** Screen horizontal padding + item grid metrics. */
const CONTENT_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;

export function ListDetailView({ listId }: { listId: string }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const detail = useListDetail(listId);
  const data = detail.data;

  return (
    <View className="flex-1 bg-surface-default" style={{ paddingTop: insets.top }}>
      <TopBar title={data?.list.title ?? ""} />

      {detail.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : detail.error ? (
        <Centered message="Couldn't load this list. Check your connection and try again." />
      ) : !data ? (
        <Centered message="This list isn't available." />
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: CONTENT_PADDING,
            paddingBottom: bottomInset,
          }}
        >
          <Body data={data} />
        </ScrollView>
      )}
    </View>
  );
}

/** The resolved content — header, like/save, description, source, tags, items. */
function Body({ data }: { data: ListDetailData }) {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { list, author, sourceMedia, items } = data;

  const authorName = author.display_name || author.username;
  const showSourceBlock =
    list.list_type === "if_you_liked" || list.list_type === "vibe";

  // Viewer tracking overlay for the item posters — one batched read, same as
  // the home rails. Ids memoized so the trackingMap key stays stable.
  const itemIds = useMemo(
    () => items.map((i) => i.media?.id).filter((id): id is string => !!id),
    [items],
  );
  const viewerQuery = useViewerTrackingMap(itemIds);
  const trackingMap = viewerQuery.data;

  const refreshTracking = () => {
    if (user) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user.trackingMap(user.id, itemIds),
      });
    }
  };

  return (
    <View className="gap-4">
      {/* Title + curator + type. */}
      <View className="gap-2">
        <Text className="text-2xl font-bold text-text-primary">{list.title}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${authorName}'s profile`}
          className="flex-row items-center gap-2 active:opacity-70"
          onPress={() => router.push(`/u/${author.username}`)}
        >
          {author.avatar_url ? (
            <Image
              source={{ uri: author.avatar_url }}
              contentFit="cover"
              className="h-7 w-7 rounded-full border border-surface-border bg-surface-overlay"
              accessible={false}
            />
          ) : (
            <View className="h-7 w-7 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
              <User size={14} color={colors["text-muted"]} />
            </View>
          )}
          <Text className="text-sm text-text-secondary">
            List created by{" "}
            <Text className="font-medium text-text-primary">{authorName}</Text>
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <MediaTypeIcons types={(list.media_types ?? []) as MediaType[]} />
          <View className="rounded-sm bg-brand/10 px-2 py-0.5">
            <Text className="text-xs font-medium text-brand">
              {LIST_TYPE_LABELS[list.list_type]}
            </Text>
          </View>
          <VisibilityChip visibility={list.visibility} />
        </View>
      </View>

      {/* Like / Save. */}
      <View className="flex-row gap-2">
        <LikeSaveButton kind="like" data={data} isLoggedIn={!!user} />
        <LikeSaveButton kind="save" data={data} isLoggedIn={!!user} />
      </View>

      {/* Description. */}
      {list.description ? (
        <Text className="text-sm leading-relaxed text-text-secondary">
          {list.description}
        </Text>
      ) : null}

      {/* Source block — if_you_liked / vibe lists. */}
      {showSourceBlock && sourceMedia ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${sourceMedia.title}`}
          className="flex-row items-center gap-3 rounded-sm border border-brand/40 bg-brand/5 p-3 active:opacity-70"
          onPress={() => router.push(`/media/${sourceMedia.id}`)}
        >
          <View className="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
            {sourceMedia.cover_image_url ? (
              <Image
                source={{ uri: sourceMedia.cover_image_url }}
                contentFit="cover"
                className="h-full w-full"
                accessible={false}
              />
            ) : null}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-xs uppercase tracking-wider text-brand">
              {list.list_type === "if_you_liked"
                ? "If you liked"
                : "Captures the vibe of"}
            </Text>
            <Text
              className="mt-0.5 text-base font-semibold text-text-primary"
              numberOfLines={2}
            >
              {sourceMedia.title}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* Tags. */}
      {list.tags && list.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {list.tags.map((tag) => (
            <View
              key={tag}
              className="rounded-sm border border-surface-border bg-surface-overlay px-2 py-0.5"
            >
              <Text className="text-xs text-text-secondary">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Items. */}
      {items.length > 0 ? (
        <ItemsGrid
          items={items}
          ranked={!!list.ranked}
          trackingMap={trackingMap}
          onMutated={refreshTracking}
        />
      ) : (
        <Text className="py-12 text-center text-sm text-text-muted">
          This list is empty.
        </Text>
      )}
    </View>
  );
}

/** The position-ordered poster grid (rank badge + reason where present). */
function ItemsGrid({
  items,
  ranked,
  trackingMap,
  onMutated,
}: {
  items: ListDetailData["items"];
  ranked: boolean;
  trackingMap: ReturnType<typeof useViewerTrackingMap>["data"];
  onMutated: () => void;
}) {
  const { width } = useWindowDimensions();
  const cellWidth =
    (width - CONTENT_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  return (
    <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
      {items.map((item) => {
        if (!item.media) return null;
        const viewer = trackingMap?.get(item.media.id);
        return (
          <View key={item.id} style={{ width: cellWidth }} className="gap-1">
            <MediaCard
              media={cardMediaFromHomeItem(item.media)}
              tracking={
                viewer
                  ? {
                      status: viewer.status,
                      rating: viewer.rating,
                      is_favorite: viewer.is_favorite,
                    }
                  : null
              }
              avgRating={item.media.avg_rating}
              showYear={false}
              compact
              onMutated={onMutated}
            />
            {ranked ? (
              <Text className="text-center text-base font-bold text-brand">
                {item.position + 1}
              </Text>
            ) : null}
            {item.reason ? (
              <Text
                className="text-xs leading-snug text-text-muted"
                numberOfLines={3}
              >
                {item.reason}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A like or save toggle button (icon + label + count). Signed-out → read-only
 *  icon + count (no advertised action), matching web's sidebar. */
function LikeSaveButton({
  kind,
  data,
  isLoggedIn,
}: {
  kind: "like" | "save";
  data: ListDetailData;
  isLoggedIn: boolean;
}) {
  const likeMutation = useToggleListLikeMutation();
  const saveMutation = useToggleListSaveMutation();
  const isLike = kind === "like";
  const mutation = isLike ? likeMutation : saveMutation;
  const active = isLike ? data.viewerLiked : data.viewerSaved;
  const count = (isLike ? data.list.like_count : data.list.saves_count) ?? 0;
  const Icon = isLike ? Heart : Bookmark;
  const label = isLike
    ? active
      ? "Liked"
      : "Like"
    : active
      ? "Saved"
      : "Save";
  const iconColor = active ? colors.brand : colors["text-secondary"];

  const onPress = () => {
    if (!isLoggedIn || mutation.isPending) return;
    mutation.mutate({ listId: data.list.id, title: data.list.title });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} this list`}
      accessibilityState={{ selected: active, disabled: !isLoggedIn }}
      disabled={!isLoggedIn || mutation.isPending}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-sm border px-3 py-2 active:opacity-70 ${
        active
          ? "border-brand bg-brand/10"
          : "border-surface-border bg-surface-overlay"
      } ${mutation.isPending ? "opacity-60" : ""}`}
      onPress={onPress}
    >
      <Icon
        size={15}
        color={iconColor}
        fill={active ? iconColor : "transparent"}
      />
      {isLoggedIn ? (
        <Text
          className={`text-sm ${active ? "text-brand" : "text-text-secondary"}`}
        >
          {label}
        </Text>
      ) : null}
      <Text
        className={`text-sm font-medium tabular-nums ${
          active ? "text-brand" : "text-text-muted"
        }`}
      >
        {count}
      </Text>
    </Pressable>
  );
}

/** Small row of the list's media-type glyphs. */
function MediaTypeIcons({ types }: { types: MediaType[] }) {
  if (types.length === 0) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      {types.map((t) => {
        const Icon = MEDIA_TYPE_ICONS[t];
        return Icon ? (
          <Icon key={t} size={15} color={colors["text-muted"]} />
        ) : null;
      })}
    </View>
  );
}

/** A muted chip for a non-public list's visibility (nothing for public). */
function VisibilityChip({ visibility }: { visibility: string }) {
  if (visibility === "public") return null;
  const label =
    LIST_VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.label.split(
      " (",
    )[0] ?? "Private";
  return (
    <View className="rounded-sm border border-surface-border bg-surface-overlay px-2 py-0.5">
      <Text className="text-xs text-text-muted">{label}</Text>
    </View>
  );
}

/**
 * The headerless top bar — centered title with the back pill overlaid left (the
 * same translucent affordance media detail / ProfileView / the follow lists use).
 */
function TopBar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View
      style={{ height: TOP_BAR_HEIGHT }}
      className="justify-center border-b border-surface-border"
    >
      <Text
        className="px-14 text-center text-base font-semibold text-text-primary"
        numberOfLines={1}
      >
        {title}
      </Text>
      <View className="absolute bottom-0 left-3 top-0 justify-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color={colors["text-primary"]} />
        </Pressable>
      </View>
    </View>
  );
}

/** A centered muted line — the pending/error/not-found body beneath the bar. */
function Centered({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-sm text-text-muted">{message}</Text>
    </View>
  );
}
