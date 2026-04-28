"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MediaCard from "@/components/media-card";
import FilterDropdown from "@/components/filter-dropdown";
import type { ListItem, MediaItem, UserMedia } from "@/lib/types";

type ItemRow = ListItem & { media_items: MediaItem };

const ITEMS_PER_PAGE = 100;

interface SortOption {
  key: string;
  label: string;
  /** Skip this option when the viewer isn't signed in. */
  requiresUser?: boolean;
}

const SORT_OPTIONS: SortOption[] = [
  // Position-based first — surfaces curator intent at the top of the
  // dropdown. These are most meaningful on ranked lists but every list
  // has a position field, so we expose them universally.
  { key: "position_asc", label: "List order" },
  { key: "position_desc", label: "Reverse list order" },
  // Time-based
  { key: "added_desc", label: "Recently added" },
  { key: "added_asc", label: "Earliest added" },
  { key: "release_desc", label: "Release date — newest" },
  { key: "release_asc", label: "Release date — oldest" },
  // Alphabetical
  { key: "title_asc", label: "Title A–Z" },
  { key: "title_desc", label: "Title Z–A" },
  // Crowd signal
  { key: "popularity_desc", label: "Most popular" },
  { key: "avg_rating_desc", label: "Average rating — highest" },
  { key: "avg_rating_asc", label: "Average rating — lowest" },
  // Viewer-specific
  { key: "your_rating_desc", label: "Your rating — highest", requiresUser: true },
  { key: "your_rating_asc", label: "Your rating — lowest", requiresUser: true },
  // Length
  { key: "length_desc", label: "Length — longest" },
  { key: "length_asc", label: "Length — shortest" },
  // Random — re-rolls the seed each time the user picks it from the
  // dropdown so "Shuffle again" works without a separate button.
  { key: "shuffle", label: "Shuffle" },
];

/**
 * Filter + sort controls on top of the list-detail items grid. All
 * client-side: filtering by decade or genre is a derive-from-loaded-
 * items operation, and sorting is local. No URL mutation, no server
 * round-trips per change.
 */
export default function ListItemsGrid({
  items,
  viewerTracking,
  isLoggedIn,
  isRanked,
}: {
  items: ItemRow[];
  viewerTracking: Record<string, UserMedia>;
  isLoggedIn: boolean;
  /** When true, render a rank badge below each card (#1, #2, …) and
      suppress the sort dropdown — position IS the order on a ranked
      list, so sorting it would be self-defeating. Filters still work
      and preserve the original rank numbers. */
  isRanked: boolean;
}) {
  const [decade, setDecade] = useState("");
  const [genre, setGenre] = useState("");
  // Default to the curator's intended order on ranked lists; default
  // to "Recently added" elsewhere — same as before this got promoted
  // to a universal sort option.
  const [sort, setSort] = useState<string>(
    isRanked ? "position_asc" : "added_desc"
  );
  // Seed for the Shuffle sort — regenerated every time the user picks
  // "Shuffle" from the dropdown, so picking it twice in a row reshuffles
  // instead of giving the same order.
  const [shuffleSeed, setShuffleSeed] = useState(() =>
    Math.floor(Math.random() * 1e9)
  );

  function handleSortChange(next: string) {
    if (next === "shuffle") {
      setShuffleSeed(Math.floor(Math.random() * 1e9));
    }
    setSort(next);
  }

  // Decades available across the current item set. Limits the dropdown
  // to decades the user could plausibly filter into (no point showing
  // 1970s when nothing in the list is that old).
  const decadeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const li of items) {
      const year = parseYear(li.media_items.release_date);
      if (year !== null) set.add(decadeFor(year));
    }
    return Array.from(set).sort((a, b) => parseInt(b) - parseInt(a));
  }, [items]);

  // Genre options pulled from each item's metadata. Movies + TV use
  // `metadata.genres`; books use `metadata.categories`. We dedupe and
  // sort alphabetically.
  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const li of items) {
      for (const g of itemGenres(li.media_items)) set.add(g);
    }
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((li) => {
      if (decade) {
        const year = parseYear(li.media_items.release_date);
        if (year === null || decadeFor(year) !== decade) return false;
      }
      if (genre) {
        const genres = itemGenres(li.media_items);
        if (!genres.includes(genre)) return false;
      }
      return true;
    });
  }, [items, decade, genre]);

  const sorted = useMemo(
    () => sortItems(filtered, sort, viewerTracking, shuffleSeed),
    [filtered, sort, viewerTracking, shuffleSeed]
  );

  // Pagination — applied AFTER filter + sort so the visible page
  // reflects whatever ordering the user has chosen. Reset to page 0
  // whenever the upstream set changes so users aren't stuck on an
  // empty page after narrowing filters.
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => {
    setPage(0);
  }, [decade, genre, sort, shuffleSeed]);

  const visibleItems = useMemo(
    () =>
      sorted.slice(
        safePage * ITEMS_PER_PAGE,
        safePage * ITEMS_PER_PAGE + ITEMS_PER_PAGE
      ),
    [sorted, safePage]
  );

  const showPagination = sorted.length > ITEMS_PER_PAGE;

  const visibleSortOptions = SORT_OPTIONS.filter(
    (o) => !o.requiresUser || isLoggedIn
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-surface-border pb-4">
        {decadeOptions.length > 0 && (
          <FilterDropdown
            value={decade}
            placeholder="Any decade"
            onChange={setDecade}
            options={[
              { value: "", label: "Any decade" },
              ...decadeOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
        )}
        {genreOptions.length > 0 && (
          <FilterDropdown
            value={genre}
            placeholder="Any genre"
            onChange={setGenre}
            options={[
              { value: "", label: "Any genre" },
              ...genreOptions.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}
        <FilterDropdown
          value={sort}
          placeholder="Sort by"
          onChange={handleSortChange}
          options={visibleSortOptions.map((o) => ({
            value: o.key,
            label: o.label,
          }))}
          className="ml-auto"
        />
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          No items match these filters.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleItems.map((item) => (
              <div key={item.id} className="space-y-2">
                <MediaCard
                  item={item.media_items}
                  showStats
                  userMedia={viewerTracking[item.media_items.id] ?? null}
                  userRating={
                    viewerTracking[item.media_items.id]?.rating ?? null
                  }
                  userFavorite={
                    viewerTracking[item.media_items.id]?.is_favorite ?? false
                  }
                />
                {/* Rank badge — preserves the item's original position
                    even when filters narrow the displayed set, so a
                    filtered ranked list shows e.g. #1, #4, #7 instead
                    of being renumbered 1, 2, 3. */}
                {isRanked && (
                  <div className="text-center text-xl font-bold text-brand">
                    {item.position + 1}
                  </div>
                )}
                {item.reason && (
                  <p className="px-1 text-xs leading-relaxed text-text-muted">
                    {item.reason}
                  </p>
                )}
              </div>
            ))}
          </div>

          {showPagination && (
            <div className="mt-6 flex items-center justify-center gap-3 text-xs text-text-muted">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={12} />
                Previous
              </button>
              <span className="tabular-nums">
                {safePage * ITEMS_PER_PAGE + 1}–
                {Math.min(
                  (safePage + 1) * ITEMS_PER_PAGE,
                  sorted.length
                )}{" "}
                of {sorted.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={safePage >= totalPages - 1}
                className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function parseYear(date: string | null): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function decadeFor(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Genres from item metadata. Movies + TV use `metadata.genres` (string
 * array); books use `metadata.categories`; games use `metadata.genres`.
 * Returns an empty array when nothing's there.
 */
function itemGenres(media: MediaItem): string[] {
  const meta = (media.metadata as Record<string, unknown> | null) ?? {};
  const sources: unknown[] = [];
  if (Array.isArray(meta.genres)) sources.push(meta.genres);
  if (Array.isArray(meta.categories)) sources.push(meta.categories);
  const out: string[] = [];
  for (const arr of sources) {
    for (const v of arr as unknown[]) {
      if (typeof v === "string") out.push(v);
    }
  }
  return out;
}

/**
 * Per-media-type "length" metric used by the Length sort. Movies are
 * runtime in minutes; books are page count; TV is episode count; games
 * have no reliable metric so they sort to the end. The values aren't
 * comparable across types in absolute terms — but within a single-type
 * list (which is the typical case), the relative order is meaningful.
 */
function lengthValue(media: MediaItem): number | null {
  const meta = (media.metadata as Record<string, unknown> | null) ?? {};
  switch (media.media_type) {
    case "movie":
      return typeof meta.runtime === "number" ? (meta.runtime as number) : null;
    case "book":
      return typeof meta.page_count === "number"
        ? (meta.page_count as number)
        : null;
    case "tv_show":
      return typeof meta.number_of_episodes === "number"
        ? (meta.number_of_episodes as number)
        : null;
    case "video_game":
    default:
      return null;
  }
}

function sortItems(
  list: ItemRow[],
  sort: string,
  viewerTracking: Record<string, UserMedia>,
  shuffleSeed: number
): ItemRow[] {
  if (sort === "shuffle") return shuffleArray(list, shuffleSeed);

  const sorted = [...list];
  // For numeric / nullable comparators, use a "nulls go last" wrapper so
  // missing values don't pollute the top of either direction.
  function nullableCompare(
    a: number | null,
    b: number | null,
    ascending: boolean
  ): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return ascending ? a - b : b - a;
  }
  sorted.sort((a, b) => {
    switch (sort) {
      case "position_asc":
        return a.position - b.position;
      case "position_desc":
        return b.position - a.position;
      case "added_desc":
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      case "added_asc":
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      case "release_desc":
        return (b.media_items.release_date ?? "").localeCompare(
          a.media_items.release_date ?? ""
        );
      case "release_asc":
        return (a.media_items.release_date ?? "").localeCompare(
          b.media_items.release_date ?? ""
        );
      case "title_asc":
        return a.media_items.title.localeCompare(b.media_items.title);
      case "title_desc":
        return b.media_items.title.localeCompare(a.media_items.title);
      case "popularity_desc":
        return nullableCompare(
          a.media_items.tracking_count ?? 0,
          b.media_items.tracking_count ?? 0,
          false
        );
      case "avg_rating_desc":
        return nullableCompare(
          a.media_items.avg_rating,
          b.media_items.avg_rating,
          false
        );
      case "avg_rating_asc":
        return nullableCompare(
          a.media_items.avg_rating,
          b.media_items.avg_rating,
          true
        );
      case "your_rating_desc":
        return nullableCompare(
          viewerTracking[a.media_items.id]?.rating ?? null,
          viewerTracking[b.media_items.id]?.rating ?? null,
          false
        );
      case "your_rating_asc":
        return nullableCompare(
          viewerTracking[a.media_items.id]?.rating ?? null,
          viewerTracking[b.media_items.id]?.rating ?? null,
          true
        );
      case "length_desc":
        return nullableCompare(
          lengthValue(a.media_items),
          lengthValue(b.media_items),
          false
        );
      case "length_asc":
        return nullableCompare(
          lengthValue(a.media_items),
          lengthValue(b.media_items),
          true
        );
      default:
        return 0;
    }
  });
  return sorted;
}

/**
 * Deterministic Fisher-Yates with a seed-driven LCG so the order is
 * stable across re-renders for the same seed but reshuffles cleanly
 * when the seed changes (which happens whenever the user picks
 * "Shuffle" from the dropdown).
 */
function shuffleArray<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
