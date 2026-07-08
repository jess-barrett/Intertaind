/**
 * Search tab — cross-source media search, the RN mirror of web's
 * `/search` (apps/web/src/app/search/search-client.tsx). A search field +
 * media-type filter over the `media-search` Edge Function (via
 * `useMediaSearch`), rendering a 2-column grid of `MediaCard`s.
 *
 * Results are cross-source `SearchResult`s (not catalog rows), so each card
 * is adapted with `cardMediaFromSearchResult` — carrying a `{searchResult}`
 * upsert payload so tapping (or a quick-action) get-or-creates the catalog
 * row via `media-upsert`, then navigates — exactly like web's
 * `SearchResultCard` (upsert-on-click). The grid reuses the same 2-column
 * `flex-1` layout as the filmography grid.
 *
 * ── Debounce ──────────────────────────────────────────────────────────
 * `useMediaSearch` is declarative (`enabled` gates the round trip), so the
 * QUERY STRING is debounced (~300ms, web parity) into `debouncedQuery`
 * before it reaches the hook — the field updates instantly, the search
 * fires only once typing settles, and each cached key is a settled query.
 *
 * ── States ────────────────────────────────────────────────────────────
 * prompt (query < 2 chars) · loading · empty ("No results") · error
 * (mapped via `trackingErrorMessage`, never the raw Supabase error).
 *
 * Headerless tab anchor: reserves the top safe-area itself; the results grid
 * reserves the bottom inset so the last row clears the navbar.
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BookOpen,
  Film,
  Gamepad2,
  Search as SearchIcon,
  Tv,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { SearchResult } from "@intertaind/types";

import { MediaCard } from "@/components/media/media-card";
import { cardMediaFromSearchResult } from "@/components/media/card-media";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useMediaSearch, type MediaSearchType } from "@/queries/search";

/** Debounce delay for the query string — web parity (search-client). */
const DEBOUNCE_MS = 300;
/** Min chars before the hook invokes (matches useMediaSearch's gate). */
const MIN_QUERY_LENGTH = 2;
/** 2-column poster grid — same layout as the filmography grid. */
const NUM_COLUMNS = 2;

/**
 * Type filter tabs. `key` is the request alias the `media-search` function
 * accepts (`useMediaSearch`'s `MediaSearchType`: tv_show→"tv",
 * video_game→"game"); the accent tints the active tab's icon.
 */
type FilterTab = {
  key: MediaSearchType;
  label: string;
  icon: LucideIcon;
  color: string;
};
const TABS: FilterTab[] = [
  { key: "all", label: "All", icon: SearchIcon, color: colors["text-primary"] },
  { key: "movie", label: "Movies", icon: Film, color: colors["accent-movie"] },
  { key: "tv", label: "TV", icon: Tv, color: colors["accent-tv"] },
  { key: "book", label: "Books", icon: BookOpen, color: colors["accent-book"] },
  { key: "game", label: "Games", icon: Gamepad2, color: colors["accent-game"] },
];

/**
 * A stable key per result. `external_ids` is the natural identity; pairing it
 * with `media_type` keeps two sources that reuse an id space distinct.
 */
function resultKey(r: SearchResult): string {
  return `${r.media_type}-${JSON.stringify(r.external_ids)}`;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState<MediaSearchType>("all");

  // Debounce the field into the search key — the field responds instantly,
  // the round trip fires only once typing settles.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useMediaSearch(debouncedQuery, type);
  const results = search.data ?? [];
  const tooShort = debouncedQuery.trim().length < MIN_QUERY_LENGTH;

  return (
    <View
      className="flex-1 bg-surface-default"
      style={{ paddingTop: insets.top }}
    >
      {/* Fixed header: title + field + type tabs (stays put above results). */}
      <View className="gap-3 px-4 pb-3 pt-3">
        <Text className="text-2xl font-bold text-text-primary">Search</Text>

        <View className="flex-row items-center gap-2 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
          <SearchIcon size={16} color={colors["text-muted"]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search movies, shows, games, books…"
            placeholderTextColor={colors["text-muted"]}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search for a title"
            className="flex-1 text-sm text-text-primary"
            style={{ color: colors["text-primary"] }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {TABS.map((tab) => {
            const active = type === tab.key;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter: ${tab.label}`}
                onPress={() => setType(tab.key)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-70 ${
                  active
                    ? "border-surface-border bg-surface-overlay"
                    : "border-transparent"
                }`}
              >
                <Icon
                  size={14}
                  color={active ? tab.color : colors["text-muted"]}
                />
                <Text
                  className={`text-sm font-medium ${
                    active ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Book hint — web parity: books often need the author to match. */}
        {type === "book" ? (
          <Text className="text-xs text-text-muted">
            Can&apos;t find your book? Try adding{" "}
            <Text className="text-text-secondary">by [author name]</Text> to
            your search.
          </Text>
        ) : null}
      </View>

      {/* Results / states. */}
      {tooShort ? (
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <SearchIcon size={32} color={colors["text-muted"]} />
          <Text className="text-center text-base text-text-secondary">
            Search across movies, TV, books, and games
          </Text>
          <Text className="text-center text-sm text-text-muted">
            Find something to add to your collection.
          </Text>
        </View>
      ) : search.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : search.error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-accent-movie">
            {trackingErrorMessage(search.error, "the search", "search-screen")}
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-1 px-6">
          <Text className="text-center text-base text-text-secondary">
            No results found
          </Text>
          <Text className="text-center text-sm text-text-muted">
            {type === "book"
              ? 'Try adding "by [author name]" to your search.'
              : "Try a different search term or media type."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={resultKey}
          numColumns={NUM_COLUMNS}
          keyboardShouldPersistTaps="handled"
          // 12pt gutter between the two columns; the grid owns its horizontal
          // padding (same split as the filmography grid).
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          // 16pt vertical gap between rows.
          ItemSeparatorComponent={() => <View className="h-4" />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomInset }}
          renderItem={({ item }) => (
            // flex-1 wrapper so the two columns split the row evenly.
            <View className="flex-1">
              <MediaCard media={cardMediaFromSearchResult(item)} />
            </View>
          )}
        />
      )}
    </View>
  );
}
