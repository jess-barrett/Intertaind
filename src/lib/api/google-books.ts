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
