/**
 * FilmographyList — the RN mirror of web's `filmography-list.tsx`
 * (apps/web/src/components/media/filmography-list.tsx). Renders the Person
 * screen's filmography: a filter/sort row over a 2-column poster grid with
 * "Load more" paging.
 *
 * ── Single scrollable ──────────────────────────────────────────────────
 * This component IS the screen's scroll container: one `FlatList`
 * (`numColumns={2}`) whose `ListHeaderComponent` carries BOTH the person
 * header (passed in via `header`) and the filter row, so the whole page —
 * header + filters + grid — scrolls as ONE list. We do NOT nest a FlatList
 * inside a ScrollView (that breaks virtualization and warns in RN); the
 * grid's own virtualization drives the scroll instead.
 *
 * ── Shared logic ───────────────────────────────────────────────────────
 * All merge/filter/sort logic comes from `@intertaind/media` (mergeCredits,
 * filterCredits, sortCredits, genreNames, ROLE_PRIORITY, FILMOGRAPHY_SORTS,
 * DECADES) — the SAME pure module web uses, so the two stay in lockstep.
 *
 * The horizontal filter row lives inside the list header (a `ScrollView
 * horizontal`), carrying its own `px-4` since the grid's horizontal padding
 * is owned by `columnWrapperStyle`.
 */
import { useMemo, useState } from "react";
import type React from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import {
  mergeCredits,
  filterCredits,
  sortCredits,
  genreNames,
  ROLE_PRIORITY,
  FILMOGRAPHY_SORTS,
  DECADES,
  type SortKey,
  type PersonCreditInput,
} from "@intertaind/media";

import { MediaCard } from "@/components/media/media-card";
import { FilterPicker } from "@/components/media/filter-picker";
import { SectionHeading } from "@/components/media/section-heading";
import type { PersonTrackingEntry } from "@/queries/person";
import { useBottomInset } from "@/lib/use-bottom-inset";

// Cards rendered per "page" of the filmography. 24 = 12 rows of the
// 2-column mobile grid. Bumped on "Load more". Mirrors web's page size.
const FILMOGRAPHY_PAGE_SIZE = 24;

export function FilmographyList({
  credits,
  tracking,
  mediaMeta,
  header,
  onMutated,
}: {
  credits: PersonCreditInput[];
  /** Viewer tracking per catalog-linked media_id — drives per-card rating +
      heart AND each card's quick-actions active states. Empty while the
      tracking query is loading / signed out. */
  tracking: Map<string, PersonTrackingEntry>;
  /** Community avg_rating (0–5) per catalog-linked media_id — the card's
      fallback rating. Empty while the media-meta query is loading. */
  mediaMeta: Map<string, number | null>;
  header: React.ReactNode;
  /** Forwarded to each card's quick-actions tab: called after a write so
      the screen can refetch the batched tracking / media-meta maps. */
  onMutated?: () => void;
}) {
  const bottomInset = useBottomInset();

  const merged = useMemo(() => mergeCredits(credits), [credits]);

  // Distinct roles across the filmography → drives the role picker.
  // Sorted by ROLE_PRIORITY (Actor first, then Director, …), unknowns last.
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const c of merged) for (const r of c.roles) set.add(r);
    return Array.from(set).sort(
      (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99),
    );
  }, [merged]);

  // Distinct genre names (resolved from ids) — drops empty/unknown ids.
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const c of merged) for (const g of genreNames(c.genre_ids)) set.add(g);
    return Array.from(set).sort();
  }, [merged]);

  const [role, setRole] = useState("");
  const [type, setType] = useState("");
  const [decade, setDecade] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [visibleCount, setVisibleCount] = useState(FILMOGRAPHY_PAGE_SIZE);

  // Reset to the first page whenever any filter or sort changes — saves the
  // user from scrolling back up after refining the list. Done via React's
  // "adjusting state during render" pattern (a stored signature + in-render
  // reset) rather than a `useEffect` + setState, which cascades an extra
  // render (react-hooks/set-state-in-effect). See
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const filterKey = `${role}|${type}|${decade}|${genre}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(FILMOGRAPHY_PAGE_SIZE);
  }

  const filtered = useMemo(
    () => filterCredits(merged, { role, type, decade, genre }),
    [merged, role, type, decade, genre],
  );
  const sorted = useMemo(() => sortCredits(filtered, sort), [filtered, sort]);

  const remaining = sorted.length - visibleCount;

  return (
    <FlatList
      numColumns={2}
      data={sorted.slice(0, visibleCount)}
      keyExtractor={(c) => c.key}
      // Grid columns own their horizontal padding here (so the header/filters
      // carry their own px-4). 12pt gutter between the two columns.
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      // 16pt vertical gap between rows.
      ItemSeparatorComponent={() => <View className="h-4" />}
      // Clear the persistent bottom navbar (mobile scroll convention).
      contentContainerStyle={{ paddingBottom: bottomInset }}
      renderItem={({ item }) => {
        // Per-card tracking / community-avg are keyed by the credit's
        // catalog id — null/absent for uncataloged credits.
        const id = item.media_item_id;
        return (
          // flex-1 wrapper so the two columns split the row evenly regardless
          // of each card's intrinsic width.
          <View className="flex-1">
            <MediaCard
              credit={item}
              tracking={id ? tracking.get(id) ?? null : null}
              avgRating={id ? mediaMeta.get(id) ?? null : null}
              onMutated={onMutated}
            />
          </View>
        );
      }}
      ListHeaderComponent={
        <View>
          {header}

          <View className="px-4 pb-3 pt-6">
            <SectionHeading>Filmography</SectionHeading>
          </View>

          {/* Horizontally scrollable filter/sort row — touch has no hover,
              so web's inline dropdown row becomes a scroll strip of
              tap-to-open FilterPickers. Carries its own px-4. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            className="mb-3"
          >
            {availableRoles.length > 0 ? (
              <FilterPicker
                placeholder="Any role"
                value={role}
                onChange={setRole}
                options={[
                  { value: "", label: "Any role" },
                  ...availableRoles.map((r) => ({ value: r, label: r })),
                ]}
              />
            ) : null}
            <FilterPicker
              placeholder="Any type"
              value={type}
              onChange={setType}
              options={[
                { value: "", label: "Any type" },
                { value: "movie", label: "Movies" },
                { value: "tv", label: "TV" },
              ]}
            />
            <FilterPicker
              placeholder="Any decade"
              value={decade}
              onChange={setDecade}
              options={[
                { value: "", label: "Any decade" },
                ...DECADES.map((d) => ({ value: d.key, label: d.label })),
              ]}
            />
            {availableGenres.length > 0 ? (
              <FilterPicker
                placeholder="Any genre"
                value={genre}
                onChange={setGenre}
                options={[
                  { value: "", label: "Any genre" },
                  ...availableGenres.map((g) => ({ value: g, label: g })),
                ]}
              />
            ) : null}
            <FilterPicker
              placeholder="Sort by"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={FILMOGRAPHY_SORTS.map((s) => ({
                value: s.key,
                label: s.label,
              }))}
            />
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <Text className="px-4 py-8 text-center text-sm text-text-muted">
          No credits match these filters.
        </Text>
      }
      ListFooterComponent={
        remaining > 0 ? (
          <View className="mt-6 items-center px-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more credits"
              className="rounded-sm border border-surface-border bg-surface-overlay px-4 py-2 active:opacity-70"
              onPress={() =>
                setVisibleCount((n) => n + FILMOGRAPHY_PAGE_SIZE)
              }
            >
              <Text className="text-sm text-text-secondary">
                Load more ({remaining} remaining)
              </Text>
            </Pressable>
          </View>
        ) : null
      }
    />
  );
}
