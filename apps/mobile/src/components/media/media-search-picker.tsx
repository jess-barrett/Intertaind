/**
 * MediaSearchPicker — the search-and-pick widget for the recommend flow,
 * the RN mirror of web's `InlineMediaPicker`
 * (apps/web/src/components/lists/inline-media-picker.tsx). A search field
 * over the `media-search` Edge Function (via `useMediaSearch`) plus a
 * results list; tapping a row hands the picked `SearchResult` back to the
 * caller through `onPick`. The caller resolves it to a `media_items` id
 * (via `useMediaUpsertMutation`) — this widget stays a pure searcher.
 *
 * ── Debounce ──────────────────────────────────────────────────────────
 * Web debounces the fetch itself; here the hook is declarative (`enabled`
 * gates the round trip), so we debounce the QUERY STRING (~300ms, web
 * parity) into `debouncedQuery` before passing it to `useMediaSearch`. The
 * field updates instantly (local `query`), but the search only fires once
 * typing settles — so each cached key is a settled query, not a keystroke.
 *
 * ── Scroll inside a bottom sheet ──────────────────────────────────────
 * The results use `BottomSheetFlatList` (NOT RN's `FlatList`): a plain
 * scrollable can't scroll inside a `@gorhom/bottom-sheet` — the sheet's
 * pan gesture swallows the drag. The list is height-BOUNDED (`maxHeight`)
 * so it has a scroll region of its own while living inside the sheet's
 * `BottomSheetView` (the parent sheet pins itself to `snapPoints` so the
 * bounded list + surrounding chrome fit predictably).
 *
 * ── States ────────────────────────────────────────────────────────────
 * prompt (query too short) · loading (spinner) · empty ("No results") ·
 * error (mapped via `trackingErrorMessage`, never the raw Supabase error).
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Search } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { SearchResult } from "@intertaind/types";

import { Image } from "@/components/image";
import { MEDIA_TYPE_ICONS, MEDIA_TYPE_ICON_COLOR } from "@/lib/media-type-icons";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useMediaSearch } from "@/queries/search";

/** Debounce delay for the query string — web parity (inline-media-picker). */
const DEBOUNCE_MS = 300;

/** First 4 digits of an ISO date, mirroring web's yearFromDateString. */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

/**
 * A stable key per result. `external_ids` is the natural identity (tmdb_id
 * / google_books_id / isbn_13 / …); pairing it with `media_type` keeps two
 * sources that reuse an id space distinct. Serialized because the object
 * itself isn't a valid key.
 */
function resultKey(r: SearchResult): string {
  return `${r.media_type}-${JSON.stringify(r.external_ids)}`;
}

/**
 * Fixed height per result row (pt). Two reasons it's fixed: (1) it lets the
 * list size to an exact ~3.5-row peek, and (2) it makes the list measure
 * DETERMINISTICALLY under the sheet's dynamic sizing — a `maxHeight`'d
 * BottomSheetFlatList reports its FULL content height to the measure, which
 * over-expands the sheet and leaves blank space below the clipped rows. The
 * w-10 (2:3) poster + the 2-line title + the type/year line fit within it.
 */
const ROW_HEIGHT = 72;
/** Rows shown before the fold; the .5 peeks the next row to signal scroll. */
const PEEK_ROWS = 3.5;

function ResultRow({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: () => void;
}) {
  const year = yearFrom(result.release_date);
  // SearchResult.media_type is the canonical MediaType (book/movie/tv_show/
  // video_game), so it keys the icon map directly — no alias remap needed.
  const Glyph = MEDIA_TYPE_ICONS[result.media_type];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${result.title}${year ? `, ${year}` : ""}`}
      className="flex-row items-center gap-3 px-1 active:opacity-60"
      style={{ height: ROW_HEIGHT }}
      onPress={onPress}
    >
      {/* 2:3 poster — SearchResult.cover_image_url is a full URL (the search
          normalizer already builds absolute image URLs), so use it directly. */}
      {result.cover_image_url ? (
        <Image
          source={{ uri: result.cover_image_url }}
          className="aspect-[2/3] w-10 rounded-sm border border-surface-border bg-surface-overlay"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View className="aspect-[2/3] w-10 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay">
          <Text className="text-text-muted">—</Text>
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-text-primary" numberOfLines={2}>
          {result.title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <Glyph size={12} color={MEDIA_TYPE_ICON_COLOR[result.media_type]} />
          {year ? (
            <Text className="text-xs text-text-muted">{year}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function MediaSearchPicker({
  onPick,
}: {
  onPick: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the field into the search key — the field responds instantly,
  // the round trip fires only once typing settles.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useMediaSearch(debouncedQuery);
  const results = search.data ?? [];
  const tooShort = debouncedQuery.trim().length < 2;

  return (
    <View className="gap-3">
      {/* Search field — BottomSheetTextInput so the sheet keeps it above the
          keyboard while typing. */}
      <View className="flex-row items-center gap-2 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
        <Search size={16} color={colors["text-muted"]} />
        <BottomSheetTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies, shows, games, books…"
          placeholderTextColor={colors["text-muted"]}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search for a title to recommend"
          className="flex-1 text-sm text-text-primary"
          style={{ color: colors["text-primary"] }}
        />
      </View>

      {/* Results / states. The list is height-bounded so it scrolls inside
          the sheet (BottomSheetFlatList; a plain FlatList wouldn't). */}
      {tooShort ? (
        <View className="py-6">
          <Text className="text-center text-sm text-text-muted">
            Type at least 2 characters to search.
          </Text>
        </View>
      ) : search.isPending ? (
        <View className="items-center py-6">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : search.error ? (
        <View className="py-6">
          <Text className="text-center text-sm text-accent-movie">
            {trackingErrorMessage(
              search.error,
              "the search",
              "media-search-picker",
            )}
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View className="py-6">
          <Text className="text-center text-sm text-text-muted">
            No results
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={results}
          keyExtractor={resultKey}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          // Height = exactly the rows to show: all of them when few (no blank
          // space below), else a 3.5-row peek that scrolls. A FIXED height (not
          // maxHeight) so the sheet's dynamic sizing measures it correctly.
          style={{ height: Math.min(results.length, PEEK_ROWS) * ROW_HEIGHT }}
          renderItem={({ item }) => (
            <ResultRow result={item} onPress={() => onPick(item)} />
          )}
        />
      )}
    </View>
  );
}
