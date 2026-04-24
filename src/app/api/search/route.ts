import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MediaType, SearchResult } from "@/lib/types";
import type { TMDBMovie, TMDBTVShow, GoogleBooksVolume, IGDBGame } from "@/lib/api/types";
import { searchMovies, searchTVShows } from "@/lib/api/tmdb";
import { searchBooks } from "@/lib/api/google-books";
import { searchGames } from "@/lib/api/igdb";
import {
  normalizeTMDBMovie,
  normalizeTMDBTV,
  normalizeGoogleBook,
  normalizeIGDBGame,
} from "@/lib/api/normalize";
import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 20;

/**
 * Lowercase + strip diacritics + flatten ornamental punctuation that
 * users won't type. Lets "wall e" match TMDb's "WALL·E", "pokemon" match
 * "Pokémon", "spider man" match "Spider-Man", etc.
 */
function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Strip combining diacritics (the second half of decomposed chars).
    .replace(/[\u0300-\u036f]/g, "")
    // Middle dots, bullets, interpuncts → space.
    .replace(/[·•∙]/g, " ")
    // Em / en dashes → hyphen so "spider–man" still matches "spider-man".
    .replace(/[—–]/g, "-")
    // Hyphens between words → space so "spider-man" matches "spider man".
    .replace(/-+/g, " ")
    // Smart quotes → straight quotes.
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute a relevance score for a title against a query.
 * Returns 0 if the query doesn't appear in the title at all (filter out).
 */
function relevanceScore(title: string, query: string): number {
  const t = normalizeForSearch(title);
  const q = normalizeForSearch(query);
  if (!q) return 0;

  const tNoArticle = stripLeadingArticle(t);
  const qNoArticle = stripLeadingArticle(q);
  const tMain = tNoArticle.split(":")[0].trim();

  // Exact match (ignoring articles / subtitle after colon)
  if (t === q || tNoArticle === qNoArticle || tMain === qNoArticle) return 1000;

  // startsWith — require a word boundary after the query so "silos" doesn't
  // match "silo" and "silom" doesn't either.
  const startsWithWord = new RegExp(`^${escapeRegex(q)}\\b`, "i");
  const startsWithWordNoArticle = new RegExp(`^${escapeRegex(qNoArticle)}\\b`, "i");
  if (startsWithWord.test(t) || startsWithWordNoArticle.test(tNoArticle)) return 500;

  // Whole-word match anywhere in the title
  const wordBoundary = new RegExp(`\\b${escapeRegex(q)}\\b`, "i");
  if (wordBoundary.test(t)) return 250;

  // Substring match — weak signal. Will only show if item is also popular.
  if (t.includes(q)) return 100;

  return 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function yearFromDate(date: string | undefined): number {
  if (!date) return 0;
  const parsed = parseInt(date.slice(0, 4), 10);
  return isNaN(parsed) ? 0 : parsed;
}

// Recency boost: items from the last decade get a small bump
function recencyBoost(year: number): number {
  const now = new Date().getFullYear();
  if (year >= now - 10) return 10;
  return 0;
}

/** Normalize a book title for dedup — strips subtitle, punctuation, articles. */
function normalizeBookTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "") // strip leading article
    .replace(/:\s*.*$/, "") // drop subtitle after colon
    .replace(/\([^)]*\)/g, "") // drop parentheticals
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip a leading article for comparison purposes. */
function stripLeadingArticle(s: string): string {
  return s.toLowerCase().replace(/^(the|a|an)\s+/, "").trim();
}

/**
 * Score a book edition to pick the best within a dedup group.
 * Signals in order of importance:
 *   1. Ratings count — strongest quality signal when available
 *   2. Google's own ranking (position in returned results)
 *   3. Has a subtitle — usually indicates canonical edition with context
 *   4. Reasonable page count — filters samplers and omnibuses
 *   5. Description length — weak signal, small cap
 */
function bookEditionScore(b: GoogleBooksVolume, position: number): number {
  const info = b.volumeInfo;
  const ratings = info.ratingsCount ?? 0;
  const pageCount = info.pageCount ?? 0;
  const subtitle = info.subtitle ?? "";

  const positionBonus = Math.max(0, 200 - position * 10);

  // Subtitle scoring — short canonical vs long marketing copy
  const subtitleWordCount = subtitle.split(/\s+/).filter(Boolean).length;
  let subtitleBonus = 0;
  if (subtitle) {
    if (subtitleWordCount <= 8) subtitleBonus = 60;
    else if (subtitleWordCount <= 12) subtitleBonus = 10;
    else subtitleBonus = -250;
  }

  // Language — strongly prefer English editions
  const languageBonus = info.language === "en" ? 50 : -150;

  // Stub records (no pages, no ratings) are almost always thin bibliographic
  // entries that serve Google's "image not available" placeholder cover even
  // when imageLinks claims otherwise.
  const stubPenalty = pageCount === 0 && ratings === 0 ? -200 : 0;

  // Strongly prefer editions with a real English blurb over foreign stubs
  // like "Fantasy roman." — when both exist for the same title, the English
  // one should win dedup.
  const description = info.description ?? "";
  let descriptionBonus = 0;
  if (description.length >= 200) {
    descriptionBonus = 100;
  } else if (description.length > 0) {
    const hasEnglishStopword = /\b(the|of|and|is|to|in|a|an|for|with|on|that|this)\b/i.test(
      description
    );
    descriptionBonus = hasEnglishStopword ? 10 : -200;
  }

  return (
    ratings * 10 +
    positionBonus +
    subtitleBonus +
    languageBonus +
    stubPenalty +
    descriptionBonus +
    (pageCount > 100 && pageCount < 3000 ? 5 : 0)
  );
}

/**
 * Detect foreign-language titles when Google Books doesn't set `language`.
 * Checks for common non-English article/preposition words that wouldn't
 * naturally appear in an English book title.
 */
function looksForeign(title: string, subtitle: string): boolean {
  const text = `${title} ${subtitle}`.toLowerCase();
  // Word-boundary match on non-English filler words
  const foreignWords = /\b(la|le|les|el|los|las|der|die|das|il|della|degli|dei|du|des|une|uno|una|della|guerra|dios|dieu|terres|bannies|livre)\b/;
  return foreignWords.test(text);
}

/** Rank, filter, and return top-N scored items. */
function rankRaw<T>(
  items: T[],
  query: string,
  opts: {
    getTitle: (item: T) => string;
    getPopularity: (item: T) => number;
    hasCover: (item: T) => boolean;
    minPopularity?: number;
    /** Popularity required for substring-only matches (relevance = 100) */
    substringPopularityFloor?: number;
    getYear?: (item: T) => number;
  }
): { item: T; score: number }[] {
  const scored = items
    .map((item) => {
      const title = opts.getTitle(item);
      const relevance = relevanceScore(title, query);
      if (relevance === 0) return null;
      if (!opts.hasCover(item)) return null;

      const popularity = opts.getPopularity(item);
      if (opts.minPopularity !== undefined && popularity < opts.minPopularity) return null;

      // Substring-only matches must be popular or they're probably unrelated junk
      const substringFloor = opts.substringPopularityFloor ?? 100;
      if (relevance === 100 && popularity < substringFloor) return null;

      const year = opts.getYear?.(item) ?? 0;
      // Uncapped popularity boost — a hugely popular item should beat an obscure one
      const score = relevance + popularity * 0.1 + recencyBoost(year);
      return { item, score };
    })
    .filter((x): x is { item: T; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}

type ScoredResult = { result: SearchResult; score: number };
type SearchFn = (query: string) => Promise<ScoredResult[]>;

/**
 * Build query variants to send to TMDb. A multi-word query also gets a
 * compacted (no-space) variant so TMDb's tokenizer surfaces titles where
 * a non-word character (`·`, `:`, `&`) joins what users normally type as
 * separate words — e.g. "wall e" → also tries "walle" → matches WALL·E.
 */
function tmdbQueryVariants(q: string): string[] {
  const compact = q.replace(/\s+/g, "");
  if (compact !== q && compact.length >= 3) return [q, compact];
  return [q];
}

const searchers: Record<MediaType, SearchFn> = {
  movie: async (q) => {
    const variants = tmdbQueryVariants(q);
    const responses = await Promise.all(variants.map((v) => searchMovies(v)));
    // Merge unique by TMDb id so the same movie returned by both variants
    // doesn't get double-scored.
    const seen = new Set<number>();
    const merged: TMDBMovie[] = [];
    for (const r of responses) {
      for (const m of r.results) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          merged.push(m);
        }
      }
    }
    const ranked = rankRaw<TMDBMovie>(merged, q, {
      getTitle: (m) => m.title,
      getPopularity: (m) => m.vote_count,
      hasCover: (m) => !!m.poster_path,
      minPopularity: 5,
      substringPopularityFloor: 200, // need real engagement for substring-only
      getYear: (m) => yearFromDate(m.release_date),
    });
    return ranked.map(({ item, score }) => ({ result: normalizeTMDBMovie(item), score }));
  },

  tv_show: async (q) => {
    const variants = tmdbQueryVariants(q);
    const responses = await Promise.all(variants.map((v) => searchTVShows(v)));
    const seen = new Set<number>();
    const merged: TMDBTVShow[] = [];
    for (const r of responses) {
      for (const t of r.results) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
    }
    const ranked = rankRaw<TMDBTVShow>(merged, q, {
      getTitle: (t) => t.name,
      getPopularity: (t) => t.vote_count,
      hasCover: (t) => !!t.poster_path,
      minPopularity: 5,
      substringPopularityFloor: 200,
      getYear: (t) => yearFromDate(t.first_air_date),
    });
    return ranked.map(({ item, score }) => ({ result: normalizeTMDBTV(item), score }));
  },

  book: async (q) => {
    // Parse "Title by Author Name" pattern — author must be 2+ words
    // to avoid false positives like "Stand By Me"
    let titlePart = q;
    let authorPart: string | undefined;
    const byMatch = q.match(/^(.+?)\s+by\s+((?:\S+\s+){1,}\S+)$/i);
    if (byMatch) {
      titlePart = byMatch[1].trim();
      authorPart = byMatch[2].trim();
    }

    // Always use intitle: so Google restricts to title matches.
    // Without it, bare queries like "Malice" get swamped by legal journals
    // and philosophy texts that mention the word in body/description.
    const apiQuery = authorPart
      ? `intitle:"${titlePart}" inauthor:"${authorPart}"`
      : `intitle:"${titlePart}"`;

    // Fetch more results so series entries with query only in subtitle still surface
    const res = await searchBooks(apiQuery, 0, 40);
    const items = res.items ?? [];

    console.log(`\n[BOOK SEARCH] Query: "${q}"`);
    if (authorPart) {
      console.log(`[BOOK SEARCH] Parsed title="${titlePart}", author="${authorPart}"`);
      console.log(`[BOOK SEARCH] API query: ${apiQuery}`);
    }
    console.log(`[BOOK SEARCH] Google Books returned ${items.length} raw items:`);
    items.forEach((b, i) => {
      const info = b.volumeInfo;
      console.log(
        `  ${i + 1}. "${info.title}"${info.subtitle ? ` : "${info.subtitle}"` : ""} ` +
          `| id: ${b.id} ` +
          `| authors: ${JSON.stringify(info.authors)} ` +
          `| ISBN: ${info.industryIdentifiers?.some((id) => id.type === "ISBN_10" || id.type === "ISBN_13") ? "yes" : "NO"} ` +
          `| cover: ${info.imageLinks?.thumbnail ? "yes" : "NO"} ` +
          `| viewability: ${b.accessInfo?.viewability ?? "(missing)"} ` +
          `| pages: ${info.pageCount ?? "-"} ` +
          `| cats: ${JSON.stringify(info.categories ?? [])} ` +
          `| ratings: ${info.ratingsCount ?? 0}`
      );
      if (info.imageLinks?.thumbnail) {
        console.log(`       thumbnail: ${info.imageLinks.thumbnail}`);
      }
    });

    // Pre-filter: quality, editions, box sets, legal docs, etc.
    const filterReasons: Record<string, string> = {};
    const quality = items.filter((b) => {
      const info = b.volumeInfo;
      const label = `"${info.title}"${info.subtitle ? ` : "${info.subtitle}"` : ""}`;

      // Hard-require English — foreign editions clutter results
      if (info.language && info.language !== "en") {
        filterReasons[label] = `language: ${info.language}`;
        return false;
      }

      // Filter mature-rated books — Google Books' own rating covers erotica
      // and explicit content. Keeps NSFW covers out of the feed.
      if (info.maturityRating === "MATURE") {
        filterReasons[label] = "mature rating";
        return false;
      }

      // Low-signal self-published / obscure books: no Google category tags
      // and no ratings. These are the breeding ground for NSFW covers that
      // slip past maturityRating (Google doesn't always tag self-pub books).
      if ((info.categories?.length ?? 0) === 0 && (info.ratingsCount ?? 0) === 0) {
        filterReasons[label] = "no categories and no ratings (low-signal)";
        return false;
      }

      // Google often doesn't tag `language` on foreign editions.
      // Detect common non-English filler words in the title/subtitle.
      if (looksForeign(info.title, info.subtitle ?? "")) {
        filterReasons[label] = `title looks non-English`;
        return false;
      }


      if (!info.imageLinks?.thumbnail) {
        filterReasons[label] = "no cover image";
        return false;
      }

      // Stub bibliographic records have pageCount=0. They serve Google's
      // "image not available" placeholder even though imageLinks claims a
      // thumbnail. Real published books always have a page count.
      if ((info.pageCount ?? 0) === 0) {
        filterReasons[label] = "no page count (stub record)";
        return false;
      }

      if (!info.authors || info.authors.length === 0) {
        filterReasons[label] = "no authors";
        return false;
      }

      // Real published books almost always have an ISBN
      const hasISBN = info.industryIdentifiers?.some(
        (id) => id.type === "ISBN_10" || id.type === "ISBN_13"
      );
      if (!hasISBN) {
        filterReasons[label] = "no ISBN";
        return false;
      }

      // Check title and subtitle separately to preserve colon structure
      const lowerTitle = info.title.toLowerCase();
      const lowerSub = (info.subtitle ?? "").toLowerCase();

      const editionPatterns = [
        /\bcollector'?s?\s+edition\b/,
        /\banniversary\s+edition\b/,
        /\b(limited|deluxe|special|leather[\s-]*bound|illustrated)\s+edition\b/,
        /\b(tenth|10th|20th|25th|50th)\s+.*edition\b/,
        /\bboxed?\s*set\b/,
        // Bundle-specific patterns (bare "trilogy"/"series" matched legit
        // references like "The Farseer Trilogy Book 3" — now we only match
        // when the word pairs with bundle indicators).
        /\b\d+[-\s]?book\s+(bundle|set|collection|omnibus)\b/,
        /\btrilogy\s+(bundle|boxed?\s*set|collection|omnibus|complete)\b/,
        /\b(series|saga)\s+(bundle|boxed?\s*set|collection|omnibus|books?\s+\d+)\b/,
        /\bbooks?\s+\d+\s+(and|&|to|through|-)\s+\d+\b/,
        /\bcomplete\s+(series|set|collection|trilogy|saga)\b/,
        /\bomnibus\b/,
        /\bslipcase\b/,
        /\bebundle\b/,
        /\bdiscounted\b/,
        /\bbundle\b/,
      ];
      const matchedEdition = editionPatterns.find(
        (p) => p.test(lowerTitle) || p.test(lowerSub)
      );
      if (matchedEdition) {
        filterReasons[label] = `edition pattern: ${matchedEdition}`;
        return false;
      }

      // Preview / sampler / excerpt
      const previewPatterns = [
        /\bprologue\b/,
        /\bpreview\b/,
        /\bsampler?\b/,
        /\bexcerpt\b/,
        /\bchapter\s*\d+/,
        /\bfirst\s+\d+\s+chapters?\b/,
      ];
      const matchedPreview = previewPatterns.find(
        (p) => p.test(lowerTitle) || p.test(lowerSub)
      );
      if (matchedPreview) {
        filterReasons[label] = `preview pattern: ${matchedPreview}`;
        return false;
      }

      // Split volume editions (e.g., "Way of Kings Part Two", "Volume 1")
      const splitVolumePatterns = [
        /\bpart\s+(one|two|three|four|five|1|2|3|4|5|i|ii|iii|iv|v)\b/i,
        /\bvolume\s+\d+\b/i,
        /\bvol\.?\s+\d+\b/i,
      ];
      const matchedSplit = splitVolumePatterns.find(
        (p) => p.test(info.title) || p.test(info.subtitle ?? "")
      );
      if (matchedSplit) {
        filterReasons[label] = `split volume: ${matchedSplit}`;
        return false;
      }

      if (/\bset\s*:/i.test(info.title) || /\bset\s*$/i.test(info.title)) {
        filterReasons[label] = "title has 'Set:' or ends in 'Set'";
        return false;
      }

      const commaCountTitle = (info.title.match(/,/g) ?? []).length;
      const commaCountSub = ((info.subtitle ?? "").match(/,/g) ?? []).length;
      if (commaCountTitle >= 2 || commaCountSub >= 2) {
        filterReasons[label] = `${commaCountTitle + commaCountSub} commas`;
        return false;
      }

      // Bundle/omnibus threshold — raised to 2000 because epic fantasy
      // single volumes can legitimately be 1000+ pages (Stormlight Archive)
      if ((info.pageCount ?? 0) > 2000) {
        filterReasons[label] = `page count ${info.pageCount} > 2000`;
        return false;
      }

      const desc = (info.description ?? "").trim().toLowerCase();
      if (
        desc.startsWith("this bundle") ||
        desc.startsWith("this ebundle") ||
        desc.startsWith("this discounted") ||
        desc.startsWith("this collection includes") ||
        desc.startsWith("this set includes")
      ) {
        filterReasons[label] = "description bundle marker";
        return false;
      }

      // Special edition / collector's edition markers in description.
      // These titles are often hidden behind a normal-looking title, but
      // the description gives them away.
      const specialEditionDescStarts = [
        /^this is (?:a |an )?(?:stunning|beautiful|gorgeous|luxe|luxurious|special|collectible|collector'?s?|limited|deluxe|anniversary|exclusive) /,
        /^this (?:stunning|beautiful|gorgeous|luxe|collectible|collector'?s?|limited|deluxe|anniversary|exclusive) (?:edition|special)/,
      ];
      const specialEditionFeaturePhrases = [
        "sprayed edges",
        "foil embossing",
        "foil-stamped",
        "foil stamped",
        "gilded edges",
        "four color end papers",
        "full color end papers",
        "colored end papers",
      ];
      if (
        specialEditionDescStarts.some((p) => p.test(desc)) ||
        specialEditionFeaturePhrases.some((p) => desc.includes(p))
      ) {
        filterReasons[label] = "special edition description";
        return false;
      }

      const cats = info.categories ?? [];
      // BISAC prefixes for non-fiction/textbook categories that shouldn't
      // show up on an entertainment tracker unless explicitly searched
      const nonEntertainmentPrefixes =
        /^(law|legal|court|government document|reference|technology|education|science|mathematics|medical|business & economics|architecture|engineering|agriculture)\b/i;
      const matchedCat = cats.find((c) => nonEntertainmentPrefixes.test(c.trim()));
      if (matchedCat) {
        filterReasons[label] = `non-entertainment category: ${matchedCat}`;
        return false;
      }

      // Academic textbook keywords in title/subtitle
      const textbookPatterns = [
        /\bfundamentals\s+of\b/i,
        /\bprinciples\s+of\b/i,
        /\bintroduction\s+to\b/i,
        /\bhandbook\s+of\b/i,
        /\btextbook\b/i,
        /\btheory\s+and\s+(design|practice|application)\b/i,
        /\bresearch\s+applied\s+to\b/i,
        /\bapplied\s+to\s+practice\b/i,
        /\banalysis\s+and\s+design\b/i,
        /\bdesign\s+and\s+analysis\b/i,
      ];
      const matchedTextbook = textbookPatterns.find(
        (p) => p.test(info.title) || p.test(info.subtitle ?? "")
      );
      if (matchedTextbook) {
        filterReasons[label] = `textbook pattern: ${matchedTextbook}`;
        return false;
      }

      return true;
    });

    console.log(`[BOOK SEARCH] After quality filter: ${quality.length} items`);
    console.log(`[BOOK SEARCH] Filtered out items & reasons:`);
    for (const [label, reason] of Object.entries(filterReasons)) {
      console.log(`  X ${label} → ${reason}`);
    }

    // Deduplicate by normalized title + first author — different authors
    // with similar titles are genuinely different books and should both show.
    // Track each book's original position in Google's results so we can use
    // it as a tiebreaker.
    const positionMap = new Map<GoogleBooksVolume, number>();
    quality.forEach((book, i) => positionMap.set(book, i));

    const byTitle = new Map<string, GoogleBooksVolume>();
    const groups: Record<string, GoogleBooksVolume[]> = {};
    for (const book of quality) {
      const author = (book.volumeInfo.authors?.[0] ?? "").toLowerCase().trim();
      const key = `${normalizeBookTitle(book.volumeInfo.title)}|${author}`;
      (groups[key] ??= []).push(book);
      const existing = byTitle.get(key);
      const bookScore = bookEditionScore(book, positionMap.get(book) ?? 0);
      const existingScore = existing
        ? bookEditionScore(existing, positionMap.get(existing) ?? 0)
        : -1;
      if (!existing || bookScore > existingScore) {
        byTitle.set(key, book);
      }
    }
    const deduped = Array.from(byTitle.values());

    console.log(`[BOOK SEARCH] Dedup groups:`);
    for (const [key, books] of Object.entries(groups)) {
      console.log(`  group "${key}" (${books.length} edition${books.length === 1 ? "" : "s"}):`);
      books.forEach((b) => {
        const pos = positionMap.get(b) ?? 0;
        const chosen = byTitle.get(key) === b ? " [WINNER]" : "";
        console.log(
          `    - "${b.volumeInfo.title}"${b.volumeInfo.subtitle ? ` : "${b.volumeInfo.subtitle}"` : ""} position:${pos} ratings:${b.volumeInfo.ratingsCount ?? 0} pages:${b.volumeInfo.pageCount ?? "-"} score:${bookEditionScore(b, pos).toFixed(1)}${chosen}`
        );
      });
    }

    const ranked = rankRaw<GoogleBooksVolume>(deduped, titlePart, {
      // Match against title AND subtitle — "Book Two of Mistborn" lives in subtitle
      getTitle: (b) =>
        b.volumeInfo.title + (b.volumeInfo.subtitle ? `: ${b.volumeInfo.subtitle}` : ""),
      getPopularity: (b) => b.volumeInfo.ratingsCount ?? 0,
      hasCover: (b) => !!b.volumeInfo.imageLinks?.thumbnail,
      // Books rarely have ratings, so substring-only still needs SOME signal
      // but we can't use ratings. Just use the strict relevance as the gate.
      substringPopularityFloor: 0,
      getYear: (b) => yearFromDate(b.volumeInfo.publishedDate),
    });

    console.log(`[BOOK SEARCH] Final ranked output (${ranked.length} items):`);
    ranked.forEach(({ item: b }, i) => {
      console.log(
        `  ${i + 1}. "${b.volumeInfo.title}"${b.volumeInfo.subtitle ? ` : "${b.volumeInfo.subtitle}"` : ""}`
      );
    });
    console.log(`[BOOK SEARCH] ==================\n`);

    return ranked.map(({ item, score }) => ({ result: normalizeGoogleBook(item), score }));
  },

  video_game: async (q) => {
    const results = await searchGames(q);
    const ranked = rankRaw<IGDBGame>(results, q, {
      getTitle: (g) => g.name,
      getPopularity: (g) => g.rating_count ?? 0,
      hasCover: (g) => !!g.cover?.image_id,
      minPopularity: 1,
      substringPopularityFloor: 30,
      getYear: (g) =>
        g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0,
    });
    return ranked.map(({ item, score }) => ({ result: normalizeIGDBGame(item), score }));
  },
};

/**
 * For any search result whose external_ids match an existing media_items row,
 * override the cover_image_url with the stored one — so search covers match
 * what the user will see on the media page.
 */
async function applyStoredCoverOverrides(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const supabase = await createClient();

  // Group external_ids by key (google_books_id, tmdb_id, igdb_id)
  const idsByKey: Record<string, (string | number)[]> = {};
  for (const r of results) {
    for (const [key, value] of Object.entries(r.external_ids)) {
      (idsByKey[key] ??= []).push(value);
    }
  }

  // Build lookup: `${key}:${value}` → cover_image_url
  const coverLookup = new Map<string, string>();

  await Promise.all(
    Object.entries(idsByKey).map(async ([key, values]) => {
      if (values.length === 0) return;
      // JSONB arrow operator to extract and filter by key value
      const { data } = await supabase
        .from("media_items")
        .select("cover_image_url, external_ids")
        .in(
          `external_ids->>${key}`,
          values.map(String)
        );

      for (const row of (data as { cover_image_url: string | null; external_ids: Record<string, unknown> }[]) ?? []) {
        const id = row.external_ids?.[key];
        if (id !== undefined && row.cover_image_url) {
          coverLookup.set(`${key}:${id}`, row.cover_image_url);
        }
      }
    })
  );

  // Override covers where we have a match
  return results.map((r) => {
    for (const [key, value] of Object.entries(r.external_ids)) {
      const match = coverLookup.get(`${key}:${value}`);
      if (match) return { ...r, cover_image_url: match };
    }
    return r;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim();
  const type = searchParams.get("type") as MediaType | "all" | null;

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    let results: SearchResult[];

    if (type && type !== "all" && type in searchers) {
      const scored = await searchers[type as MediaType](query);
      results = scored.map((s) => s.result);
    } else {
      // Search all types in parallel, then merge and sort GLOBALLY by score.
      // This interleaves types based on relevance + popularity instead of
      // grouping by media type.
      const settled = await Promise.allSettled(
        Object.values(searchers).map((fn) => fn(query))
      );
      const all: ScoredResult[] = settled.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );
      all.sort((a, b) => b.score - a.score);
      results = all.map((s) => s.result);
    }

    // If any result is already in the DB, use the stored cover
    // (so search covers match the media page)
    results = await applyStoredCoverOverrides(results);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
