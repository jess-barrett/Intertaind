// Cross-source media search — the Deno port of web's `/api/search` pipeline.
//
// WHY THIS EXISTS (see media-search/index.ts header for the full story)
// This module holds the search source clients + normalization + ranking that
// web keeps in `apps/web/src/lib/api/*` + `apps/web/src/app/api/search/route.ts`
// + `packages/media/src/normalize.ts`. Deno Edge Functions can't import the pnpm
// workspace packages, so the relevant pieces are PORTED here. The public
// `SearchResult` shape produced by the `normalize*` functions is kept in exact
// lockstep with `packages/types` `SearchResult` and web's normalizers — the
// `external_ids` keys (tmdb_id / google_books_id / isbn_13 / openlibrary_work_id
// / igdb_id) MUST match what `media-upsert` dedups on (`external_ids->>tmdb_id`)
// and what mobile reads.
//
// FAITHFUL-PORT SCOPE (what differs from web — read before "fixing" a diff):
//   * Movie / TV / Games / OpenLibrary book search + normalization are ported
//     verbatim (same field mappings, ranking weights, filters).
//   * The book path ports web's OL-primary + Google-Books-fallback structure and
//     its quality filters / dedup faithfully, MINUS three web-only pieces that
//     depend on infrastructure this function deliberately doesn't have:
//       1. The reissue → OpenLibrary canonical-cover swap (web calls OL a second
//          time per GB reissue winner). Dropped: it's a best-effort cosmetic
//          upgrade, adds N extra network calls, and the un-swapped GB record is
//          already a correct SearchResult. Flagged in the README.
//       2. `applyStoredCoverOverrides` — web re-reads `media_items` to swap in a
//          stored cover. media-search intentionally has NO Supabase client (it
//          only holds external-API secrets + CORS), so this is omitted; the
//          caller (or a later pass) can apply stored covers if desired.
//       3. Verbose `console.log` search tracing — dropped as debug noise.
//   * `type: "all"` fans out to movies + tv + books + games. Each source is
//     wrapped so a thrown error OR a missing secret yields `[]` (graceful
//     degradation) — the whole search never 500s because e.g. IGDB isn't
//     configured yet.

// SearchResult — duplicated from packages/types/src/index.ts because Deno Edge
// Functions don't share the pnpm workspace's TS paths (same reason the `person`
// / `media-upsert` functions inline their TMDB types). This MUST stay in exact
// lockstep with the exported `SearchResult`: the mobile picker consumes it and
// `media-upsert` dedups on `external_ids->>tmdb_id`.
type MediaType = "book" | "movie" | "tv_show" | "video_game";

export interface SearchResult {
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  backdrop_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// Raw API response shapes (mirror packages/media/src/types.ts). Only the fields
// the search + normalization touch are declared. Duplicated because Deno Edge
// Functions don't share the workspace TS paths.
// ---------------------------------------------------------------------------

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

interface TMDBSearchResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
      extraLarge?: string;
    };
    averageRating?: number;
    ratingsCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    maturityRating?: "MATURE" | "NOT_MATURE";
  };
  accessInfo?: {
    viewability?: "NO_PAGES" | "PARTIAL" | "ALL_PAGES" | "UNKNOWN";
  };
}

interface GoogleBooksSearchResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

interface IGDBGame {
  id: number;
  name: string;
  summary?: string;
  cover?: { image_id: string };
  artworks?: { image_id: string }[];
  screenshots?: { image_id: string }[];
  first_release_date?: number; // Unix timestamp (seconds)
  genres?: { name: string }[];
  platforms?: { name: string }[];
  involved_companies?: {
    company: { id: number; name: string };
    developer: boolean;
    publisher: boolean;
  }[];
  rating?: number;
  rating_count?: number;
}

// OpenLibrary's normalized search doc (matches @intertaind/media OLBookSearchDoc
// AFTER searchOLBooks maps the raw `/search.json` shape into it).
interface OLBookSearchDoc {
  workKey: string;
  title: string;
  subtitle?: string;
  authors: string[];
  firstPublishYear: number | null;
  coverUrl: string | null;
  coverEditionKey: string | null;
  editionCount: number;
  ratingsCount: number;
  ratingsAverage: number | null;
  wantToReadCount: number;
  isbn13: string | null;
  subjects: string[];
  languages: string[];
}

// Raw `/search.json` doc, before mapping into OLBookSearchDoc.
interface OLBookSearchRawDoc {
  key: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  cover_edition_key?: string;
  edition_count?: number;
  ratings_count?: number;
  ratings_average?: number;
  want_to_read_count?: number;
  already_read_count?: number;
  isbn?: string[];
  subject?: string[];
  language?: string[];
}

// ---------------------------------------------------------------------------
// Image URL helpers — ported from packages/media/src/images.ts.
// ---------------------------------------------------------------------------

export function tmdbImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function bookCoverUrl(volume: GoogleBooksVolume): string | null {
  const links = volume.volumeInfo.imageLinks;
  if (!links) return null;
  const url =
    links.extraLarge ??
    links.large ??
    links.medium ??
    links.small ??
    links.thumbnail ??
    links.smallThumbnail;
  if (!url) return null;
  const viewability = volume.accessInfo?.viewability;
  const canUpgradeZoom = viewability === "PARTIAL" || viewability === "ALL_PAGES";
  let fixed = url
    .replace(/^http:\/\//, "https://")
    .replace(/&?edge=curl/g, "");
  if (canUpgradeZoom) {
    fixed = fixed.replace(/zoom=\d/, "zoom=3");
  }
  return fixed;
}

function igdbImageUrl(imageId: string, size = "t_cover_big"): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

const OL_COVERS_URL = "https://covers.openlibrary.org";

function olCoverUrl(coverId: number, size: "S" | "M" | "L" = "L"): string {
  return `${OL_COVERS_URL}/b/id/${coverId}-${size}.jpg`;
}

// ---------------------------------------------------------------------------
// Normalization — ported from packages/media/src/normalize.ts. Field mappings
// and `external_ids` keys are byte-for-byte matches so results are
// indistinguishable from web's + interoperable with media-upsert's dedup.
// ---------------------------------------------------------------------------

function normalizeTMDBMovie(raw: TMDBMovie): SearchResult {
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

function normalizeTMDBTV(raw: TMDBTVShow): SearchResult {
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

function normalizeGoogleBook(raw: GoogleBooksVolume): SearchResult {
  const info = raw.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find(
    (id) => id.type === "ISBN_13",
  )?.identifier;
  return {
    media_type: "book",
    title: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
    description: info.description || null,
    cover_image_url: bookCoverUrl(raw),
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

function normalizeOLBook(doc: OLBookSearchDoc): SearchResult {
  return {
    media_type: "book",
    title: doc.title + (doc.subtitle ? `: ${doc.subtitle}` : ""),
    description: null,
    cover_image_url: doc.coverUrl,
    backdrop_url: null,
    release_date: doc.firstPublishYear ? `${doc.firstPublishYear}-01-01` : null,
    metadata: {
      authors: doc.authors,
      page_count: null,
      publisher: null,
      categories: doc.subjects.slice(0, 5),
    },
    external_ids: {
      openlibrary_work_id: doc.workKey,
      ...(doc.isbn13 ? { isbn_13: doc.isbn13 } : {}),
    },
  };
}

function normalizeIGDBGame(raw: IGDBGame): SearchResult {
  const developers = uniqueByCompanyId(
    raw.involved_companies
      ?.filter((c) => c.developer)
      .map((c) => ({ id: c.company.id, name: c.company.name })) ?? [],
  );
  const publishers = uniqueByCompanyId(
    raw.involved_companies
      ?.filter((c) => c.publisher)
      .map((c) => ({ id: c.company.id, name: c.company.name })) ?? [],
  );
  const platforms = raw.platforms?.map((p) => p.name) ?? [];
  const genres = raw.genres?.map((g) => g.name) ?? [];
  const backdropId =
    raw.artworks?.[0]?.image_id ?? raw.screenshots?.[0]?.image_id ?? null;

  return {
    media_type: "video_game",
    title: raw.name,
    description: raw.summary || null,
    cover_image_url: raw.cover ? igdbImageUrl(raw.cover.image_id) : null,
    backdrop_url: backdropId ? igdbImageUrl(backdropId, "t_1080p") : null,
    release_date: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).toISOString().split("T")[0]
      : null,
    metadata: { developers, publishers, platforms, genres },
    external_ids: { igdb_id: raw.id },
  };
}

function uniqueByCompanyId(
  list: { id: number; name: string }[],
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

// ---------------------------------------------------------------------------
// Ranking + relevance — ported from route.ts. Same scoring weights so search
// ordering matches web.
// ---------------------------------------------------------------------------

const MAX_RESULTS = 20;

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Strip combining diacritics (the second half of decomposed chars).
    .replace(/[̀-ͯ]/g, "")
    .replace(/[·•∙]/g, " ")
    .replace(/[—–]/g, "-")
    .replace(/-+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingArticle(s: string): string {
  return s.toLowerCase().replace(/^(the|a|an)\s+/, "").trim();
}

function relevanceScore(title: string, query: string): number {
  const t = normalizeForSearch(title);
  const q = normalizeForSearch(query);
  if (!q) return 0;

  const tNoArticle = stripLeadingArticle(t);
  const qNoArticle = stripLeadingArticle(q);
  const tMain = tNoArticle.split(":")[0].trim();

  if (t === q || tNoArticle === qNoArticle || tMain === qNoArticle) return 1000;

  const startsWithWord = new RegExp(`^${escapeRegex(q)}\\b`, "i");
  const startsWithWordNoArticle = new RegExp(
    `^${escapeRegex(qNoArticle)}\\b`,
    "i",
  );
  if (startsWithWord.test(t) || startsWithWordNoArticle.test(tNoArticle)) {
    return 500;
  }

  const wordBoundary = new RegExp(`\\b${escapeRegex(q)}\\b`, "i");
  if (wordBoundary.test(t)) return 250;

  if (t.includes(q)) return 100;

  return 0;
}

function yearFromDate(date: string | undefined): number {
  if (!date) return 0;
  const parsed = parseInt(date.slice(0, 4), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function recencyBoost(year: number): number {
  const now = new Date().getFullYear();
  if (year >= now - 10) return 10;
  return 0;
}

interface RankOpts<T> {
  getTitle: (item: T) => string;
  getPopularity: (item: T) => number;
  hasCover: (item: T) => boolean;
  minPopularity?: number;
  substringPopularityFloor?: number;
  getYear?: (item: T) => number;
}

function rankRaw<T>(
  items: T[],
  query: string,
  opts: RankOpts<T>,
): { item: T; score: number }[] {
  const scored = items
    .map((item) => {
      const title = opts.getTitle(item);
      const relevance = relevanceScore(title, query);
      if (relevance === 0) return null;
      if (!opts.hasCover(item)) return null;

      const popularity = opts.getPopularity(item);
      if (opts.minPopularity !== undefined && popularity < opts.minPopularity) {
        return null;
      }

      const substringFloor = opts.substringPopularityFloor ?? 100;
      if (relevance === 100 && popularity < substringFloor) return null;

      const year = opts.getYear?.(item) ?? 0;
      const score = relevance + popularity * 0.1 + recencyBoost(year);
      return { item, score };
    })
    .filter((x): x is { item: T; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Book helpers — ported from route.ts + google-books.ts (the pieces the book
// path actually uses). See the FAITHFUL-PORT note at the top for what's dropped.
// ---------------------------------------------------------------------------

function normalizeBookTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/:\s*.*$/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksForeign(title: string, subtitle: string): boolean {
  const text = `${title} ${subtitle}`.toLowerCase();
  const foreignWords =
    /\b(la|le|les|el|los|las|der|die|das|il|della|degli|dei|du|des|une|uno|una|guerra|dios|dieu|terres|bannies|livre)\b/;
  return foreignWords.test(text);
}

// UK-edition detection (ported from google-books.ts) — used by bookEditionScore.
const UK_ISBN_PREFIXES = [
  "978074", "9780340", "9780571", "9780575", "9780747", "9780753",
  "9781407", "9781408", "9781409", "9781447", "9781473", "9781529",
  "9781780", "9781784", "9781785", "9781787",
];

function looksLikeUKEditionISBN(isbn: string | null | undefined): boolean {
  if (!isbn) return false;
  const cleaned = isbn.replace(/[^\d]/g, "");
  return UK_ISBN_PREFIXES.some((p) => cleaned.startsWith(p));
}

const UK_PUBLISHER_KEYWORDS = [
  "hachette uk", "gollancz", "orion publishing", "hodder", "pan macmillan",
  "tor uk", "headline", "quercus", "bloomsbury",
];

function looksLikeUKEdition(v: GoogleBooksVolume): boolean {
  const info = v.volumeInfo;
  const pub = (info.publisher ?? "").toLowerCase();
  if (UK_PUBLISHER_KEYWORDS.some((k) => pub.includes(k))) return true;
  if (pub.endsWith(" uk")) return true;
  const isbn13 = info.industryIdentifiers?.find(
    (id) => id.type === "ISBN_13",
  )?.identifier;
  return looksLikeUKEditionISBN(isbn13);
}

function bookEditionScore(b: GoogleBooksVolume, position: number): number {
  const info = b.volumeInfo;
  const ratings = info.ratingsCount ?? 0;
  const pageCount = info.pageCount ?? 0;
  const subtitle = info.subtitle ?? "";

  const positionBonus = Math.max(0, 200 - position * 10);

  const subtitleWordCount = subtitle.split(/\s+/).filter(Boolean).length;
  let subtitleBonus = 0;
  if (subtitle) {
    if (subtitleWordCount <= 8) subtitleBonus = 60;
    else if (subtitleWordCount <= 12) subtitleBonus = 10;
    else subtitleBonus = -250;
  }

  const languageBonus = info.language === "en" ? 50 : -150;
  const stubPenalty = pageCount === 0 && ratings === 0 ? -200 : 0;

  const description = info.description ?? "";
  let descriptionBonus = 0;
  if (description.length >= 200) {
    descriptionBonus = 100;
  } else if (description.length > 0) {
    const hasEnglishStopword =
      /\b(the|of|and|is|to|in|a|an|for|with|on|that|this)\b/i.test(description);
    descriptionBonus = hasEnglishStopword ? 10 : -200;
  }

  const ukPenalty = looksLikeUKEdition(b) ? -150 : 0;

  return (
    ratings * 10 +
    positionBonus +
    subtitleBonus +
    languageBonus +
    stubPenalty +
    descriptionBonus +
    ukPenalty +
    (pageCount > 100 && pageCount < 3000 ? 5 : 0)
  );
}

// ---------------------------------------------------------------------------
// TMDB source client (ported from tmdb.ts — search only, no Next `fetch` cache).
// ---------------------------------------------------------------------------

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function tmdbHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function searchMovies(
  query: string,
  key: string,
): Promise<TMDBSearchResponse<TMDBMovie>> {
  const url =
    `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}` +
    `&page=1&include_adult=false`;
  const res = await fetch(url, { headers: tmdbHeaders(key) });
  if (!res.ok) throw new Error(`TMDB search movies failed: ${res.status}`);
  return res.json();
}

async function searchTVShows(
  query: string,
  key: string,
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const url =
    `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(query)}` +
    `&page=1&include_adult=false`;
  const res = await fetch(url, { headers: tmdbHeaders(key) });
  if (!res.ok) throw new Error(`TMDB search TV failed: ${res.status}`);
  return res.json();
}

// A multi-word query also gets a compacted (no-space) variant so TMDb's
// tokenizer surfaces titles joined by a non-word char ("wall e" → "walle").
function tmdbQueryVariants(q: string): string[] {
  const compact = q.replace(/\s+/g, "");
  if (compact !== q && compact.length >= 3) return [q, compact];
  return [q];
}

// ---------------------------------------------------------------------------
// Google Books source client (ported from google-books.ts — search only).
// Web reads GOOGLE_BOOKS_API_KEY but sends "" when absent; Google Books allows
// keyless (rate-limited) requests, so a missing key is NOT fatal here.
// ---------------------------------------------------------------------------

const GBOOKS_BASE_URL = "https://www.googleapis.com/books/v1/volumes";

async function searchBooks(
  query: string,
  apiKey: string,
  startIndex = 0,
  maxResults = 20,
): Promise<GoogleBooksSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    startIndex: String(startIndex),
    maxResults: String(maxResults),
    printType: "books",
  });
  // Only append the key when present — Google Books permits keyless requests.
  if (apiKey) params.set("key", apiKey);
  const res = await fetch(`${GBOOKS_BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// OpenLibrary source client (ported from openlibrary.ts — keyless).
// ---------------------------------------------------------------------------

const OL_BASE_URL = "https://openlibrary.org";

async function searchOLBooks(options: {
  q?: string;
  title?: string;
  author?: string;
  limit?: number;
}): Promise<OLBookSearchDoc[]> {
  const fields =
    "key,title,subtitle,author_name,first_publish_year,cover_i,cover_edition_key," +
    "edition_count,ratings_count,ratings_average,want_to_read_count,already_read_count," +
    "isbn,subject,language";
  const params = new URLSearchParams();
  if (options.title) params.set("title", options.title);
  if (options.author) params.set("author", options.author);
  if (options.q) params.set("q", options.q);
  params.set("limit", String(options.limit ?? 30));
  params.set("fields", fields);

  const url = `${OL_BASE_URL}/search.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenLibrary search failed: ${res.status}`);
  const data = (await res.json()) as { docs?: OLBookSearchRawDoc[] };
  const docs = data.docs ?? [];

  return docs
    .map<OLBookSearchDoc | null>((d) => {
      if (!d.title) return null;
      const isbn13 =
        d.isbn?.find((s) => s.replace(/-/g, "").length === 13) ?? null;
      const coverUrl = d.cover_i
        ? olCoverUrl(d.cover_i, "L")
        : d.cover_edition_key
          ? `${OL_COVERS_URL}/b/olid/${d.cover_edition_key}-L.jpg`
          : null;
      return {
        workKey: d.key.replace(/^\/works\//, ""),
        title: d.title,
        subtitle: d.subtitle,
        authors: d.author_name ?? [],
        firstPublishYear: d.first_publish_year ?? null,
        coverUrl,
        coverEditionKey: d.cover_edition_key ?? null,
        editionCount: d.edition_count ?? 0,
        ratingsCount: d.ratings_count ?? 0,
        ratingsAverage: d.ratings_average ?? null,
        wantToReadCount: d.want_to_read_count ?? 0,
        isbn13,
        subjects: d.subject ?? [],
        languages: d.language ?? [],
      };
    })
    .filter((d): d is OLBookSearchDoc => d !== null);
}

// ---------------------------------------------------------------------------
// IGDB source client + Twitch OAuth (ported from igdb.ts). The token is cached
// in a module-level variable and refetched when expired — best-effort reuse
// across warm invocations of the same isolate.
// ---------------------------------------------------------------------------

const IGDB_API_URL = "https://api.igdb.com/v4";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getIGDBToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch OAuth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    // Refresh 60s early so an in-flight request can't use a just-expired token.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

const GAME_FIELDS =
  "name,summary,cover.image_id,artworks.image_id,screenshots.image_id," +
  "first_release_date,genres.name,platforms.name," +
  "involved_companies.company.id,involved_companies.company.name," +
  "involved_companies.developer,involved_companies.publisher,rating,rating_count";

async function searchGames(
  query: string,
  clientId: string,
  clientSecret: string,
  limit = 20,
): Promise<IGDBGame[]> {
  const token = await getIGDBToken(clientId, clientSecret);
  // Escape embedded quotes so a query like `he said "run"` can't break the
  // IGDB query DSL (web passes the raw query; we harden slightly).
  const safeQuery = query.replace(/"/g, '\\"');
  const body = `search "${safeQuery}"; fields ${GAME_FIELDS}; limit ${limit};`;
  const res = await fetch(`${IGDB_API_URL}/games`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB games failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Per-source scored searchers. Each returns `[]` on any failure OR when its
// secret is missing — the caller wraps them in Promise.allSettled but the
// missing-secret short-circuit also keeps `type=book|game` single-source
// requests from surfacing a 500 when unconfigured.
// ---------------------------------------------------------------------------

interface ScoredResult {
  result: SearchResult;
  score: number;
}

export interface SearchSecrets {
  tmdbKey?: string;
  googleBooksKey?: string; // optional — Google Books allows keyless requests
  twitchClientId?: string;
  twitchClientSecret?: string;
}

async function searchMovieResults(
  q: string,
  secrets: SearchSecrets,
): Promise<ScoredResult[]> {
  if (!secrets.tmdbKey) return [];
  const variants = tmdbQueryVariants(q);
  const responses = await Promise.all(
    variants.map((v) => searchMovies(v, secrets.tmdbKey!)),
  );
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
    substringPopularityFloor: 200,
    getYear: (m) => yearFromDate(m.release_date),
  });
  return ranked.map(({ item, score }) => ({
    result: normalizeTMDBMovie(item),
    score,
  }));
}

async function searchTVResults(
  q: string,
  secrets: SearchSecrets,
): Promise<ScoredResult[]> {
  if (!secrets.tmdbKey) return [];
  const variants = tmdbQueryVariants(q);
  const responses = await Promise.all(
    variants.map((v) => searchTVShows(v, secrets.tmdbKey!)),
  );
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
  return ranked.map(({ item, score }) => ({
    result: normalizeTMDBTV(item),
    score,
  }));
}

// Book search — OL-primary with a Google Books fallback, ported from route.ts's
// `book` searcher (minus debug logging, the reissue canonical-swap, and the
// stub-rescue GB re-fetch — see the FAITHFUL-PORT note at the top). OpenLibrary
// is keyless; Google Books is keyless-capable, so this source never needs a
// secret and only returns `[]` on a network/parse error (via the caller's
// Promise.allSettled) or when both sources have no quality hits.
async function searchBookResults(
  q: string,
  secrets: SearchSecrets,
): Promise<ScoredResult[]> {
  // Parse "Title by Author Name" (author must be 2+ words to avoid false
  // positives like "Stand By Me").
  let titlePart = q;
  let authorPart: string | undefined;
  const byMatch = q.match(/^(.+?)\s+by\s+((?:\S+\s+){1,}\S+)$/i);
  if (byMatch) {
    titlePart = byMatch[1].trim();
    authorPart = byMatch[2].trim();
  }

  // ---- OpenLibrary primary (work-centric) ----
  const olDocs = await searchOLBooks(
    authorPart
      ? { title: titlePart, author: authorPart, limit: 30 }
      : { title: q, limit: 30 },
  );

  // Collapse OL cataloging duplicates by (normalized_title, first author).
  const olDedupKey = (d: OLBookSearchDoc): string => {
    const title = d.title
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/^the\s+/i, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const author = (d.authors[0] ?? "").toLowerCase().trim();
    return `${title}|${author}`;
  };
  const olDedupScore = (d: OLBookSearchDoc): number =>
    (d.coverUrl ? 100_000 : 0) +
    d.ratingsCount * 100 +
    d.wantToReadCount * 10 +
    d.editionCount * 50 +
    (d.firstPublishYear ? Math.max(0, 3000 - d.firstPublishYear) * 0.1 : 0);
  const olWinners = new Map<string, OLBookSearchDoc>();
  for (const d of olDocs) {
    const key = olDedupKey(d);
    const existing = olWinners.get(key);
    if (!existing || olDedupScore(d) > olDedupScore(existing)) {
      olWinners.set(key, d);
    }
  }
  const olDeduped = Array.from(olWinners.values());

  // Cover contamination: when two works share the SAME cover URL but different
  // first authors, the loser inherited it — suppress its (wrong) cover but keep
  // the book (contamination-victim escape hatch in the quality filter).
  const coverAuthors = new Map<string, Set<string>>();
  for (const d of olDeduped) {
    if (!d.coverUrl) continue;
    const set = coverAuthors.get(d.coverUrl) ?? new Set<string>();
    set.add((d.authors[0] ?? "").toLowerCase().trim());
    coverAuthors.set(d.coverUrl, set);
  }
  const contaminationVictims = new Set<string>();
  for (const d of olDeduped) {
    if (!d.coverUrl) continue;
    const authors = coverAuthors.get(d.coverUrl);
    if (!authors || authors.size <= 1) continue;
    const contestants = olDeduped.filter((o) => o.coverUrl === d.coverUrl);
    contestants.sort((a, b) => {
      const aScore =
        a.ratingsCount + a.wantToReadCount * 0.5 + a.editionCount * 5;
      const bScore =
        b.ratingsCount + b.wantToReadCount * 0.5 + b.editionCount * 5;
      return bScore - aScore;
    });
    if (contestants[0].workKey === d.workKey) continue;
    d.coverUrl = null;
    contaminationVictims.add(d.workKey);
  }

  // OL quality filter — ported verbatim.
  const olQuality = olDeduped.filter((d) => {
    if (!d.coverUrl && !contaminationVictims.has(d.workKey)) return false;
    if (d.authors.length === 0) return false;
    if (d.languages.length > 0 && !d.languages.includes("eng")) return false;

    const subjLower = d.subjects.map((s) => s.toLowerCase());
    if (
      subjLower.some(
        (s) =>
          s === "graphic novels" ||
          s === "comics & graphic novels" ||
          s === "comic books, strips, etc" ||
          s === "comics" ||
          s === "manga" ||
          s.includes("graphic novel"),
      )
    ) {
      return false;
    }

    if (d.ratingsCount < 2 && d.editionCount < 3 && d.wantToReadCount < 5) {
      return false;
    }
    if (looksForeign(d.title, d.subtitle ?? "")) return false;

    const lowerTitle = d.title.toLowerCase();
    const lowerSub = (d.subtitle ?? "").toLowerCase();
    const editionPatterns = [
      /\bcollector'?s?\s+edition\b/,
      /\banniversary\s+edition\b/,
      /\b(limited|deluxe|special|leather[\s-]*bound|illustrated)\s+edition\b/,
      /\b(tenth|10th|20th|25th|50th)\s+.*edition\b/,
      /\bboxed?\s*set\b/,
      /\b\d+[-\s]?books?\s+(bundle|set|collection|omnibus)\b/,
      /\btrilogy\s+(bundle|boxed?\s*set|collection|omnibus|complete)\b/,
      /\b(series|saga)\s+(bundle|boxed?\s*set|collection|omnibus)\b/,
      /\bcomplete\s+(series|set|collection|trilogy|saga)\b/,
      /\bomnibus\b/,
      /\bslipcase\b/,
      /\bbundle\b/,
      /\b(movie|tv|film)[\s-]*tie[\s-]*in\b/,
    ];
    if (editionPatterns.some((p) => p.test(lowerTitle) || p.test(lowerSub))) {
      return false;
    }
    const splitVolumePatterns = [
      /\bpart\s+(one|two|three|four|five|1|2|3|4|5)\b/i,
      /\bvolume\s+\d+\b/i,
      /\bvol\.?\s+\d+\b/i,
    ];
    if (
      splitVolumePatterns.some(
        (p) => p.test(d.title) || p.test(d.subtitle ?? ""),
      )
    ) {
      return false;
    }
    return true;
  });

  const olRanked = rankRaw<OLBookSearchDoc>(olQuality, titlePart, {
    getTitle: (d) => d.title + (d.subtitle ? `: ${d.subtitle}` : ""),
    getPopularity: (d) =>
      d.ratingsCount + Math.floor(d.wantToReadCount * 0.5) + d.editionCount * 5,
    hasCover: (d) => !!d.coverUrl,
    substringPopularityFloor: 0,
    getYear: (d) => d.firstPublishYear ?? 0,
  });

  // Only fall back to GB when OL has nothing — a single legit OL hit should NOT
  // bounce to GB (GB would surface its noisy edition variants).
  if (olRanked.length >= 1) {
    return olRanked.map(({ item, score }) => ({
      result: normalizeOLBook(item),
      score,
    }));
  }

  // ---- Google Books fallback (only when OL is empty) ----
  const apiQuery = authorPart
    ? `intitle:"${titlePart}" inauthor:"${authorPart}"`
    : `intitle:"${titlePart}"`;
  const res = await searchBooks(apiQuery, secrets.googleBooksKey ?? "", 0, 40);
  const items = res.items ?? [];

  // GB quality filter — ported verbatim.
  const quality = items.filter((b) => {
    const info = b.volumeInfo;
    if (info.language && info.language !== "en") return false;
    if (info.maturityRating === "MATURE") return false;
    if ((info.categories?.length ?? 0) === 0 && (info.ratingsCount ?? 0) === 0) {
      return false;
    }
    if (looksForeign(info.title, info.subtitle ?? "")) return false;
    if (!info.imageLinks?.thumbnail) return false;
    if (!info.authors || info.authors.length === 0) return false;

    const hasISBN = info.industryIdentifiers?.some(
      (id) => id.type === "ISBN_10" || id.type === "ISBN_13",
    );
    if (!hasISBN) return false;

    const hasCategoryTags = (info.categories?.length ?? 0) > 0;
    if ((info.pageCount ?? 0) === 0 && !hasCategoryTags) return false;

    const lowerTitle = info.title.toLowerCase();
    const lowerSub = (info.subtitle ?? "").toLowerCase();
    const editionPatterns = [
      /\bcollector'?s?\s+edition\b/,
      /\banniversary\s+edition\b/,
      /\b(limited|deluxe|special|leather[\s-]*bound|illustrated)\s+edition\b/,
      /\b(tenth|10th|20th|25th|50th)\s+.*edition\b/,
      /\bboxed?\s*set\b/,
      /\b\d+[-\s]?book\s+(bundle|set|collection|omnibus)\b/,
      /\btrilogy\s+(bundle|boxed?\s*set|collection|omnibus|complete)\b/,
      /\b(series|saga)\s+(bundle|boxed?\s*set|collection|omnibus)\b/,
      /\bbooks?\s+\d+\s+(and|&|to|through|-)\s+\d+\b/,
      /\bcomplete\s+(series|set|collection|trilogy|saga)\b/,
      /\bomnibus\b/,
      /\bslipcase\b/,
      /\bebundle\b/,
      /\bdiscounted\b/,
      /\bbundle\b/,
    ];
    if (editionPatterns.some((p) => p.test(lowerTitle) || p.test(lowerSub))) {
      return false;
    }
    const previewPatterns = [
      /\bprologue\b/,
      /\bpreview\b/,
      /\bsampler?\b/,
      /\bexcerpt\b/,
      /\bchapter\s*\d+/,
      /\bfirst\s+\d+\s+chapters?\b/,
    ];
    if (previewPatterns.some((p) => p.test(lowerTitle) || p.test(lowerSub))) {
      return false;
    }
    const splitVolumePatterns = [
      /\bpart\s+(one|two|three|four|five|1|2|3|4|5|i|ii|iii|iv|v)\b/i,
      /\bvolume\s+\d+\b/i,
      /\bvol\.?\s+\d+\b/i,
    ];
    if (
      splitVolumePatterns.some(
        (p) => p.test(info.title) || p.test(info.subtitle ?? ""),
      )
    ) {
      return false;
    }
    if (/\bset\s*:/i.test(info.title) || /\bset\s*$/i.test(info.title)) {
      return false;
    }
    const commaCountTitle = (info.title.match(/,/g) ?? []).length;
    const commaCountSub = ((info.subtitle ?? "").match(/,/g) ?? []).length;
    if (commaCountTitle >= 2 || commaCountSub >= 2) return false;
    if ((info.pageCount ?? 0) > 2000) return false;

    const desc = (info.description ?? "").trim().toLowerCase();
    if (
      desc.startsWith("this bundle") ||
      desc.startsWith("this ebundle") ||
      desc.startsWith("this discounted") ||
      desc.startsWith("this collection includes") ||
      desc.startsWith("this set includes")
    ) {
      return false;
    }
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
      return false;
    }
    const cats = info.categories ?? [];
    const nonEntertainmentPrefixes =
      /^(law|legal|court|government document|reference|technology|education|science|mathematics|medical|business & economics|architecture|engineering|agriculture)\b/i;
    if (cats.some((c) => nonEntertainmentPrefixes.test(c.trim()))) return false;

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
    if (
      textbookPatterns.some(
        (p) => p.test(info.title) || p.test(info.subtitle ?? ""),
      )
    ) {
      return false;
    }
    return true;
  });

  // Dedup by normalized title + first author, keeping the best edition.
  const positionMap = new Map<GoogleBooksVolume, number>();
  quality.forEach((book, i) => positionMap.set(book, i));
  const byTitle = new Map<string, GoogleBooksVolume>();
  for (const book of quality) {
    const author = (book.volumeInfo.authors?.[0] ?? "").toLowerCase().trim();
    const key = `${normalizeBookTitle(book.volumeInfo.title)}|${author}`;
    const existing = byTitle.get(key);
    const bookScore = bookEditionScore(book, positionMap.get(book) ?? 0);
    const existingScore = existing
      ? bookEditionScore(existing, positionMap.get(existing) ?? 0)
      : -1;
    if (!existing || bookScore > existingScore) byTitle.set(key, book);
  }
  const deduped = Array.from(byTitle.values());

  const ranked = rankRaw<GoogleBooksVolume>(deduped, titlePart, {
    getTitle: (b) =>
      b.volumeInfo.title +
      (b.volumeInfo.subtitle ? `: ${b.volumeInfo.subtitle}` : ""),
    getPopularity: (b) => b.volumeInfo.ratingsCount ?? 0,
    hasCover: (b) => !!b.volumeInfo.imageLinks?.thumbnail,
    substringPopularityFloor: 0,
    getYear: (b) => yearFromDate(b.volumeInfo.publishedDate),
  });

  return ranked.map(({ item, score }) => ({
    result: normalizeGoogleBook(item),
    score,
  }));
}

async function searchGameResults(
  q: string,
  secrets: SearchSecrets,
): Promise<ScoredResult[]> {
  if (!secrets.twitchClientId || !secrets.twitchClientSecret) return [];
  const results = await searchGames(
    q,
    secrets.twitchClientId,
    secrets.twitchClientSecret,
  );
  const ranked = rankRaw<IGDBGame>(results, q, {
    getTitle: (g) => g.name,
    getPopularity: (g) => g.rating_count ?? 0,
    hasCover: (g) => !!g.cover?.image_id,
    minPopularity: 1,
    substringPopularityFloor: 30,
    getYear: (g) =>
      g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear()
        : 0,
  });
  return ranked.map(({ item, score }) => ({
    result: normalizeIGDBGame(item),
    score,
  }));
}

// ---------------------------------------------------------------------------
// Orchestration — the public entry point mirroring web's route handler.
// ---------------------------------------------------------------------------

export type SearchType = "all" | "movie" | "tv_show" | "book" | "video_game";

// Map the request-friendly aliases (task spec: movie/tv/book/game) AND the
// canonical MediaType values onto the internal SearchType. Returns null for an
// unrecognized value so the caller can 400.
export function resolveSearchType(raw: unknown): SearchType | null {
  if (raw == null || raw === "") return "all";
  if (typeof raw !== "string") return null;
  switch (raw.toLowerCase()) {
    case "all":
      return "all";
    case "movie":
      return "movie";
    case "tv":
    case "tv_show":
      return "tv_show";
    case "book":
      return "book";
    case "game":
    case "video_game":
      return "video_game";
    default:
      return null;
  }
}

// The per-type source fan-out (mirrors web's `type` switch):
//   all  → movies + tv + books + games (global score-sorted interleave)
//   movie→ TMDB movies · tv_show → TMDB tv · book → OL+GB · video_game → IGDB
// Every source is best-effort: a thrown error (or missing secret) → [] and the
// source is skipped, so the whole search never 500s from one bad/unconfigured
// source. `q` shorter than 2 chars short-circuits to [].
export async function runSearch(
  q: string,
  type: SearchType,
  secrets: SearchSecrets,
): Promise<SearchResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const sources: ((
    q: string,
    s: SearchSecrets,
  ) => Promise<ScoredResult[]>)[] =
    type === "all"
      ? [searchMovieResults, searchTVResults, searchBookResults, searchGameResults]
      : type === "movie"
        ? [searchMovieResults]
        : type === "tv_show"
          ? [searchTVResults]
          : type === "book"
            ? [searchBookResults]
            : [searchGameResults];

  const settled = await Promise.allSettled(
    sources.map((fn) => fn(query, secrets)),
  );
  const all: ScoredResult[] = settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  all.sort((a, b) => b.score - a.score);
  return all.map((s) => s.result);
}
