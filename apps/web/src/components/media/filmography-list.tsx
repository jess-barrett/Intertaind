"use client";

import { useEffect, useMemo, useState } from "react";
import {
  tmdbImageUrl,
  mergeCredits,
  filterCredits,
  sortCredits,
  genreNames,
  FILMOGRAPHY_SORTS,
  DECADES,
  ROLE_PRIORITY,
} from "@intertaind/media";
import type { PersonCreditInput } from "@intertaind/media";
import MediaCard from "@/components/media-card";
import FilterDropdown from "@/components/filter-dropdown";
import type { MediaItem, SearchResult, UserMedia } from "@intertaind/types";
import type { SortKey } from "@intertaind/media";

// Cards rendered per "page" of the filmography. 24 = 6 rows of the
// 4-column grid at md+, ~1 page on most screens. Bumped on Load more.
const FILMOGRAPHY_PAGE_SIZE = 24;

export default function FilmographyList({
  credits,
  mediaItemsByKey,
  viewerTracking,
}: {
  credits: PersonCreditInput[];
  /** Map of `${media_type}-${tmdb_id}` → existing media_items row. Drives
      whether each credit renders as a full MediaCard (with slide-out)
      or the simpler fallback. */
  mediaItemsByKey?: Record<string, MediaItem>;
  viewerTracking?: Record<string, UserMedia>;
}) {
  const merged = useMemo(() => mergeCredits(credits), [credits]);

  // Distinct roles across the filmography → drives the Involvement dropdown.
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const c of merged) for (const r of c.roles) set.add(r);
    return Array.from(set).sort(
      (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
    );
  }, [merged]);

  // Distinct genre names (resolved from ids) — drops the noise of empty
  // genre_ids and unknown ids.
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const c of merged) for (const g of genreNames(c.genre_ids)) set.add(g);
    return Array.from(set).sort();
  }, [merged]);

  const [sort, setSort] = useState<SortKey>("popular");
  const [role, setRole] = useState<string>("");
  const [decade, setDecade] = useState<string>("");
  const [genre, setGenre] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(FILMOGRAPHY_PAGE_SIZE);

  // Reset to the first page whenever any filter or sort changes — saves
  // the user from having to scroll back up after refining the list.
  useEffect(() => {
    setVisibleCount(FILMOGRAPHY_PAGE_SIZE);
  }, [sort, role, decade, genre, type]);

  const filtered = useMemo(
    () => filterCredits(merged, { role, type, decade, genre }),
    [merged, role, type, decade, genre]
  );

  const sorted = useMemo(() => sortCredits(filtered, sort), [filtered, sort]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-surface-border pb-4">
        {availableRoles.length > 0 && (
          <FilterDropdown
            value={role}
            placeholder="Any role"
            onChange={setRole}
            options={[
              { value: "", label: "Any role" },
              ...availableRoles.map((r) => ({ value: r, label: r })),
            ]}
          />
        )}
        <FilterDropdown
          value={type}
          placeholder="Any type"
          onChange={setType}
          options={[
            { value: "", label: "Any type" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV" },
          ]}
        />
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
          options={FILMOGRAPHY_SORTS.map((s) => ({
            value: s.key,
            label: s.label,
          }))}
          className="ml-auto"
        />
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          No credits match these filters.
        </p>
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {sorted.slice(0, visibleCount).map((c) => {
            const internalType =
              c.media_type === "movie" ? "movie" : "tv_show";
            const matched =
              mediaItemsByKey?.[`${internalType}-${c.id}`];
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
            // Synthesize a SearchResult for credits not yet in our DB so
            // the card still renders as a full MediaCard. Click → upsert
            // → navigate. Slide-out actions also lazy-upsert via
            // MediaCardActions' built-in searchResult flow.
            const synth: SearchResult = {
              media_type: internalType,
              title: c.title,
              // TMDb returns the synopsis in `overview`; pass it through
              // as the description so freshly-upserted rows aren't blank.
              description: c.overview || null,
              cover_image_url: tmdbImageUrl(c.poster_path),
              backdrop_url: null,
              release_date: c.release_date,
              metadata: {},
              external_ids: { tmdb_id: c.id },
            };
            return <MediaCard key={c.key} searchResult={synth} />;
          })}
        </div>

        {visibleCount < sorted.length && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setVisibleCount((n) => n + FILMOGRAPHY_PAGE_SIZE)
              }
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
