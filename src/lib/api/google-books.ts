import type { GoogleBooksVolume, GoogleBooksSearchResponse } from "./types";

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";

function apiKey() {
  return process.env.GOOGLE_BOOKS_API_KEY ?? "";
}

export async function searchBooks(
  query: string,
  startIndex = 0,
  maxResults = 20
): Promise<GoogleBooksSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    startIndex: String(startIndex),
    maxResults: String(maxResults),
    printType: "books",
    key: apiKey(),
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`);
  return res.json();
}

export async function getBookDetails(
  volumeId: string
): Promise<GoogleBooksVolume> {
  const res = await fetch(`${BASE_URL}/${volumeId}?key=${apiKey()}`);
  if (!res.ok) throw new Error(`Google Books details failed: ${res.status}`);
  return res.json();
}

/**
 * Find a Google Books volume by ISBN. Used to bind an Open Library work
 * (which gives us a canonical bibliography) to a Google Books volume
 * (which gives us cover, description, page count). The ISBN is the
 * cross-reference glue between both vendors.
 */
export async function findVolumeByISBN(
  isbn: string
): Promise<GoogleBooksVolume | null> {
  const params = new URLSearchParams({
    q: `isbn:${isbn}`,
    maxResults: "1",
    printType: "books",
    key: apiKey(),
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) return null;
  const data: GoogleBooksSearchResponse = await res.json();
  return data.items?.[0] ?? null;
}

/**
 * Find the best Google Books volume matching a specific title + author.
 * Used by author pages: OL gives us a complete bibliography, then we
 * resolve each work to a Google Books volume so cards render with clean
 * covers and descriptions instead of OL's user-uploaded scans.
 *
 * Cached at the fetch layer for 24h — Sanderson's bibliography won't
 * change minute-to-minute, and the per-title call count adds up fast on
 * cold visits otherwise.
 */
export async function findVolumeByTitleAndAuthor(
  title: string,
  author: string
): Promise<GoogleBooksVolume | null> {
  // No `country=US` filter here — Google's localization is over-eager
  // and excludes valid US editions of some books entirely (Elantris,
  // The Way of Kings, etc.). Edition origin is detected via publisher
  // name + ISBN-13 prefix in `scoreEdition` instead, which is reliable
  // without dropping books from the result set.
  const params = new URLSearchParams({
    q: `intitle:"${title}" inauthor:"${author}"`,
    maxResults: "10",
    printType: "books",
    key: apiKey(),
  });
  try {
    const res = await fetch(`${BASE_URL}?${params}`, {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const data: GoogleBooksSearchResponse = await res.json();
    const items = data.items ?? [];
    if (items.length === 0) return null;
    // Sort + pick instead of single-pass max so ties resolve
    // deterministically. Without tiebreakers, near-tie scores produce
    // different "best" picks across calls because Google Books' result
    // ordering isn't stable.
    const sorted = [...items].sort((a, b) => {
      const sb = scoreEdition(b);
      const sa = scoreEdition(a);
      if (sb !== sa) return sb - sa;
      // Earliest publishedDate wins — original edition over reissues.
      const da = a.volumeInfo.publishedDate ?? "9999";
      const db = b.volumeInfo.publishedDate ?? "9999";
      if (da !== db) return da.localeCompare(db);
      // Final tiebreaker: volume id alphabetic, for full determinism.
      return a.id.localeCompare(b.id);
    });
    return sorted[0];
  } catch {
    return null;
  }
}

/**
 * Search for alternative editions of a book by title (+ optional author).
 * Returns raw volumes with cover images, for letting users pick from
 * available cover art.
 */
export async function searchBookEditions(
  title: string,
  author?: string
): Promise<GoogleBooksVolume[]> {
  const q = author
    ? `intitle:"${title}"+inauthor:"${author}"`
    : `intitle:"${title}"`;
  const params = new URLSearchParams({
    q,
    maxResults: "40",
    printType: "books",
    key: apiKey(),
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) return [];
  const data: GoogleBooksSearchResponse = await res.json();
  return data.items ?? [];
}

/**
 * Find the canonical English edition of a book given title + author.
 * Used at add-time to upgrade search results to the best available edition,
 * since Google's pool for a broad query (e.g. "Mistborn") may only include
 * inferior editions that differ from what a direct title search returns.
 */
export async function findCanonicalBookEdition(
  title: string,
  author: string
): Promise<GoogleBooksVolume | null> {
  // Strip edition subtitle — we want the book title, not the edition name
  const cleanTitle = title.split(":")[0].trim();
  const q = `intitle:"${cleanTitle}" inauthor:"${author}"`;
  console.log(`\n[CANONICAL EDITION] Query: ${q}`);
  const params = new URLSearchParams({
    q,
    maxResults: "20",
    printType: "books",
    key: apiKey(),
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) return null;
  const data: GoogleBooksSearchResponse = await res.json();
  const items = data.items ?? [];

  const candidates = items.filter((b) => {
    const info = b.volumeInfo;
    if (info.language && info.language !== "en") return false;
    if (info.maturityRating === "MATURE") return false;
    if (!info.imageLinks?.thumbnail) return false;
    if ((info.pageCount ?? 0) === 0) return false;
    if (!info.authors || info.authors.length === 0) return false;
    const hasISBN = info.industryIdentifiers?.some(
      (id) => id.type === "ISBN_10" || id.type === "ISBN_13"
    );
    if (!hasISBN) return false;

    // Reject special/bundled editions — we want the canonical mass-market
    // edition, not collector's/illustrated/boxed sets.
    const text = `${info.title} ${info.subtitle ?? ""}`.toLowerCase();
    const specialEdition =
      /\bcollector'?s?\s+edition\b/.test(text) ||
      /\banniversary\s+edition\b/.test(text) ||
      /\b(limited|deluxe|special|leather[\s-]*bound|illustrated)\s+edition\b/.test(text) ||
      /\b(tenth|10th|20th|25th|50th)\s+.*edition\b/.test(text) ||
      /\bboxed?\s*set\b/.test(text) ||
      /\btrilogy\b/.test(text) ||
      /\bomnibus\b/.test(text) ||
      /\bslipcase\b/.test(text);
    if (specialEdition) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  const scored = candidates.map((b, i) => {
    const info = b.volumeInfo;
    const ratings = info.ratingsCount ?? 0;
    const description = info.description ?? "";
    const hasEnglishStopword =
      /\b(the|of|and|is|to|in|a|an|for|with|on|that|this)\b/i.test(description);
    const descBonus =
      description.length >= 200
        ? 100
        : hasEnglishStopword
        ? 10
        : description.length > 0
        ? -200
        : 0;
    const positionBonus = Math.max(0, 200 - i * 10);
    // Prefer editions with a preview — strong correlation with a real cover
    // image. Don't filter NO_PAGES outright (some legit paperbacks lack
    // preview), but heavily penalize so previewed editions win when present.
    const previewBonus = b.accessInfo?.viewability === "NO_PAGES" ? -150 : 50;
    return {
      volume: b,
      score: ratings * 10 + positionBonus + descBonus + previewBonus,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  console.log(`[CANONICAL EDITION] ${scored.length} candidates (top 5):`);
  scored.slice(0, 5).forEach(({ volume, score }) => {
    const info = volume.volumeInfo;
    console.log(
      `  - "${info.title}" | id:${volume.id} | ratings:${info.ratingsCount ?? 0} | pages:${info.pageCount ?? 0} | viewability:${volume.accessInfo?.viewability ?? "(missing)"} | score:${score.toFixed(0)}`
    );
  });
  const winner = scored[0].volume;
  console.log(`[CANONICAL EDITION] Winner: ${winner.id} "${winner.volumeInfo.title}"`);
  console.log(`[CANONICAL EDITION] Winner thumbnail: ${winner.volumeInfo.imageLinks?.thumbnail ?? "(none)"}`);
  const coverFromHelper = bookCoverUrl(winner);
  console.log(`[CANONICAL EDITION] Resolved cover URL: ${coverFromHelper}`);
  return winner;
}

/**
 * Fetch the bibliography of an author by name. Google Books returns a
 * lot of editions (paperback, hardcover, e-book, illustrated), so we
 * dedupe by cleaned title and prefer the highest-quality edition for
 * each work — same shape as `findCanonicalBookEdition`'s scoring.
 *
 * `maxRaw` controls how many raw volumes we pull before dedupe. 200 (5
 * pages of 40) catches most prolific authors' catalogs after dedupe
 * collapses the edition spam.
 */
export async function getBooksByAuthor(
  authorName: string,
  maxRaw = 200
): Promise<GoogleBooksVolume[]> {
  const q = `inauthor:"${authorName}"`;
  const pageSize = 40;
  const pages = Math.ceil(maxRaw / pageSize);
  const all: GoogleBooksVolume[] = [];
  for (let p = 0; p < pages; p++) {
    const params = new URLSearchParams({
      q,
      startIndex: String(p * pageSize),
      maxResults: String(pageSize),
      printType: "books",
      orderBy: "relevance",
      key: apiKey(),
    });
    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) break;
    const data: GoogleBooksSearchResponse = await res.json();
    const items = data.items ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < pageSize) break;
  }
  return dedupeAuthorBibliography(all, authorName);
}

/**
 * Collapse Google Books' edition spam to one volume per title. Picks
 * the "best" edition: English, has cover + ISBN + non-empty description,
 * highest ratings_count tiebreaker. Books missing any of those fall
 * through to runner-up. Author name is matched loosely so co-authored
 * works still surface (some volumes credit just the primary author).
 */
function dedupeAuthorBibliography(
  volumes: GoogleBooksVolume[],
  authorName: string
): GoogleBooksVolume[] {
  const target = authorName.trim().toLowerCase();
  const byTitle = new Map<string, GoogleBooksVolume>();

  for (const v of volumes) {
    const info = v.volumeInfo;
    if (!info.title) continue;
    // Require the queried author to appear somewhere in the credits.
    // Google's `inauthor:` operator is fuzzy — without this filter the
    // page can fill with unrelated books from collaborators.
    const credited = info.authors ?? [];
    const matches = credited.some((a) => a.toLowerCase().includes(target));
    if (!matches) continue;

    const cleanTitle = info.title.split(":")[0].trim().toLowerCase();
    if (!cleanTitle) continue;

    const incumbent = byTitle.get(cleanTitle);
    if (!incumbent || scoreEdition(v) > scoreEdition(incumbent)) {
      byTitle.set(cleanTitle, v);
    }
  }
  return Array.from(byTitle.values());
}

// ISBN-13 prefixes registered to UK publisher blocks. Not exhaustive —
// covers the main genre/SFF imprints we see slipping through. Each
// entry is a prefix on the full 13-digit ISBN (no hyphens).
//
// The test is "starts with this prefix", so longer prefixes are more
// specific. We match against the longest prefix first via
// `Array.some`.
const UK_ISBN_PREFIXES = [
  "978074", // Bloomsbury, Headline, Hodder reissues
  "9780340", // Hodder & Stoughton
  "9780571", // Faber & Faber
  "9780575", // Gollancz / Orion
  "9780747", // Bloomsbury (older)
  "9780753", // Various UK trade
  "9781407", // Hachette UK
  "9781408", // Hachette UK
  "9781409", // Hachette UK / Quercus
  "9781447", // Pan Macmillan / Tor UK
  "9781473", // Hodder & Stoughton
  "9781529", // Various UK
  "9781780", // Bloomsbury (recent)
  "9781784", // Penguin Random House UK
  "9781785", // Penguin Random House UK
  "9781787", // Penguin Random House UK
];

function looksLikeUKEditionISBN(isbn: string | null | undefined): boolean {
  if (!isbn) return false;
  const cleaned = isbn.replace(/[^\d]/g, "");
  return UK_ISBN_PREFIXES.some((p) => cleaned.startsWith(p));
}

function scoreEdition(v: GoogleBooksVolume): number {
  const info = v.volumeInfo;
  let s = 0;
  if (info.language === "en") s += 50;
  else if (info.language) s -= 100;
  if (info.imageLinks?.thumbnail) s += 30;
  const hasISBN = info.industryIdentifiers?.some(
    (id) => id.type === "ISBN_10" || id.type === "ISBN_13"
  );
  if (hasISBN) s += 20;
  if ((info.description ?? "").length >= 200) s += 30;
  if ((info.pageCount ?? 0) >= 50) s += 10;
  if (info.maturityRating === "MATURE") s -= 80;
  s += Math.min(100, info.ratingsCount ?? 0);

  // Canonical editions have short, descriptive subtitles ("Book Three
  // of Mistborn"). UK marketing reissues stuff a sales pitch into the
  // subtitle ("The first book of the breathtaking epic..."). Length
  // bands let us hit the worst offenders hardest.
  const subtitleLen = (info.subtitle ?? "").length;
  if (subtitleLen > 80) s -= 150;
  else if (subtitleLen > 60) s -= 80;
  else if (subtitleLen > 40) s -= 30;

  // Publisher-name penalty for known UK imprints. Matches the obvious
  // "Hachette UK" string plus other UK SFF imprints.
  const pub = (info.publisher ?? "").toLowerCase();
  const ukPublisher =
    pub.includes("hachette uk") ||
    pub.includes("gollancz") ||
    pub.includes("orion publishing") ||
    pub.includes("hodder") ||
    pub.includes("pan macmillan") ||
    pub.includes("tor uk") ||
    pub.includes("headline") ||
    pub.includes("quercus") ||
    pub.includes("bloomsbury") ||
    pub.endsWith(" uk");
  if (ukPublisher) s -= 80;

  // ISBN-13 prefix penalty for UK publisher registration blocks. This
  // catches editions with US-sounding publisher names (e.g. just
  // "Macmillan") that are actually the UK arm.
  const isbn13 = info.industryIdentifiers?.find(
    (id) => id.type === "ISBN_13"
  )?.identifier;
  if (looksLikeUKEditionISBN(isbn13)) s -= 80;

  return s;
}

export function bookCoverUrl(volume: GoogleBooksVolume): string | null {
  const links = volume.volumeInfo.imageLinks;
  if (!links) return null;

  // Prefer the largest size Google has — fall back progressively
  const url =
    links.extraLarge ??
    links.large ??
    links.medium ??
    links.small ??
    links.thumbnail ??
    links.smallThumbnail;
  if (!url) return null;

  // zoom=3 gives a higher-res cover, but NO_PAGES volumes only have zoom=1.
  // Only upgrade when we know the volume has a preview (PARTIAL / ALL_PAGES).
  // Unknown/missing viewability is treated as not-upgradable since Google
  // sometimes omits accessInfo entirely for thin records.
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
