/**
 * Shared, pure filmography logic — merge cast/crew per title, filter, and
 * sort — used by BOTH the web and mobile Person / Filmography pages.
 *
 * Extracted verbatim (behavior-wise) from web's
 * `apps/web/src/components/media/filmography-list.tsx`, whose merge/filter/
 * sort was embedded in a React component. Lifting it here means web and
 * mobile import ONE copy instead of drifting apart.
 *
 * ## Key difference from web
 * Web operated on raw TMDb combined credits (`{ cast, crew }` arrays).
 * This module operates on a flat array of `person_credits`-shaped DB rows
 * (`PersonCreditInput`) — one row per cast/crew credit. The merge collapses
 * the cast + crew rows of a single title into one `MergedCredit` card that
 * collects every role the person held on it.
 *
 * ## Contract
 * - **Pure & immutable.** Functions never mutate their inputs; sorts/filters
 *   return fresh arrays.
 * - **No React / lucide / DB deps.** This module is imported by both apps and
 *   by the pure `@intertaind/media` package — keep it dependency-free. The
 *   input type is defined here (structural), so a `Tables<'person_credits'>`
 *   row satisfies it without importing `@intertaind/supabase`.
 */

/**
 * A single normalized credit row — structurally a `person_credits` DB row.
 * Defined locally (not imported) so the package stays dependency-free while
 * a real `Tables<'person_credits'>` value still satisfies it.
 */
export interface PersonCreditInput {
  media_tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  release_date: string | null;
  poster_path: string | null;
  overview: string | null;
  character: string | null;
  billing_order: number | null;
  job: string | null;
  department: string | null;
  credit_type: "cast" | "crew";
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_item_id: string | null;
}

/** One deduped filmography card: all of a person's roles on a single title. */
export interface MergedCredit {
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
  media_item_id: string | null;
}

// TMDb published genre IDs — combined movie + TV map.
export const TMDB_GENRES: Record<number, string> = {
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
export function roleForJob(job: string): string | null {
  if (job === "Director") return "Director";
  if (job === "Writer" || job === "Screenplay" || job === "Story")
    return "Writer";
  if (job === "Producer") return "Producer";
  if (job === "Executive Producer") return "Executive Producer";
  return null;
}

// Stable role priority for display when a credit has multiple roles
// (e.g. Spielberg directed AND produced a film).
export const ROLE_PRIORITY: Record<string, number> = {
  Actor: 0,
  Director: 1,
  Writer: 2,
  Producer: 3,
  "Executive Producer": 4,
};

export const FILMOGRAPHY_SORTS = [
  { key: "release_desc", label: "Newest first" },
  { key: "release_asc", label: "Oldest first" },
  { key: "alpha", label: "Alphabetical" },
  { key: "billing", label: "Billing" },
  { key: "rating_desc", label: "Highest rated" },
  { key: "rating_asc", label: "Lowest rated" },
  { key: "popular", label: "Most popular" },
] as const;
export type SortKey = (typeof FILMOGRAPHY_SORTS)[number]["key"];

export const DECADES = [
  { key: "2020s", label: "2020s" },
  { key: "2010s", label: "2010s" },
  { key: "2000s", label: "2000s" },
  { key: "1990s", label: "1990s" },
  { key: "1980s", label: "1980s" },
  { key: "1970s", label: "1970s" },
  { key: "older", label: "Pre-1970" },
];

/** Resolve TMDb genre ids to display names, dropping empty/unknown ids. */
export function genreNames(genre_ids: number[]): string[] {
  return genre_ids
    .map((g) => TMDB_GENRES[g])
    .filter((n): n is string => !!n);
}

/**
 * Combine cast + crew rows into a single deduped list keyed by
 * `${media_type}-${media_tmdb_id}`. Each entry collects all roles the
 * person held on that title so a single card can represent
 * "Spielberg — Director, Producer" rather than two rows for the same film.
 */
export function mergeCredits(rows: PersonCreditInput[]): MergedCredit[] {
  const map = new Map<string, MergedCredit>();

  function ensure(c: PersonCreditInput, role: string) {
    const key = `${c.media_type}-${c.media_tmdb_id}`;
    const existing = map.get(key);
    const date = c.release_date ?? null;
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
      if (role === "Actor" && c.billing_order != null) {
        if (existing.order == null || c.billing_order < existing.order) {
          existing.order = c.billing_order;
        }
      }
    } else {
      map.set(key, {
        key,
        id: c.media_tmdb_id,
        media_type: c.media_type,
        title: c.title,
        overview: c.overview ?? "",
        year,
        release_date: date,
        poster_path: c.poster_path,
        character: c.character ?? "",
        order: c.billing_order ?? undefined,
        vote_average: c.vote_average ?? 0,
        vote_count: c.vote_count ?? 0,
        genre_ids: c.genre_ids ?? [],
        roles: [role],
        media_item_id: c.media_item_id,
      });
    }
  }

  for (const c of rows) {
    if (c.credit_type === "cast") {
      ensure(c, "Actor");
    } else {
      if (c.job == null) continue;
      const role = roleForJob(c.job);
      if (role) ensure(c, role);
    }
  }

  return Array.from(map.values());
}

/** Filters applied to a merged filmography list. */
export interface FilmographyFilters {
  role?: string;
  type?: string;
  decade?: string;
  genre?: string;
}

/**
 * Apply the Person page's role / type / decade / genre filters. An empty /
 * omitted filter matches everything. Credits with a null `year` are
 * excluded whenever a decade filter is set.
 */
export function filterCredits(
  list: MergedCredit[],
  { role, type, decade, genre }: FilmographyFilters
): MergedCredit[] {
  return list.filter((c) => {
    if (role && !c.roles.includes(role)) return false;
    if (type && c.media_type !== type) return false;
    if (decade) {
      if (c.year === null) return false;
      const range = decadeToYearRange(decade);
      if (range && (c.year < range[0] || c.year > range[1])) return false;
    }
    if (genre) {
      const names = genreNames(c.genre_ids);
      if (!names.includes(genre)) return false;
    }
    return true;
  });
}

/** Sort a merged filmography list by the given key, returning a fresh array. */
export function sortCredits(list: MergedCredit[], sort: SortKey): MergedCredit[] {
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

/** Map a decade filter key to an inclusive [start, end] year range. */
export function decadeToYearRange(decade: string): [number, number] | null {
  if (decade === "older") return [0, 1969];
  const m = decade.match(/^(\d{4})s$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  return [start, start + 9];
}
