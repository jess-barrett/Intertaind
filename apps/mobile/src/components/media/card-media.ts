import { tmdbImageUrl, type MergedCredit } from "@intertaind/media";
import type { MediaType, SearchResult } from "@intertaind/types";
import type { HomeMediaItem } from "@/queries/home";
import type { MediaUpsertInput } from "@/queries/media";

/**
 * Normalized, source-agnostic descriptor a MediaCard/CardActions renders.
 * Produced by an adapter per source (filmography credit, catalog row). Carries
 * a RESOLVED poster URL + display year so the card never branches on source.
 */
export type CardMedia = {
  /** Catalog row id, or null for an uncataloged filmography credit. */
  mediaItemId: string | null;
  /** Domain media type (all four) — drives config/icon/tracking. */
  mediaType: MediaType;
  title: string;
  /** Fully-resolved cover URL (tmdb-built or stored), or null → glyph. */
  posterUrl: string | null;
  /** Display year string (e.g. "2019") or null. */
  year: string | null;
  /**
   * The enrich payload for an UNCATALOGED source (a filmography credit — a
   * `{mediaType,tmdbId}` re-enrich — or a search result — a `{searchResult}`
   * upsert), passed straight to `useMediaUpsertMutation` so CardActions /
   * MediaCard can get-or-create the catalog row on first tap/action. Absent
   * for catalog-row sources (they always have a mediaItemId, never enrich).
   */
  upsert?: MediaUpsertInput;
};

/** First 4 digits of an ISO date (mirrors media-search-picker's `yearFrom`). */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

/** Adapt a filmography MergedCredit. Poster from tmdb poster_path (w342). */
export function cardMediaFromCredit(credit: MergedCredit): CardMedia {
  return {
    mediaItemId: credit.media_item_id,
    mediaType: credit.media_type === "tv" ? "tv_show" : "movie",
    title: credit.title,
    posterUrl: tmdbImageUrl(credit.poster_path, "w342"),
    year: credit.year != null ? String(credit.year) : null,
    upsert: { mediaType: credit.media_type, tmdbId: credit.id },
  };
}

/** Adapt a catalog media_items row (home rails / shelves). Always cataloged. */
export function cardMediaFromHomeItem(item: HomeMediaItem): CardMedia {
  return {
    mediaItemId: item.id,
    // Home items are the 4 domain types — the DB enum's extra `board_game`
    // never reaches a home rail, so this cast to MediaType is sound.
    mediaType: item.media_type as MediaType,
    title: item.title,
    posterUrl: item.cover_image_url,
    year: yearFrom(item.release_date),
    // No `upsert`: catalog rows always have a mediaItemId, never need enriching.
  };
}

/**
 * Adapt a cross-source `SearchResult` (the search screen / recommend picker).
 * Uncataloged by nature — carries the `{searchResult}` upsert payload so a tap
 * (or a quick-action) get-or-creates the catalog row via `media-upsert`. The
 * cover URL is already absolute (the search normalizer builds full URLs).
 */
export function cardMediaFromSearchResult(result: SearchResult): CardMedia {
  return {
    mediaItemId: null,
    mediaType: result.media_type,
    title: result.title,
    posterUrl: result.cover_image_url,
    year: yearFrom(result.release_date),
    upsert: { searchResult: result },
  };
}
