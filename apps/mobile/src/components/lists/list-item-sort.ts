/**
 * Pure filter + sort helpers for the list-detail items grid — the RN port of
 * web's `ListItemsGrid` logic (apps/web/src/components/lists/list-items-grid.tsx).
 * Kept as a standalone module (no JSX) so the screen component stays focused on
 * layout. All client-side: filtering by decade/genre and sorting are
 * derive-from-loaded-items operations, no server round-trips.
 *
 * Same option set + comparators as web (list order, added/release/title,
 * popularity/avg-rating, your-rating, length, shuffle), so the two platforms
 * order a list identically.
 */
import type { ViewerTrackingState } from "@/queries/home";
import type { ListDetailItem, ListItemMedia } from "@/queries/lists";

export interface SortOption {
  key: string;
  label: string;
  /** Skip when the viewer isn't signed in (your-rating sorts). */
  requiresUser?: boolean;
}

/** The sort menu — mirrors web's SORT_OPTIONS order exactly. */
export const SORT_OPTIONS: SortOption[] = [
  { key: "position_asc", label: "List order" },
  { key: "position_desc", label: "Reverse list order" },
  { key: "added_desc", label: "Recently added" },
  { key: "added_asc", label: "Earliest added" },
  { key: "release_desc", label: "Release date — newest" },
  { key: "release_asc", label: "Release date — oldest" },
  { key: "title_asc", label: "Title A–Z" },
  { key: "title_desc", label: "Title Z–A" },
  { key: "popularity_desc", label: "Most popular" },
  { key: "avg_rating_desc", label: "Average rating — highest" },
  { key: "avg_rating_asc", label: "Average rating — lowest" },
  { key: "your_rating_desc", label: "Your rating — highest", requiresUser: true },
  { key: "your_rating_asc", label: "Your rating — lowest", requiresUser: true },
  { key: "length_desc", label: "Length — longest" },
  { key: "length_asc", label: "Length — shortest" },
  { key: "shuffle", label: "Shuffle" },
];

function parseYear(date: string | null): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function decadeFor(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/** The decade label for an item ("2010s"), or null when it has no year. */
export function itemDecade(item: ListDetailItem): string | null {
  const year = parseYear(item.media?.release_date ?? null);
  return year === null ? null : decadeFor(year);
}

/**
 * Genres from item metadata. Movies/TV/games use `metadata.genres`; books use
 * `metadata.categories`. Empty when nothing's there.
 */
export function itemGenres(media: ListItemMedia | null): string[] {
  const meta = (media?.metadata as Record<string, unknown> | null) ?? {};
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
 * Per-type "length" for the Length sort: movie runtime (min), book page count,
 * TV episode count; games have none (sort last). Not comparable across types,
 * but meaningful within a single-type list (the typical case).
 */
function lengthValue(media: ListItemMedia | null): number | null {
  const meta = (media?.metadata as Record<string, unknown> | null) ?? {};
  switch (media?.media_type) {
    case "movie":
      return typeof meta.runtime === "number" ? meta.runtime : null;
    case "book":
      return typeof meta.page_count === "number" ? meta.page_count : null;
    case "tv_show":
      return typeof meta.number_of_episodes === "number"
        ? meta.number_of_episodes
        : null;
    default:
      return null;
  }
}

/** Available decades across the item set, newest first. */
export function decadeOptionsFor(items: ListDetailItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    const d = itemDecade(it);
    if (d) set.add(d);
  }
  return Array.from(set).sort((a, b) => parseInt(b) - parseInt(a));
}

/** Available genres across the item set, alphabetical. */
export function genreOptionsFor(items: ListDetailItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) for (const g of itemGenres(it.media)) set.add(g);
  return Array.from(set).sort();
}

/** Filter by decade + genre (empty string = no filter). */
export function filterItems(
  items: ListDetailItem[],
  decade: string,
  genre: string,
): ListDetailItem[] {
  return items.filter((it) => {
    if (decade && itemDecade(it) !== decade) return false;
    if (genre && !itemGenres(it.media).includes(genre)) return false;
    return true;
  });
}

/** nulls-last numeric compare, so missing values never pollute the top. */
function nullableCompare(
  a: number | null,
  b: number | null,
  ascending: boolean,
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return ascending ? a - b : b - a;
}

/** Deterministic seeded Fisher-Yates (stable per seed, reshuffles on new seed). */
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

/** Sort a filtered item set by one of {@link SORT_OPTIONS} (web parity). */
export function sortItems(
  list: ListDetailItem[],
  sort: string,
  trackingMap: Map<string, ViewerTrackingState> | undefined,
  shuffleSeed: number,
): ListDetailItem[] {
  if (sort === "shuffle") return shuffleArray(list, shuffleSeed);
  const yourRating = (it: ListDetailItem): number | null =>
    (it.media ? trackingMap?.get(it.media.id)?.rating : null) ?? null;

  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "position_asc":
        return a.position - b.position;
      case "position_desc":
        return b.position - a.position;
      case "added_desc":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      case "added_asc":
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      case "release_desc":
        return (b.media?.release_date ?? "").localeCompare(
          a.media?.release_date ?? "",
        );
      case "release_asc":
        return (a.media?.release_date ?? "").localeCompare(
          b.media?.release_date ?? "",
        );
      case "title_asc":
        return (a.media?.title ?? "").localeCompare(b.media?.title ?? "");
      case "title_desc":
        return (b.media?.title ?? "").localeCompare(a.media?.title ?? "");
      case "popularity_desc":
        return nullableCompare(
          a.media?.tracking_count ?? 0,
          b.media?.tracking_count ?? 0,
          false,
        );
      case "avg_rating_desc":
        return nullableCompare(
          a.media?.avg_rating ?? null,
          b.media?.avg_rating ?? null,
          false,
        );
      case "avg_rating_asc":
        return nullableCompare(
          a.media?.avg_rating ?? null,
          b.media?.avg_rating ?? null,
          true,
        );
      case "your_rating_desc":
        return nullableCompare(yourRating(a), yourRating(b), false);
      case "your_rating_asc":
        return nullableCompare(yourRating(a), yourRating(b), true);
      case "length_desc":
        return nullableCompare(lengthValue(a.media), lengthValue(b.media), false);
      case "length_asc":
        return nullableCompare(lengthValue(a.media), lengthValue(b.media), true);
      default:
        return 0;
    }
  });
  return sorted;
}
