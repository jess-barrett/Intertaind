"use client";

import { useEffect, useMemo, useState } from "react";
import MediaCard from "@/components/media-card";
import FilterDropdown from "@/components/filter-dropdown";
import type { MediaItem, MediaType, SearchResult, UserMedia } from "@/lib/types";

const PAGE_SIZE = 24;

const SORTS = [
  { key: "popular", label: "Most popular" },
  { key: "release_desc", label: "Newest first" },
  { key: "release_asc", label: "Oldest first" },
  { key: "alpha", label: "Alphabetical" },
  { key: "rating_desc", label: "Highest rated" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const DECADES = [
  { key: "2020s", label: "2020s" },
  { key: "2010s", label: "2010s" },
  { key: "2000s", label: "2000s" },
  { key: "1990s", label: "1990s" },
  { key: "1980s", label: "1980s" },
  { key: "1970s", label: "1970s" },
  { key: "older", label: "Pre-1970" },
];

/**
 * One row in an entity's catalog. Pre-resolved to a generic shape so the
 * component can mix TMDb movies, TMDb TV, IGDB games, and Google Books
 * volumes on the same grid without any source-aware logic at render
 * time.
 */
export interface EntityCredit {
  key: string;
  source: "tmdb" | "igdb" | "gbooks" | "openlibrary" | "hardcover";
  /** TMDb / IGDB / Hardcover use numeric ids; Google Books uses string
      volume ids; Open Library uses string work ids ("OL...W"). */
  source_id: number | string;
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_url: string | null;
  backdrop_url: string | null;
  release_date: string | null;
  year: number | null;
  vote_average: number;
  vote_count: number;
  /** Resolved genre names — TMDb ids, IGDB names, and Google Books
      categories all end up here so the dropdown is uniform. */
  genres: string[];
  /** Extra fields the card's lazy-upsert flow needs to write a complete
      media_items row on first click. */
  metadata?: Record<string, unknown>;
  /** Additional identifiers beyond the primary `source_id`. Author pages
      use this to ride an Open Library work id alongside the Google Books
      id so the upsert flow stamps both onto the new media_items row. */
  extra_external_ids?: Record<string, string | number>;
}

const TYPE_LABELS: Record<MediaType, string> = {
  movie: "Movies",
  tv_show: "TV",
  book: "Books",
  video_game: "Games",
};

export default function EntityFilmographyList({
  credits,
  mediaItemsByKey,
  viewerTracking,
  defaultSort = "popular",
}: {
  credits: EntityCredit[];
  /** Map of `${media_type}-${source_id}` → existing media_items row.
      Determines whether each card renders with full tracking state or
      lazy-upserts on click. */
  mediaItemsByKey?: Record<string, MediaItem>;
  viewerTracking?: Record<string, UserMedia>;
  /** Override starting sort. Author pages set this to `release_desc`
      since Open Library doesn't expose rating counts that "popular"
      relies on. */
  defaultSort?: (typeof SORTS)[number]["key"];
}) {
  const availableTypes = useMemo(() => {
    const set = new Set<MediaType>();
    for (const c of credits) set.add(c.media_type);
    return Array.from(set);
  }, [credits]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const c of credits) for (const g of c.genres) set.add(g);
    return Array.from(set).sort();
  }, [credits]);

  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [type, setType] = useState<string>("");
  const [decade, setDecade] = useState<string>("");
  const [genre, setGenre] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination whenever the filtered set changes — saves the user
  // from scrolling back up after refining.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sort, type, decade, genre]);

  const filtered = useMemo(() => {
    return credits.filter((c) => {
      if (type && c.media_type !== type) return false;
      if (decade) {
        if (c.year === null) return false;
        const range = decadeToYearRange(decade);
        if (range && (c.year < range[0] || c.year > range[1])) return false;
      }
      if (genre && !c.genres.includes(genre)) return false;
      return true;
    });
  }, [credits, type, decade, genre]);

  const sorted = useMemo(() => sortCredits(filtered, sort), [filtered, sort]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-surface-border pb-4">
        {availableTypes.length > 1 && (
          <FilterDropdown
            value={type}
            placeholder="Any type"
            onChange={setType}
            options={[
              { value: "", label: "Any type" },
              ...availableTypes.map((t) => ({
                value: t,
                label: TYPE_LABELS[t],
              })),
            ]}
          />
        )}
        <FilterDropdown
          value={decade}
          placeholder="Any decade"
          onChange={setDecade}
          options={[
            { value: "", label: "Any decade" },
            ...DECADES.map((d) => ({ value: d.key, label: d.label })),
          ]}
        />
        {availableGenres.length > 0 && (
          <FilterDropdown
            value={genre}
            placeholder="Any genre"
            onChange={setGenre}
            options={[
              { value: "", label: "Any genre" },
              ...availableGenres.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}
        <FilterDropdown
          value={sort}
          placeholder="Sort by"
          onChange={(v) => setSort(v as SortKey)}
          options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
          className="ml-auto"
        />
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          No releases match these filters.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {sorted.slice(0, visibleCount).map((c) => {
              const matched =
                mediaItemsByKey?.[`${c.media_type}-${c.source_id}`];
              if (matched) {
                const um = viewerTracking?.[matched.id];
                return (
                  <MediaCard
                    key={c.key}
                    item={matched}
                    userRating={um?.rating ?? null}
                    userFavorite={um?.is_favorite ?? false}
                    userMedia={um ?? null}
                  />
                );
              }
              const externalKey =
                c.source === "tmdb"
                  ? "tmdb_id"
                  : c.source === "igdb"
                    ? "igdb_id"
                    : c.source === "gbooks"
                      ? "google_books_id"
                      : c.source === "openlibrary"
                        ? "openlibrary_work_id"
                        : "hardcover_book_id";
              const synth: SearchResult = {
                media_type: c.media_type,
                title: c.title,
                description: c.description,
                cover_image_url: c.cover_url,
                backdrop_url: c.backdrop_url,
                release_date: c.release_date,
                metadata: c.metadata ?? {},
                external_ids: {
                  [externalKey]: c.source_id,
                  ...(c.extra_external_ids ?? {}),
                },
              };
              return <MediaCard key={c.key} searchResult={synth} />;
            })}
          </div>

          {visibleCount < sorted.length && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-sm border border-surface-border bg-surface-overlay px-4 py-2 text-sm text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
              >
                Load more ({sorted.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function sortCredits(list: EntityCredit[], sort: SortKey): EntityCredit[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "release_desc":
        return (b.release_date ?? "").localeCompare(a.release_date ?? "");
      case "release_asc":
        if (!a.release_date && b.release_date) return 1;
        if (a.release_date && !b.release_date) return -1;
        return (a.release_date ?? "").localeCompare(b.release_date ?? "");
      case "alpha":
        return a.title.localeCompare(b.title);
      case "rating_desc":
        return b.vote_average - a.vote_average;
      case "popular":
        return b.vote_count - a.vote_count;
      default:
        return 0;
    }
  });
  return sorted;
}

function decadeToYearRange(decade: string): [number, number] | null {
  if (decade === "older") return [0, 1969];
  const m = decade.match(/^(\d{4})s$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  return [start, start + 9];
}
