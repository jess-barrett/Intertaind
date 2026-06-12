import type { MediaType } from "@intertaind/types";

export interface MediaFilters {
  decade?: string; // "2020s", "2010s", etc.
  genre?: string;
  platform?: string; // games only
  status?: string; // tv shows only (Returning Series / Ended)
  sort: SortKey;
}

export type SortKey =
  | "popular_all"
  | "popular_week"
  | "popular_month"
  | "popular_year"
  | "release_newest"
  | "release_oldest"
  | "rating_high"
  | "rating_low"
  | "length_long"
  | "length_short";

export const COMMON_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "popular_all", label: "Most popular" },
  { value: "popular_week", label: "Popular this week" },
  { value: "popular_month", label: "Popular this month" },
  { value: "popular_year", label: "Popular this year" },
  { value: "release_newest", label: "Newest first" },
  { value: "release_oldest", label: "Oldest first" },
  { value: "rating_high", label: "Highest rated" },
  { value: "rating_low", label: "Lowest rated" },
];

export const LENGTH_SORT_OPTIONS: Record<MediaType, { long: string; short: string } | null> = {
  movie: { long: "Longest runtime", short: "Shortest runtime" },
  tv_show: { long: "Most seasons", short: "Fewest seasons" },
  book: { long: "Most pages", short: "Fewest pages" },
  video_game: null,
};

export function getSortOptionsForType(mediaType: MediaType): { value: SortKey; label: string }[] {
  const base = [...COMMON_SORT_OPTIONS];
  const lengthLabels = LENGTH_SORT_OPTIONS[mediaType];
  if (lengthLabels) {
    base.push({ value: "length_long", label: lengthLabels.long });
    base.push({ value: "length_short", label: lengthLabels.short });
  }
  return base;
}

/** Parse search params into a MediaFilters object */
export function parseFilters(params: {
  decade?: string;
  genre?: string;
  platform?: string;
  status?: string;
  sort?: string;
}): MediaFilters {
  const sort = (params.sort as SortKey) || "popular_all";
  return {
    decade: params.decade,
    genre: params.genre,
    platform: params.platform,
    status: params.status,
    sort,
  };
}

/** Convert decade string ("2020s") to year range [start, end] */
function decadeToYearRange(decade: string): [number, number] | null {
  if (decade === "older") return [0, 1969];
  const match = decade.match(/^(\d{4})s$/);
  if (!match) return null;
  const start = parseInt(match[1]);
  return [start, start + 9];
}

/** List of decades to show in the dropdown */
export const DECADES = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "older"];

/**
 * Applies common filters (decade, genre, platform, status) to a Supabase query.
 * Pass `prefix` like "media_items." when filtering a joined foreign table.
 */
// Loosely typed to avoid leaking Supabase generics everywhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMediaFilters(query: any, filters: MediaFilters, mediaType: MediaType, prefix = "") {
  if (filters.decade) {
    const range = decadeToYearRange(filters.decade);
    if (range) {
      const [start, end] = range;
      query = query
        .gte(`${prefix}release_date`, `${start}-01-01`)
        .lte(`${prefix}release_date`, `${end}-12-31`);
    }
  }

  if (filters.genre) {
    const field = mediaType === "book" ? "categories" : "genres";
    query = query.contains(`${prefix}metadata->${field}`, JSON.stringify([filters.genre]));
  }

  if (filters.platform && mediaType === "video_game") {
    query = query.contains(
      `${prefix}metadata->platforms`,
      JSON.stringify([filters.platform])
    );
  }

  if (filters.status && mediaType === "tv_show") {
    query = query.eq(`${prefix}metadata->>status`, filters.status);
  }

  return query;
}

/**
 * Applies sort to a media_items query.
 * Popularity-window sorts fall back to tracking_count for now — when the
 * Phase B materialized view exists, swap to reading from that view.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMediaSort(query: any, sort: SortKey, mediaType: MediaType, foreignTable?: string) {
  // When sorting on a joined foreign table, pass { foreignTable: 'media_items' }
  // so Supabase orders by that relation's column.
  const opts = (ascending: boolean) =>
    foreignTable
      ? { ascending, nullsFirst: false, foreignTable }
      : { ascending, nullsFirst: false };

  switch (sort) {
    case "popular_all":
    case "popular_week":
    case "popular_month":
    case "popular_year":
      return query.order("tracking_count", opts(false));
    case "release_newest":
      return query.order("release_date", opts(false));
    case "release_oldest":
      return query.order("release_date", opts(true));
    case "rating_high":
      return query.order("avg_rating", opts(false));
    case "rating_low":
      return query.order("avg_rating", opts(true));
    case "length_long":
    case "length_short": {
      const ascending = sort === "length_short";
      if (mediaType === "movie")
        return query.order("metadata->runtime", opts(ascending));
      if (mediaType === "book")
        return query.order("metadata->page_count", opts(ascending));
      if (mediaType === "tv_show")
        return query.order("metadata->number_of_seasons", opts(ascending));
      return query.order("tracking_count", opts(false));
    }
    default:
      return query.order("tracking_count", opts(false));
  }
}

/**
 * In-memory sort for shelf pages. PostgREST's top-level ordering on embedded
 * tables is flaky when combined with filters — doing it in JS sidesteps that
 * and shelf pages don't paginate, so array size is bounded by a user's
 * library, which is small.
 */
export function sortTrackedMedia<
  T extends {
    media_items: import("@intertaind/types").MediaItem;
    created_at?: string | null;
  }
>(items: T[], sort: SortKey, mediaType: MediaType): T[] {
  const descending = !(
    sort === "release_oldest" ||
    sort === "rating_low" ||
    sort === "length_short"
  );

  function field(item: T): number | null {
    const m = item.media_items;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    switch (sort) {
      case "popular_all":
      case "popular_week":
      case "popular_month":
      case "popular_year":
        return m.tracking_count ?? null;
      case "release_newest":
      case "release_oldest":
        return m.release_date ? new Date(m.release_date).getTime() : null;
      case "rating_high":
      case "rating_low":
        return m.avg_rating ?? null;
      case "length_long":
      case "length_short":
        if (mediaType === "movie")
          return (meta.runtime as number | null) ?? null;
        if (mediaType === "book")
          return (meta.page_count as number | null) ?? null;
        if (mediaType === "tv_show")
          return (meta.number_of_seasons as number | null) ?? null;
        return null;
    }
  }

  return [...items].sort((a, b) => {
    const va = field(a);
    const vb = field(b);
    // Nulls always go last so "Most pages" doesn't surface books without
    // page_count metadata at the top.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return 0;
    return descending ? (va < vb ? 1 : -1) : va < vb ? -1 : 1;
  });
}

/** Common genre lists per media type (curated for the dropdown) */
export const GENRES_BY_TYPE: Record<MediaType, string[]> = {
  movie: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
    "Romance", "Science Fiction", "Thriller", "War", "Western",
  ],
  tv_show: [
    "Action & Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Kids", "Mystery", "News", "Reality",
    "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western",
  ],
  book: [
    "Fiction", "Nonfiction", "Fantasy", "Science Fiction", "Mystery",
    "Thriller", "Romance", "Horror", "Biography", "History", "Self-Help",
    "Business", "Poetry", "Young Adult", "Children", "Comics & Graphic Novels",
  ],
  video_game: [
    "Action", "Adventure", "RPG", "Shooter", "Strategy", "Simulator",
    "Sport", "Racing", "Puzzle", "Platform", "Fighting", "Indie",
    "MOBA", "Point-and-click", "Card & Board Game", "Music",
  ],
};

/** Common game platforms */
export const GAME_PLATFORMS = [
  "PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4",
  "Xbox Series X|S", "Xbox One", "Nintendo Switch", "Nintendo Switch 2",
  "Mac", "Linux", "iOS", "Android",
];

/** TV show status options */
export const TV_STATUSES = ["Returning Series", "Ended", "Canceled"];
