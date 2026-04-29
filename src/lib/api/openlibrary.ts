// Open Library is a free, no-key API maintained by the Internet Archive.
// We use it as a metadata sidekick for Google Books — Google has the
// canonical edition data but no author bios or photos. OL fills that gap.
//
// Auth-free, generously rate-limited, but we still cache aggressively
// (24h) since author bios change rarely.

const BASE_URL = "https://openlibrary.org";
const COVERS_URL = "https://covers.openlibrary.org";

const AUTHOR_CACHE_SECONDS = 86_400;

export interface OpenLibraryAuthorSearchDoc {
  /** Author key like "OL23919A" — used for both details and photos. */
  key: string;
  name: string;
  birth_date?: string;
  death_date?: string;
  alternate_names?: string[];
  top_subjects?: string[];
  top_work?: string;
  work_count?: number;
}

export interface OpenLibraryAuthor {
  /** Returned as "/authors/OL23919A". */
  key: string;
  name: string;
  /** OL stores bios as either a plain string or `{ value, type }`. */
  bio?: string | { value: string; type: string };
  /** Numeric photo IDs — `-1` means "no photo on file". */
  photos?: number[];
  birth_date?: string;
  death_date?: string;
  personal_name?: string;
  links?: { url: string; title: string }[];
}

/**
 * Search Open Library's author index by name. Returns the most relevant
 * match — when multiple authors share a name (e.g. "John Smith"), OL
 * ranks by work_count which is generally what we want.
 */
export async function searchOpenLibraryAuthor(
  name: string
): Promise<OpenLibraryAuthorSearchDoc | null> {
  const url = `${BASE_URL}/search/authors.json?q=${encodeURIComponent(name)}&limit=5`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { docs?: OpenLibraryAuthorSearchDoc[] };
    const docs = data.docs ?? [];
    if (docs.length === 0) return null;

    // Prefer an exact (case-insensitive) name match if present, else fall
    // back to the top-ranked result. Avoids returning "Brandon Sanderson"
    // for a search of "B. Sanderson", etc.
    const target = name.trim().toLowerCase();
    const exact = docs.find(
      (d) => d.name && d.name.trim().toLowerCase() === target
    );
    return exact ?? docs[0];
  } catch {
    return null;
  }
}

export async function getOpenLibraryAuthor(
  key: string
): Promise<OpenLibraryAuthor | null> {
  const id = key.startsWith("/authors/") ? key.slice("/authors/".length) : key;
  const url = `${BASE_URL}/authors/${id}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as OpenLibraryAuthor;
  } catch {
    return null;
  }
}

/** Normalize OL's two bio shapes (string | { value }) to a plain string. */
export function getAuthorBio(author: OpenLibraryAuthor): string | null {
  if (!author.bio) return null;
  if (typeof author.bio === "string") return author.bio.trim() || null;
  return author.bio.value?.trim() || null;
}

/**
 * Resolve an author's photo URL. OL's covers service exposes photos by
 * numeric id (preferred — only present when a real photo exists) or by
 * OLID with `?default=false` (returns 404 when missing). The numeric-id
 * path is more reliable so we use it when available.
 */
export function authorPhotoUrl(
  author: OpenLibraryAuthor,
  size: "S" | "M" | "L" = "L"
): string | null {
  const photoId = author.photos?.find((id) => id > 0);
  if (photoId) {
    return `${COVERS_URL}/a/id/${photoId}-${size}.jpg`;
  }
  return null;
}

export function authorOlid(author: OpenLibraryAuthor): string {
  return author.key.startsWith("/authors/")
    ? author.key.slice("/authors/".length)
    : author.key;
}

export interface OpenLibraryWork {
  key: string; // "/works/OLW..."
  title: string;
  covers?: number[];
  description?: string | { value: string; type?: string };
  first_publish_date?: string;
  subjects?: string[];
  /** OL sometimes populates a top-level series field as `["Sun Eater #2"]`
      — undocumented but real for genre fiction. We parse the position
      out of the suffix when present. */
  series?: string[];
}

/**
 * All works credited to an author. OL caps `/works.json` at 1000 — well
 * beyond what any author needs — so a single request returns the full
 * bibliography for prolific writers (Sanderson ~70 works, King ~150).
 */
export async function getAuthorWorks(
  olid: string,
  limit = 200
): Promise<OpenLibraryWork[]> {
  const id = olid.replace(/^\/authors\//, "");
  const url = `${BASE_URL}/authors/${id}/works.json?limit=${limit}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: OpenLibraryWork[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

interface OpenLibrarySearchDoc {
  key: string;
  title?: string;
  subtitle?: string;
  cover_i?: number;
  first_publish_year?: number;
  language?: string[];
}

/**
 * Author's works filtered to those with at least one English edition.
 * Uses OL's /search.json endpoint with `language=eng` so the language
 * filter happens server-side rather than via brittle title heuristics.
 *
 * Trades some metadata richness vs `getAuthorWorks` (no description/
 * subjects) but those aren't needed when we're going to re-fetch from
 * Google Books for rendering anyway.
 */
export async function getEnglishAuthorWorks(
  olid: string,
  limit = 200
): Promise<OpenLibraryWork[]> {
  const id = olid.replace(/^\/authors\//, "");
  const fields = "key,title,subtitle,cover_i,first_publish_year,language";
  const url = `${BASE_URL}/search.json?author_key=${id}&language=eng&limit=${limit}&fields=${fields}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: OpenLibrarySearchDoc[] };
    return (data.docs ?? []).map((d) => ({
      key: d.key,
      title: d.title ?? "",
      covers: d.cover_i ? [d.cover_i] : undefined,
      first_publish_date: d.first_publish_year
        ? String(d.first_publish_year)
        : undefined,
    }));
  } catch {
    return [];
  }
}

export interface OpenLibraryEdition {
  key: string; // "/books/OL...M"
  title?: string;
  isbn_10?: string[];
  isbn_13?: string[];
  publish_date?: string;
  languages?: { key: string }[];
  /** Free-form strings — formats vary wildly between editions:
      ["The Sun Eater"]
      ["Sun eater -- Book one"]
      ["Sun eater -- Book one", "Daw book collectors -- no. 1792"]
      Caller is expected to parse / clean these. */
  series?: string[];
}

/**
 * Fetch a single work by its OL id ("OL12345W"). Returns the full work
 * blob including `subjects` and the undocumented `series` field — both
 * used by `extractSeriesFromWork` for series detection.
 */
export async function getWorkByOlid(
  olid: string
): Promise<OpenLibraryWork | null> {
  const url = `${BASE_URL}/works/${olid}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as OpenLibraryWork;
  } catch {
    return null;
  }
}

export async function getWorkEditions(
  workKey: string,
  limit = 50
): Promise<OpenLibraryEdition[]> {
  const id = workKey
    .replace(/^\/works\//, "")
    .replace(/\.json$/, "");
  const url = `${BASE_URL}/works/${id}/editions.json?limit=${limit}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: OpenLibraryEdition[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

/**
 * Pick a representative ISBN-13 for a work — preferring English editions
 * since Google Books search later in the pipeline favors English results.
 * Falls back to any ISBN-13 if no English edition is found.
 */
export async function findISBNForWork(
  workKey: string
): Promise<string | null> {
  const editions = await getWorkEditions(workKey);
  // English editions first.
  const english = editions.filter((e) =>
    e.languages?.some((l) => l.key === "/languages/eng")
  );
  for (const ed of english) {
    if (ed.isbn_13?.[0]) return ed.isbn_13[0];
  }
  for (const ed of editions) {
    if (ed.isbn_13?.[0]) return ed.isbn_13[0];
  }
  return null;
}

/**
 * Reverse-lookup: given an ISBN, return the OL work id that contains it.
 * Used by the cross-reference enrichment to bind library books (Google-
 * Books-keyed) to author-page entries (OL-keyed).
 */
export async function findWorkByISBN(isbn: string): Promise<string | null> {
  const url = `${BASE_URL}/isbn/${isbn}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: AUTHOR_CACHE_SECONDS },
      // OL's /isbn/ endpoint redirects to the edition; follow it.
      redirect: "follow",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { works?: { key: string }[] };
    const workKey = data.works?.[0]?.key;
    if (!workKey) return null;
    return workKey.replace(/^\/works\//, "");
  } catch {
    return null;
  }
}

export function getWorkDescription(work: OpenLibraryWork): string | null {
  if (!work.description) return null;
  if (typeof work.description === "string") {
    return work.description.trim() || null;
  }
  return work.description.value?.trim() || null;
}

export function olCoverUrl(
  coverId: number,
  size: "S" | "M" | "L" = "L"
): string {
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`;
}

export function workOlid(work: OpenLibraryWork): string {
  return work.key.replace(/^\/works\//, "");
}

/**
 * Slugify a series name for use in our internal `ol:{slug}` series id
 * AND as a bucket key during edition merging.
 *
 * Aggressive normalization is intentional: OL editions encode the same
 * series in cosmetically different ways ("The Sun Eater" vs
 * "Sun eater" vs "(The Sun Eater Series)") and we need them to collide
 * in the bucket map so the position metadata from one edition gets
 * applied to the merged result instead of getting outvoted.
 *
 * Strips leading articles (the/a/an), lowercases, collapses non-
 * alphanumerics to "-".
 */
function slugifySeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface OLSeriesMatch {
  /** Internal series id, prefixed with `ol:` */
  id: string;
  /** Human-readable series name */
  name: string;
  /** 1-based position. Null when OL doesn't expose ordering. */
  position: number | null;
}

/**
 * Pull series data off an OL work. Two sources, in order:
 *   1. The undocumented top-level `series: ["Sun Eater #2"]` field
 *      — most reliable when present. Position parsed from the `#N`
 *      suffix; falls back to null when absent.
 *   2. `subjects` containing "X (Series)" — common for catalog entries.
 *      OL doesn't encode position via subjects so we leave it null.
 *
 * Returns null when neither source resolves. Caller should treat this
 * as "no detected series" and skip the field rather than tagging with
 * a bogus value.
 */
export function extractSeriesFromWork(
  work: Pick<OpenLibraryWork, "series" | "subjects">
): OLSeriesMatch | null {
  // Source 1 — `series` field
  const seriesArr = work.series ?? [];
  for (const entry of seriesArr) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)(?:[\s,]+#\s*(\d+(?:\.\d+)?))?$/);
    if (!match) continue;
    const name = match[1].trim();
    const positionRaw = match[2];
    if (!name) continue;
    return {
      id: `ol:${slugifySeriesName(name)}`,
      name,
      position: positionRaw ? Math.floor(Number(positionRaw)) : null,
    };
  }

  // Source 2 — subjects pattern: "{Series Name} (Series)"
  const subjects = work.subjects ?? [];
  for (const subject of subjects) {
    const match = subject.match(/^(.+?)\s*\(Series\)\s*$/i);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    return {
      id: `ol:${slugifySeriesName(name)}`,
      name,
      position: null,
    };
  }

  return null;
}

// Spelled-out positions occasionally appear in edition `series` strings
// like "Sun eater -- Book one". Capped at 20 because beyond that, OL
// almost always uses digits.
const POSITION_WORDS: Record<string, number> = {
  one: 1, first: 1,
  two: 2, second: 2,
  three: 3, third: 3,
  four: 4, fourth: 4,
  five: 5, fifth: 5,
  six: 6, sixth: 6,
  seven: 7, seventh: 7,
  eight: 8, eighth: 8,
  nine: 9, ninth: 9,
  ten: 10, tenth: 10,
  eleven: 11, eleventh: 11,
  twelve: 12, twelfth: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

// Publisher / imprint catalogs — these masquerade as "series" on OL but
// are really just sequential SKU numbering. They have no narrative
// meaning and must not get tagged as the book's series.
const PUBLISHER_CATALOG_KEYWORDS = [
  "daw book collectors",
  "penguin classics",
  "penguin modern",
  "everyman's library",
  "vintage classics",
  "library of america",
  "modern library",
  "tor books",
  "del rey impact",
];

interface ParsedSeries {
  name: string;
  position: number | null;
}

/**
 * Parse a single OL `series` string into name + optional position.
 * Returns null if the string is a publisher catalog or otherwise
 * unusable. Handles the formats we've observed:
 *
 *   "The Sun Eater"                       → { name: "The Sun Eater" }
 *   "Sun eater -- Book one"               → { name: "Sun eater", position: 1 }
 *   "Stormlight Archive -- no. 3"         → { name: "Stormlight Archive", position: 3 }
 *   "Foo (The Bar Series)"                → { name: "The Bar", position: null }
 */
function parseSeriesString(raw: string): ParsedSeries | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Drop publisher catalogs early — even if they parse "cleanly" they
  // don't represent a real series.
  const lower = trimmed.toLowerCase();
  if (PUBLISHER_CATALOG_KEYWORDS.some((k) => lower.includes(k))) return null;

  // Format A: "Series Name -- Book/no./vol. N" (or word ordinal)
  const dashSplit = trimmed.match(
    /^(.+?)\s*--\s*(?:book|bk\.?|vol\.?|volume|no\.?|number|#)\s*(\S+)\s*$/i
  );
  if (dashSplit) {
    const name = dashSplit[1].trim();
    const posRaw = dashSplit[2].trim().toLowerCase().replace(/[.,]+$/, "");
    const posWord = POSITION_WORDS[posRaw];
    const posNum = posWord ?? Number(posRaw);
    return {
      name,
      position: Number.isFinite(posNum) ? Math.floor(posNum) : null,
    };
  }

  // Format B: "Series Name -- something else" — strip the suffix anyway,
  // it's almost always edition metadata we don't care about.
  const dashOnly = trimmed.match(/^(.+?)\s*--\s*.+$/);
  if (dashOnly) {
    return { name: dashOnly[1].trim(), position: null };
  }

  // Format C: "Title (The Series Series)" — extract the parenthetical.
  // Strips the trailing "Series" word so we end up with a clean name.
  const parenSeries = trimmed.match(/\(([^)]*?)\s*series\s*\)\s*$/i);
  if (parenSeries) {
    return { name: parenSeries[1].trim(), position: null };
  }

  // Format D: bare series name like "The Sun Eater". Use as-is.
  return { name: trimmed, position: null };
}

/**
 * Some OL editions stuff multiple series into a single string with the
 * convention `"Name (#N), Name2 (#M), Name3 (#K)"`. Splits those into
 * separate parsed entries, one per series. Returns an empty array when
 * the input doesn't match the compound shape — the caller falls back
 * to the single-string parser.
 *
 * The regex uses lazy matching so commas within an individual series
 * name don't break the split: "Mistborn, Era 2: Wax & Wayne (#3)" is
 * a single series whose name happens to contain a comma, and our
 * boundary detection (`(#N)` followed by comma-or-end) keeps it whole.
 */
function expandCompoundSeriesString(raw: string): ParsedSeries[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const compoundPattern = /(.+?)\s*\(#(\d+)\)\s*(?:,|$)/g;
  const matches = [...trimmed.matchAll(compoundPattern)];
  // A "compound" requires at least 2 (#N) segments — single
  // entries get the regular single-string parser path so the rest of
  // its formats (-- Book one, etc.) still apply.
  if (matches.length < 2) return [];
  const out: ParsedSeries[] = [];
  for (const m of matches) {
    const name = m[1].trim();
    if (!name) continue;
    if (PUBLISHER_CATALOG_KEYWORDS.some((k) => name.toLowerCase().includes(k))) {
      continue;
    }
    const positionRaw = Number(m[2]);
    out.push({
      name,
      position: Number.isFinite(positionRaw) ? Math.floor(positionRaw) : null,
    });
  }
  return out;
}

/**
 * Pull series data from a list of OL editions. Tries every edition's
 * `series` field, parses each, and merges the results — keeping the
 * most-common cleaned name (canonicalizes "Sun eater" / "The Sun Eater"
 * / "Sun Eater" to whichever appears most), and the first non-null
 * position seen. Returns null when no edition has usable series data.
 *
 * This is the primary OL detection path because most OL series data
 * lives on editions, not works. The work-level `extractSeriesFromWork`
 * is kept as a fallback for the rare cases where it's set there.
 */
export function extractSeriesFromEditions(
  editions: OpenLibraryEdition[]
): OLSeriesMatch | null {
  // Slug → { canonicalName, count, position }
  const byKey = new Map<
    string,
    { name: string; count: number; position: number | null }
  >();

  for (const ed of editions) {
    for (const raw of ed.series ?? []) {
      // Some OL editions stuff multiple series into a single string,
      // e.g. "Mistborn, Era 2: Wax & Wayne (#3), The Mistborn Saga
      // (#6), The Cosmere (#10)". Expand those into separate parsed
      // entries so each contributes to its own bucket.
      const expanded = expandCompoundSeriesString(raw);
      const parsedList = expanded.length > 0
        ? expanded
        : (() => {
            const single = parseSeriesString(raw);
            return single ? [single] : [];
          })();
      for (const parsed of parsedList) {
        const key = slugifySeriesName(parsed.name);
        if (!key) continue;
        const existing = byKey.get(key);
        if (existing) {
          existing.count += 1;
          // Prefer longer / more-properly-cased names within a bucket.
          // OL editions often disagree on capitalization ("Sun eater"
          // vs "The Sun Eater"); the longer one is usually the
          // canonical proper-case form, which is what we want to
          // display.
          if (parsed.name.length > existing.name.length) {
            existing.name = parsed.name;
          }
          if (existing.position == null && parsed.position != null) {
            existing.position = parsed.position;
          }
        } else {
          byKey.set(key, {
            name: parsed.name,
            count: 1,
            position: parsed.position,
          });
        }
      }
    }
  }

  if (byKey.size === 0) return null;

  // Pick the most-cited series. Ties resolved by name length (longer
  // tends to be more descriptive: "The Sun Eater" > "Sun eater").
  const ranked = Array.from(byKey.entries()).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].name.length - a[1].name.length;
  });
  const [winnerKey, winner] = ranked[0];
  return {
    id: `ol:${winnerKey}`,
    name: winner.name,
    position: winner.position,
  };
}
