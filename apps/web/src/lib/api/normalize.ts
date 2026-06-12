import type { SearchResult } from "@intertaind/types";
import type {
  TMDBMovie,
  TMDBTVShow,
  GoogleBooksVolume,
  IGDBGame,
} from "./types";
import { tmdbImageUrl } from "./tmdb";
import { bookCoverUrl } from "./google-books";
import { igdbImageUrl } from "./igdb";
import type { OLBookSearchDoc } from "./openlibrary";

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
  // ISBN-13 is the canonical book identifier — both OL and Google Books
  // emit it, so it's the bridge for cross-referencing author-page books
  // (OL-sourced) to library books (Google-sourced).
  const isbn13 = info.industryIdentifiers?.find(
    (id) => id.type === "ISBN_13"
  )?.identifier;
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
    external_ids: {
      google_books_id: raw.id,
      ...(isbn13 ? { isbn_13: isbn13 } : {}),
    },
  };
}

/**
 * Normalize an OpenLibrary work into a SearchResult.
 *
 * OL emits work-level data (one record per actual book), so this is the
 * primary book normalizer — `normalizeGoogleBook` is only used as a
 * fallback now for the rare cases where OL hasn't ingested a book yet.
 *
 * `external_ids` carries `openlibrary_work_id` as the primary key plus
 * `isbn_13` as the bridge identifier. Enrichment on the media page
 * later resolves `google_books_id` from ISBN, which gets us GB's richer
 * description / page count / ratings cache without cluttering search.
 *
 * `description` and `page_count` are intentionally null at search time
 * — those come from GB on enrichment. The dropdown only needs title,
 * author, year, cover, which OL already provides.
 */
export function normalizeOLBook(doc: OLBookSearchDoc): SearchResult {
  return {
    media_type: "book",
    title: doc.title + (doc.subtitle ? `: ${doc.subtitle}` : ""),
    description: null,
    cover_image_url: doc.coverUrl,
    backdrop_url: null,
    release_date: doc.firstPublishYear
      ? `${doc.firstPublishYear}-01-01`
      : null,
    metadata: {
      authors: doc.authors,
      page_count: null,
      publisher: null,
      // OL subjects are the closest analogue to GB categories. We keep
      // a small slice for downstream filters; the full subject list
      // lives on the work record after enrichment.
      categories: doc.subjects.slice(0, 5),
    },
    external_ids: {
      openlibrary_work_id: doc.workKey,
      ...(doc.isbn13 ? { isbn_13: doc.isbn13 } : {}),
    },
  };
}

export function normalizeIGDBGame(raw: IGDBGame): SearchResult {
  // IGDB returns one row per role per company — a single company can be
  // credited as both developer and publisher on the same game. Dedupe by
  // company id so the entity-link list doesn't render twice.
  const developers = uniqueByCompanyId(
    raw.involved_companies
      ?.filter((c) => c.developer)
      .map((c) => ({ id: c.company.id, name: c.company.name })) ?? []
  );
  const publishers = uniqueByCompanyId(
    raw.involved_companies
      ?.filter((c) => c.publisher)
      .map((c) => ({ id: c.company.id, name: c.company.name })) ?? []
  );

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
      publishers,
      platforms,
      genres,
    },
    external_ids: { igdb_id: raw.id },
  };
}

function uniqueByCompanyId(
  list: { id: number; name: string }[]
): { id: number; name: string }[] {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}
