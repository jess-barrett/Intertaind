import type { SearchResult } from "@/lib/types";
import type {
  TMDBMovie,
  TMDBTVShow,
  GoogleBooksVolume,
  IGDBGame,
} from "./types";
import { tmdbImageUrl } from "./tmdb";
import { bookCoverUrl } from "./google-books";
import { igdbImageUrl } from "./igdb";

export function normalizeTMDBMovie(raw: TMDBMovie): SearchResult {
  return {
    media_type: "movie",
    title: raw.title,
    description: raw.overview || null,
    cover_image_url: tmdbImageUrl(raw.poster_path),
    backdrop_url: tmdbImageUrl(raw.backdrop_path, "original"),
    release_date: raw.release_date || null,
    metadata: {
      genre_ids: raw.genre_ids,
      vote_average: raw.vote_average,
    },
    external_ids: { tmdb_id: raw.id },
  };
}

export function normalizeTMDBTV(raw: TMDBTVShow): SearchResult {
  return {
    media_type: "tv_show",
    title: raw.name,
    description: raw.overview || null,
    cover_image_url: tmdbImageUrl(raw.poster_path),
    backdrop_url: tmdbImageUrl(raw.backdrop_path, "original"),
    release_date: raw.first_air_date || null,
    metadata: {
      genre_ids: raw.genre_ids,
      vote_average: raw.vote_average,
    },
    external_ids: { tmdb_id: raw.id },
  };
}

/** Pad partial dates ("1996", "1996-03") to full ISO "YYYY-MM-DD". */
function toFullDate(date: string | null | undefined): string | null {
  if (!date) return null;
  if (/^\d{4}$/.test(date)) return `${date}-01-01`;
  if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
  return date;
}

export function normalizeGoogleBook(raw: GoogleBooksVolume): SearchResult {
  const info = raw.volumeInfo;
  return {
    media_type: "book",
    title: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
    description: info.description || null,
    cover_image_url: bookCoverUrl(raw),
    // Google Books has no landscape art equivalent — books get no hero.
    backdrop_url: null,
    release_date: toFullDate(info.publishedDate),
    metadata: {
      authors: info.authors ?? [],
      page_count: info.pageCount ?? null,
      publisher: info.publisher ?? null,
      categories: info.categories ?? [],
    },
    external_ids: { google_books_id: raw.id },
  };
}

export function normalizeIGDBGame(raw: IGDBGame): SearchResult {
  const developers =
    raw.involved_companies
      ?.filter((c) => c.developer)
      .map((c) => c.company.name) ?? [];

  const platforms = raw.platforms?.map((p) => p.name) ?? [];
  const genres = raw.genres?.map((g) => g.name) ?? [];

  // Prefer curated artwork over gameplay screenshots for the backdrop.
  const backdropId =
    raw.artworks?.[0]?.image_id ?? raw.screenshots?.[0]?.image_id ?? null;

  return {
    media_type: "video_game",
    title: raw.name,
    description: raw.summary || null,
    cover_image_url: raw.cover
      ? igdbImageUrl(raw.cover.image_id)
      : null,
    backdrop_url: backdropId ? igdbImageUrl(backdropId, "t_1080p") : null,
    release_date: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).toISOString().split("T")[0]
      : null,
    metadata: {
      developers,
      platforms,
      genres,
    },
    external_ids: { igdb_id: raw.id },
  };
}
