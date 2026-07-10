/**
 * ListDetailView — the whole list-detail screen body (the `list/[id]` route just
 * resolves the id and mounts this). The RN mirror of web's
 * `apps/web/src/app/lists/[id]/page.tsx`:
 *
 *   [backdrop hero: title · curator] → media icons + type badge + visibility →
 *   like/save → description → source block (if_you_liked / vibe) → tags →
 *   filter/sort controls → items grid.
 *
 * ── Backdrop hero ───────────────────────────────────────────────────────────
 * If any item has a `backdrop_url`, the first such image renders as a full-bleed
 * hero at the top (web parity: `items.find(i => i.backdrop_url)`), fading into
 * `surface-default` via an svg gradient with the title + curator overlaid — the
 * same hero grammar as the media-detail screen. A translucent back pill floats
 * over it. With no backdrop we fall back to a plain top bar + an in-body title.
 *
 * ── Items: filter + sort ────────────────────────────────────────────────────
 * The items grid carries the same decade/genre filters + sort menu as web's
 * `ListItemsGrid` (pure logic in `list-item-sort.ts`). Ranked lists default to
 * (and lock) "List order" and show a position badge; the sort control is hidden
 * there (position IS the order). Cards reuse `MediaCard` with the viewer's
 * rating/heart overlaid (batched `useViewerTrackingMap`) and quick-log inline.
 *
 * v1 defers (noted): item pagination (web caps at 100/page — we render all),
 * comments, and list edit/create (no mobile list authoring yet).
 *
 * Routing / safe-area (apps/mobile/AGENTS.md): a pushed shared route inside the
 * tab stacks — the persistent navbar stays visible, native/gesture back returns
 * within the tab. The scroll pads its bottom by `useBottomInset()`.
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Heart,
  User,
} from "lucide-react-native";
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
import { useViewerTrackingMap, type ViewerTrackingState } from "@/queries/home";
import { queryKeys } from "@/queries/keys";
import {
  useListDetail,
  useToggleListLikeMutation,
  useToggleListSaveMutation,
  type ListDetailData,
  type ListDetailItem,
} from "@/queries/lists";
import {
  SORT_OPTIONS,
  decadeOptionsFor,
  filterItems,
  genreOptionsFor,
  sortItems,
} from "@/components/lists/list-item-sort";

/** Height (pt) of the top-bar content row (back pill + title), sans safe area. */
const TOP_BAR_HEIGHT = 44;
/** Backdrop hero height in pt — the image + its bottom-fading gradient. */
const HERO_HEIGHT = 260;
/** Screen horizontal padding + item grid metrics. */
const CONTENT_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
/** A dropdown panel is its chip's width + 1/3 (extends past the opposite edge). */
const PANEL_WIDTH_FACTOR = 4 / 3;

type ControlKey = "decade" | "genre" | "sort";
type ChipGeom = { x: number; y: number; width: number; height: number };

export function ListDetailView({ listId }: { listId: string }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const detail = useListDetail(listId);
  const data = detail.data;

  // Pending / error / not-found → the plain top-bar shell (no data → no hero).
  if (detail.isPending || detail.error || !data) {
    return (
      <View
        className="flex-1 bg-surface-default"
        style={{ paddingTop: insets.top }}
      >
        <TopBar title={data?.list.title ?? ""} />
        {detail.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors["text-muted"]} />
          </View>
        ) : detail.error ? (
          <Centered message="Couldn't load this list. Check your connection and try again." />
        ) : (
          <Centered message="This list isn't available." />
        )}
      </View>
    );
  }

  // First item with a backdrop wins the hero (web parity). Book-only lists
  // typically have none → we fall back to the plain top-bar layout.
  const backdropUrl =
    data.items.find((i) => i.media?.backdrop_url)?.media?.backdrop_url ?? null;

  if (backdropUrl) {
    return (
      <View className="flex-1 bg-surface-default">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset }}
        >
          <HeroHeader
            backdropUrl={backdropUrl}
            list={data.list}
            author={data.author}
          />
          <View style={{ padding: CONTENT_PADDING }}>
            <Body data={data} showTitleBlock={false} />
          </View>
        </ScrollView>
        <FloatingBackButton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-default" style={{ paddingTop: insets.top }}>
      <TopBar title={data.list.title} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: CONTENT_PADDING,
          paddingBottom: bottomInset,
        }}
      >
        <Body data={data} showTitleBlock />
      </ScrollView>
    </View>
  );
}

/** The resolved content — header, like/save, description, source, tags, items. */
function Body({
  data,
  showTitleBlock,
}: {
  data: ListDetailData;
  /** Render the title + curator in-body (true when there's no hero to carry it). */
  showTitleBlock: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { list, author, sourceMedia, items } = data;

  const showSourceBlock =
    list.list_type === "if_you_liked" || list.list_type === "vibe";

  // Viewer tracking overlay for the item posters — one batched read.
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
      {showTitleBlock ? <TitleCurator list={list} author={author} /> : null}

      {/* Media-type icons + list type + visibility. */}
      <View className="flex-row items-center gap-2">
        <MediaTypeIcons types={(list.media_types ?? []) as MediaType[]} />
        <View className="rounded-sm bg-brand/10 px-2 py-0.5">
          <Text className="text-xs font-medium text-brand">
            {LIST_TYPE_LABELS[list.list_type]}
          </Text>
        </View>
        <VisibilityChip visibility={list.visibility} />
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

      {/* Tags — a "Tags" label to the left of the chip row. */}
      {list.tags && list.tags.length > 0 ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Tags
          </Text>
          <View className="min-w-0 flex-1 flex-row flex-wrap gap-1.5">
            {list.tags.map((tag) => (
              <View
                key={tag}
                className="rounded-sm border border-surface-border bg-surface-overlay px-2 py-0.5"
              >
                <Text className="text-xs text-text-secondary">{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Items — filter/sort controls + grid. */}
      {items.length > 0 ? (
        <ItemsSection
          items={items}
          ranked={!!list.ranked}
          trackingMap={trackingMap}
          onMutated={refreshTracking}
          isLoggedIn={!!user}
        />
      ) : (
        <Text className="py-12 text-center text-sm text-text-muted">
          This list is empty.
        </Text>
      )}
    </View>
  );
}

/** Filter/sort controls + the resulting poster grid (mirrors web ListItemsGrid). */
function ItemsSection({
  items,
  ranked,
  trackingMap,
  onMutated,
  isLoggedIn,
}: {
  items: ListDetailItem[];
  ranked: boolean;
  trackingMap: Map<string, ViewerTrackingState> | undefined;
  onMutated: () => void;
  isLoggedIn: boolean;
}) {
  // Ranked lists lock to "List order" (position IS the order) — no sort control.
  const [decade, setDecade] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState(ranked ? "position_asc" : "added_desc");
  const [shuffleSeed, setShuffleSeed] = useState(() =>
    Math.floor(Math.random() * 1e9),
  );
  const [open, setOpen] = useState<null | "decade" | "genre" | "sort">(null);

  const decadeOptions = useMemo(() => decadeOptionsFor(items), [items]);
  const genreOptions = useMemo(() => genreOptionsFor(items), [items]);
  const filtered = useMemo(
    () => filterItems(items, decade, genre),
    [items, decade, genre],
  );
  const sorted = useMemo(
    () => sortItems(filtered, sort, trackingMap, shuffleSeed),
    [filtered, sort, trackingMap, shuffleSeed],
  );

  // Per-chip layout (x/y/width/height within the controls row) so the open
  // dropdown can float over the content at a fixed width tied to its chip.
  const [geom, setGeom] = useState<Partial<Record<ControlKey, ChipGeom>>>({});
  const measure = (key: ControlKey) => (e: LayoutChangeEvent) =>
    setGeom((g) => ({ ...g, [key]: e.nativeEvent.layout }));

  const sortMenu = SORT_OPTIONS.filter((o) => !o.requiresUser || isLoggedIn);
  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort by";

  function toggle(control: ControlKey) {
    setOpen((cur) => (cur === control ? null : control));
  }
  function pickSort(key: string) {
    // Re-roll the shuffle seed each time Shuffle is picked (so it reshuffles).
    if (key === "shuffle") setShuffleSeed(Math.floor(Math.random() * 1e9));
    setSort(key);
    setOpen(null);
  }

  // The open dropdown's options + selection + geometry-derived float position.
  const openMenu =
    open === "decade"
      ? {
          selected: decade,
          options: [
            { value: "", label: "Any decade" },
            ...decadeOptions.map((d) => ({ value: d, label: d })),
          ],
          onSelect: (v: string) => {
            setDecade(v);
            setOpen(null);
          },
          align: "left" as const,
        }
      : open === "genre"
        ? {
            selected: genre,
            options: [
              { value: "", label: "Any genre" },
              ...genreOptions.map((g) => ({ value: g, label: g })),
            ],
            onSelect: (v: string) => {
              setGenre(v);
              setOpen(null);
            },
            align: "left" as const,
          }
        : open === "sort"
          ? {
              selected: sort,
              options: sortMenu.map((o) => ({ value: o.key, label: o.label })),
              onSelect: pickSort,
              align: "right" as const,
            }
          : null;

  const openGeom = open ? geom[open] : undefined;
  // Panel width = the chip's width + 1/3 (extends past the chip on the opposite
  // edge). Left controls align left-edge→left-edge; the sort control aligns
  // right-edge→right-edge (so it extends leftward instead of off-screen).
  const panelStyle =
    openMenu && openGeom
      ? {
          position: "absolute" as const,
          top: openGeom.y + openGeom.height + 4,
          width: openGeom.width * PANEL_WIDTH_FACTOR,
          left:
            openMenu.align === "right"
              ? openGeom.x + openGeom.width - openGeom.width * PANEL_WIDTH_FACTOR
              : openGeom.x,
          zIndex: 20,
          // Float above the grid: elevation (Android) + a soft shadow (iOS).
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }
      : null;

  return (
    <View className="gap-3">
      {/* Control chips + the floating dropdown panel (raised above the grid). */}
      <View style={{ zIndex: 10 }}>
        <View className="flex-row flex-wrap items-center gap-2">
          {decadeOptions.length > 0 ? (
            <ControlChip
              label={decade || "Any decade"}
              open={open === "decade"}
              onPress={() => toggle("decade")}
              onLayout={measure("decade")}
            />
          ) : null}
          {genreOptions.length > 0 ? (
            <ControlChip
              label={genre || "Any genre"}
              open={open === "genre"}
              onPress={() => toggle("genre")}
              onLayout={measure("genre")}
            />
          ) : null}
          {!ranked ? (
            <ControlChip
              label={sortLabel}
              open={open === "sort"}
              onPress={() => toggle("sort")}
              onLayout={measure("sort")}
              alignRight
            />
          ) : null}
        </View>

        {panelStyle && openMenu ? (
          <View style={panelStyle}>
            <OptionsPanel
              selected={openMenu.selected}
              options={openMenu.options}
              onSelect={openMenu.onSelect}
            />
          </View>
        ) : null}
      </View>

      {sorted.length === 0 ? (
        <Text className="py-8 text-center text-sm text-text-muted">
          No items match these filters.
        </Text>
      ) : (
        <ItemsGrid
          items={sorted}
          ranked={ranked}
          trackingMap={trackingMap}
          onMutated={onMutated}
        />
      )}
    </View>
  );
}

/** A filter/sort chip: current label + chevron; brand outline when its panel is open. */
function ControlChip({
  label,
  open,
  onPress,
  onLayout,
  alignRight,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  alignRight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      onLayout={onLayout}
      className={`flex-row items-center gap-1 rounded-sm border px-2.5 py-1.5 active:opacity-70 ${
        open ? "border-brand" : "border-surface-border"
      } ${alignRight ? "ml-auto" : ""} bg-surface-overlay`}
      onPress={onPress}
    >
      <Text className="text-xs text-text-secondary" numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={13} color={colors["text-muted"]} />
    </Pressable>
  );
}

/** The inline options list for the open filter/sort control (Check on selected). */
function OptionsPanel({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className="overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
      {options.map((opt, i) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value || "any"}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`flex-row items-center justify-between px-3 py-2.5 active:opacity-70 ${
              i > 0 ? "border-t border-surface-border" : ""
            }`}
            onPress={() => onSelect(opt.value)}
          >
            <Text
              className={`text-sm ${active ? "text-brand" : "text-text-secondary"}`}
            >
              {opt.label}
            </Text>
            {active ? <Check size={15} color={colors.brand} /> : null}
          </Pressable>
        );
      })}
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
  items: ListDetailItem[];
  ranked: boolean;
  trackingMap: Map<string, ViewerTrackingState> | undefined;
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
            {/* Rank badge preserves the item's ORIGINAL position even when
                filters narrow the set (web parity). */}
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

/** Title + "List created by {name}" curator row. `onHero` → white text over the
 *  backdrop; otherwise the in-body primary styling. */
function TitleCurator({
  list,
  author,
  onHero,
}: {
  list: ListDetailData["list"];
  author: ListDetailData["author"];
  onHero?: boolean;
}) {
  const router = useRouter();
  const authorName = author.display_name || author.username;
  const titleClass = onHero ? "text-white" : "text-text-primary";
  const bodyText = onHero ? "text-white/80" : "text-text-secondary";
  const nameText = onHero ? "text-white" : "text-text-primary";

  return (
    <View className="gap-2">
      <Text
        className={`text-3xl font-bold ${titleClass}`}
        style={
          onHero
            ? {
                textShadowColor: "rgba(0,0,0,0.6)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 6,
              }
            : undefined
        }
      >
        {list.title}
      </Text>
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
        <Text className={`text-sm ${bodyText}`}>
          List created by{" "}
          <Text className={`font-medium ${nameText}`}>{authorName}</Text>
        </Text>
      </Pressable>
    </View>
  );
}

/** The full-bleed backdrop + its bottom-fading gradient, title/curator overlaid. */
function HeroHeader({
  backdropUrl,
  list,
  author,
}: {
  backdropUrl: string;
  list: ListDetailData["list"];
  author: ListDetailData["author"];
}) {
  return (
    <View style={{ height: HERO_HEIGHT }} className="w-full">
      <Image
        source={{ uri: backdropUrl }}
        className="h-full w-full"
        contentFit="cover"
        accessible={false}
      />
      {/* Bottom-to-transparent fade to solid page bg (web parity). */}
      <View className="absolute inset-0" pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="listHeroFade" x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0.3"
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
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#listHeroFade)" />
        </Svg>
      </View>
      <View
        className="absolute inset-x-0 bottom-0"
        style={{ paddingHorizontal: CONTENT_PADDING, paddingBottom: 12 }}
      >
        <TitleCurator list={list} author={author} onHero />
      </View>
    </View>
  );
}

/** A translucent circular back pill positioned at the safe-area top-left,
 *  legible over a bright backdrop (used with the hero layout). */
function FloatingBackButton() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 6, left: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={() => router.back()}
      >
        <ArrowLeft size={22} color={colors["text-primary"]} />
      </Pressable>
    </View>
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
 * plain layout, used when there's no backdrop hero + for pending/error states).
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
