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
