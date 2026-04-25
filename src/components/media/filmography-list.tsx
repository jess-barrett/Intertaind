"use client";

import { useEffect, useMemo, useState } from "react";
import { tmdbImageUrl } from "@/lib/api/tmdb";
import MediaCard from "@/components/media-card";
import FilterDropdown from "@/components/filter-dropdown";
import type { MediaItem, SearchResult, UserMedia } from "@/lib/types";
import type {
  TMDBPersonCredit,
  TMDBPersonCombinedCredits,
} from "@/lib/api/types";

// Cards rendered per "page" of the filmography. 24 = 6 rows of the
// 4-column grid at md+, ~1 page on most screens. Bumped on Load more.
const FILMOGRAPHY_PAGE_SIZE = 24;

// TMDb published genre IDs — combined movie + TV map.
const TMDB_GENRES: Record<number, string> = {
  // Movies
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  // TV-only
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

// Coarse role buckets for the Involvement filter.
function roleForJob(job: string): string | null {
  if (job === "Director") return "Director";
  if (job === "Writer" || job === "Screenplay" || job === "Story")
    return "Writer";
  if (job === "Producer") return "Producer";
  if (job === "Executive Producer") return "Executive Producer";
  return null;
}

// Stable role priority for display when a credit has multiple roles
// (e.g. Spielberg directed AND produced a film).
const ROLE_PRIORITY: Record<string, number> = {
  Actor: 0,
  Director: 1,
  Writer: 2,
  Producer: 3,
  "Executive Producer": 4,
};

interface Credit {
  key: string;
  id: number;
  media_type: "movie" | "tv";
  title: string;
  overview: string;
  year: number | null;
  release_date: string | null;
  poster_path: string | null;
  character: string;
  order?: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  roles: string[];
}

const SORTS = [
  { key: "release_desc", label: "Newest first" },
  { key: "release_asc", label: "Oldest first" },
  { key: "alpha", label: "Alphabetical" },
  { key: "billing", label: "Billing" },
  { key: "rating_desc", label: "Highest rated" },
  { key: "rating_asc", label: "Lowest rated" },
  { key: "popular", label: "Most popular" },
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

export default function FilmographyList({
  credits,
  mediaItemsByKey,
  viewerTracking,
}: {
  credits: TMDBPersonCombinedCredits;
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
    for (const c of merged)
      for (const g of c.genre_ids) {
        const name = TMDB_GENRES[g];
        if (name) set.add(name);
      }
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

  const filtered = useMemo(() => {
    return merged.filter((c) => {
      if (role && !c.roles.includes(role)) return false;
      if (type && c.media_type !== type) return false;
      if (decade) {
        if (c.year === null) return false;
        const range = decadeToYearRange(decade);
        if (range && (c.year < range[0] || c.year > range[1])) return false;
      }
      if (genre) {
        const names = c.genre_ids
          .map((g) => TMDB_GENRES[g])
          .filter((n): n is string => !!n);
        if (!names.includes(genre)) return false;
      }
      return true;
    });
  }, [merged, role, type, decade, genre]);

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
          options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
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

/**
 * Combine cast + crew into a single deduped list keyed by id+media_type.
 * Each entry collects all roles the person held on that title so a single
 * card can represent "Spielberg — Director, Producer" rather than two
 * rows for the same film.
 */
function mergeCredits(credits: TMDBPersonCombinedCredits): Credit[] {
  const map = new Map<string, Credit>();

  function ensure(c: TMDBPersonCredit, role: string) {
    const key = `${c.media_type}-${c.id}`;
    const existing = map.get(key);
    const title = (c.media_type === "movie" ? c.title : c.name) ?? "";
    const date =
      (c.media_type === "movie" ? c.release_date : c.first_air_date) ?? null;
    const year = date ? parseInt(date.slice(0, 4), 10) || null : null;
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      // Prefer richer character text from the cast row when we see one.
      if (role === "Actor" && c.character && !existing.character) {
        existing.character = c.character;
      }
      // Keep the lowest order across cast entries for the same title —
      // when an actor plays multiple roles in one film TMDb returns one
      // cast row per role, each with its own order. The lowest is the
      // most prominent role, which is what Letterboxd surfaces.
      if (role === "Actor" && c.order != null) {
        if (existing.order == null || c.order < existing.order) {
          existing.order = c.order;
        }
      }
    } else {
      map.set(key, {
        key,
        id: c.id,
        media_type: c.media_type,
        title,
        overview: c.overview ?? "",
        year,
        release_date: date,
        poster_path: c.poster_path,
        character: c.character ?? "",
        order: c.order,
        vote_average: c.vote_average ?? 0,
        vote_count: c.vote_count ?? 0,
        genre_ids: c.genre_ids ?? [],
        roles: [role],
      });
    }
  }

  for (const c of credits.cast ?? []) ensure(c, "Actor");
  for (const c of credits.crew ?? []) {
    const role = roleForJob((c as { job: string }).job);
    if (role) ensure(c, role);
  }

  return Array.from(map.values());
}

function sortCredits(list: Credit[], sort: SortKey): Credit[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "release_desc":
        return (b.release_date ?? "").localeCompare(a.release_date ?? "");
      case "release_asc":
        // Empty dates go to the bottom for ascending too.
        if (!a.release_date && b.release_date) return 1;
        if (a.release_date && !b.release_date) return -1;
        return (a.release_date ?? "").localeCompare(b.release_date ?? "");
      case "alpha":
        return a.title.localeCompare(b.title);
      case "billing": {
        const ao = a.order ?? 9999;
        const bo = b.order ?? 9999;
        if (ao !== bo) return ao - bo;
        // For top-billed actors most cast credits end up at order=0, so
        // the tiebreaker does most of the work. Use popularity first
        // (matches Letterboxd) — bigger films win — then year, then
        // alphabetical for full determinism.
        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
        if ((b.release_date ?? "") !== (a.release_date ?? "")) {
          return (b.release_date ?? "").localeCompare(a.release_date ?? "");
        }
        return a.title.localeCompare(b.title);
      }
      case "rating_desc":
        return b.vote_average - a.vote_average;
      case "rating_asc":
        return a.vote_average - b.vote_average;
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
