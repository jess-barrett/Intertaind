import type { MediaType } from "@/lib/types";
import type { MediaFilters, SortKey } from "@/lib/media-query";
import { GENRES_BY_TYPE, GAME_PLATFORMS, TV_STATUSES } from "@/lib/media-query";

/**
 * URL path parser/serializer for filtered browse pages.
 *
 * Canonical path format:
 *   /{type}/browse/{sort}/decade/{decade}/genre/{genre}/platform/{platform}/status/{status}
 *
 * Sort segment is always first (defaults to popular-week).
 * Other segments are in fixed order: decade → genre → platform → status.
 */

// Internal SortKey uses underscores for legacy reasons; URLs use hyphens.
const SORT_KEY_TO_SLUG: Record<SortKey, string> = {
  popular_all: "popular-all",
  popular_week: "popular-week",
  popular_month: "popular-month",
  popular_year: "popular-year",
  release_newest: "release-newest",
  release_oldest: "release-oldest",
  rating_high: "rating-high",
  rating_low: "rating-low",
  length_long: "length-long",
  length_short: "length-short",
};

const SLUG_TO_SORT_KEY: Record<string, SortKey> = Object.fromEntries(
  Object.entries(SORT_KEY_TO_SLUG).map(([k, v]) => [v, k as SortKey])
);

const DEFAULT_SORT: SortKey = "popular_week";

// URL path prefix per media type
export const MEDIA_TYPE_PATHS: Record<MediaType, string> = {
  movie: "movies",
  tv_show: "tv-shows",
  book: "books",
  video_game: "games",
};

export const PATH_TO_MEDIA_TYPE: Record<string, MediaType> = Object.fromEntries(
  Object.entries(MEDIA_TYPE_PATHS).map(([k, v]) => [v, k as MediaType])
);

/** Convert "Science Fiction" → "science-fiction" */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Look up original-casing value from slug. Returns null if not found. */
function unslugify(slug: string, list: readonly string[]): string | null {
  const found = list.find((item) => slugify(item) === slug);
  return found ?? null;
}

/**
 * Serialize a MediaFilters object into a canonical path for the given type.
 * Returns e.g. "/movies/browse/rating-high/decade/2020s/genre/drama"
 */
export function filtersToPath(type: MediaType, filters: MediaFilters): string {
  const parts = [MEDIA_TYPE_PATHS[type], "browse"];

  // Always include sort (unless it's the default)
  if (filters.sort && filters.sort !== DEFAULT_SORT) {
    parts.push(SORT_KEY_TO_SLUG[filters.sort]);
  }

  if (filters.decade) {
    parts.push("decade", filters.decade);
  }

  if (filters.genre) {
    parts.push("genre", slugify(filters.genre));
  }

  if (filters.platform) {
    parts.push("platform", slugify(filters.platform));
  }

  if (filters.status) {
    parts.push("status", slugify(filters.status));
  }

  return "/" + parts.join("/");
}

/**
 * Parse path segments (after /{type}/browse/) into a MediaFilters object.
 * Segments: ["rating-high", "decade", "2020s", "genre", "drama"]
 */
export function parsePath(
  segments: string[] | undefined,
  type: MediaType
): MediaFilters {
  const filters: MediaFilters = { sort: DEFAULT_SORT };
  if (!segments || segments.length === 0) return filters;

  let i = 0;

  // First segment may be a sort key
  if (segments[0] && SLUG_TO_SORT_KEY[segments[0]]) {
    filters.sort = SLUG_TO_SORT_KEY[segments[0]];
    i = 1;
  }

  // Remaining segments are key/value pairs
  while (i < segments.length - 1) {
    const key = segments[i];
    const value = segments[i + 1];
    i += 2;

    if (key === "decade") {
      filters.decade = value;
    } else if (key === "genre") {
      const genre = unslugify(value, GENRES_BY_TYPE[type]);
      if (genre) filters.genre = genre;
    } else if (key === "platform" && type === "video_game") {
      const platform = unslugify(value, GAME_PLATFORMS);
      if (platform) filters.platform = platform;
    } else if (key === "status" && type === "tv_show") {
      const status = unslugify(value, TV_STATUSES);
      if (status) filters.status = status;
    }
  }

  return filters;
}

/**
 * Given the current path segments and the parsed filters, return the canonical
 * path. Used to redirect non-canonical URLs to canonical ones.
 */
export function getCanonicalPath(
  type: MediaType,
  filters: MediaFilters
): string {
  return filtersToPath(type, filters);
}

/**
 * Build a human-friendly title/description for SEO from filters.
 */
export function getFiltersDescription(
  type: MediaType,
  filters: MediaFilters
): { title: string; description: string } {
  const typeLabel: Record<MediaType, string> = {
    movie: "Movies",
    tv_show: "TV Shows",
    book: "Books",
    video_game: "Games",
  };

  const sortLabel: Record<SortKey, string> = {
    popular_all: "Most Popular",
    popular_week: "Popular",
    popular_month: "Popular This Month",
    popular_year: "Popular This Year",
    release_newest: "Latest",
    release_oldest: "Oldest",
    rating_high: "Highest Rated",
    rating_low: "Lowest Rated",
    length_long: "Longest",
    length_short: "Shortest",
  };

  const parts: string[] = [];
  parts.push(sortLabel[filters.sort] ?? "Popular");
  if (filters.decade) parts.push(filters.decade);
  if (filters.genre) parts.push(filters.genre);
  parts.push(typeLabel[type]);

  const title = parts.join(" ");
  const description = `Browse ${title.toLowerCase()} on Intertaind. Track and rate what you watch, read, and play.`;

  return { title, description };
}
