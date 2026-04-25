// Hardcover is a Goodreads-style book tracker with a free GraphQL API
// (Hasura under the hood). We use it for author bibliographies — the one
// thing Google Books can't do well — keeping all the data flowing
// through our existing book pipeline via ISBN cross-references.
//
// Token expires April 2027. Rotate at hardcover.app/account/api.

const HARDCOVER_URL = "https://api.hardcover.app/v1/graphql";
const CACHE_SECONDS = 86_400;

class HardcoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HardcoverError";
  }
}

async function hardcoverQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const apiKey = process.env.HARDCOVER_API_KEY;
  if (!apiKey) {
    throw new HardcoverError(
      "HARDCOVER_API_KEY is not set in environment variables"
    );
  }

  const res = await fetch(HARDCOVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: CACHE_SECONDS },
  });

  if (!res.ok) {
    throw new HardcoverError(
      `Hardcover HTTP ${res.status}: ${await res.text().catch(() => "")}`
    );
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string; extensions?: unknown }[];
  };

  if (json.errors && json.errors.length > 0) {
    throw new HardcoverError(
      `Hardcover GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }

  if (!json.data) {
    throw new HardcoverError("Hardcover returned no data");
  }
  return json.data;
}

// Image objects from Hardcover come in a few shapes depending on the
// query path — sometimes a `cached_image` object with a url, sometimes
// just a url string, sometimes a related `image` row. The helper below
// normalizes them.
export type HardcoverImageInput =
  | string
  | { url?: string | null }
  | null
  | undefined;

export function hardcoverImageUrl(img: HardcoverImageInput): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  return img.url ?? null;
}

export interface HardcoverAuthor {
  id: number;
  name: string;
  slug: string | null;
  bio: string | null;
  cached_image: HardcoverImageInput;
  books_count: number | null;
}

export interface HardcoverEdition {
  id: number;
  isbn_10: string | null;
  isbn_13: string | null;
}

export interface HardcoverBook {
  id: number;
  title: string;
  subtitle: string | null;
  slug: string | null;
  description: string | null;
  release_date: string | null;
  rating: number | null;
  ratings_count: number | null;
  cached_image: HardcoverImageInput;
  default_physical_edition?: HardcoverEdition | null;
  default_ebook_edition?: HardcoverEdition | null;
  default_audio_edition?: HardcoverEdition | null;
}

export interface HardcoverContribution {
  book: HardcoverBook;
}

/**
 * Sanity-check query — used by the debug page to confirm a token works
 * and the GraphQL endpoint is reachable.
 */
export async function getHardcoverMe(): Promise<{ username: string }> {
  const data = await hardcoverQuery<{ me: { username: string }[] }>(
    `query Me { me { username } }`
  );
  // The Hasura projection of /me returns an array even though there's
  // exactly one user — collapse to a single record for the caller.
  const me = data.me?.[0];
  if (!me) throw new HardcoverError("Hardcover /me returned empty");
  return me;
}

/**
 * Find a Hardcover author by name. Hardcover's API blocks `_ilike` /
 * fuzzy ops, so we hit `_in` with a few capitalization variants to
 * survive minor casing mismatches in the source name (Google Books
 * usually returns canonical "Brandon Sanderson" but a user-typed name
 * might be "brandon sanderson"). Falls back to `_eq` exact match if
 * none of the variants hit.
 */
export async function searchHardcoverAuthorByName(
  name: string
): Promise<HardcoverAuthor | null> {
  const trimmed = name.trim();
  const variants = Array.from(
    new Set([
      trimmed,
      titleCase(trimmed),
      trimmed.toLowerCase(),
      trimmed.toUpperCase(),
    ])
  );
  const data = await hardcoverQuery<{ authors: HardcoverAuthor[] }>(
    `query SearchAuthor($names: [String!]!) {
      authors(
        where: { name: { _in: $names } }
        order_by: { books_count: desc_nulls_last }
        limit: 5
      ) {
        id
        name
        slug
        bio
        cached_image
        books_count
      }
    }`,
    { names: variants }
  );
  if (!data.authors || data.authors.length === 0) return null;
  const target = trimmed.toLowerCase();
  const exact = data.authors.find(
    (a) => a.name?.trim().toLowerCase() === target
  );
  return exact ?? data.authors[0];
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Author's full bibliography via the contributions junction. Includes
 * ISBN cross-references on the default editions so we can match library
 * books (which may already be keyed by `google_books_id`) to Hardcover
 * books via ISBN.
 */
export async function getHardcoverAuthorBibliography(
  authorId: number,
  limit = 200
): Promise<HardcoverBook[]> {
  const data = await hardcoverQuery<{
    authors: { contributions: HardcoverContribution[] }[];
  }>(
    `query AuthorBibliography($authorId: Int!, $limit: Int!) {
      authors(where: { id: { _eq: $authorId } }, limit: 1) {
        contributions(
          order_by: { book: { release_date: desc_nulls_last } }
          limit: $limit
        ) {
          book {
            id
            title
            subtitle
            slug
            description
            release_date
            rating
            ratings_count
            cached_image
            default_physical_edition {
              id
              isbn_10
              isbn_13
            }
            default_ebook_edition {
              id
              isbn_10
              isbn_13
            }
            default_audio_edition {
              id
              isbn_10
              isbn_13
            }
          }
        }
      }
    }`,
    { authorId, limit }
  );
  // A single book can yield multiple contribution rows when the author
  // holds multiple roles (writer + illustrator, etc.). Dedupe by book id
  // so React renders cleanly and the page doesn't show ghost duplicates.
  const seen = new Set<number>();
  const unique: HardcoverBook[] = [];
  for (const { book } of data.authors[0]?.contributions ?? []) {
    if (seen.has(book.id)) continue;
    seen.add(book.id);
    unique.push(book);
  }
  return unique;
}

/** Pick an ISBN-13 (preferred) or ISBN-10 from the available editions. */
export function pickHardcoverISBN(book: HardcoverBook): string | null {
  const editions = [
    book.default_physical_edition,
    book.default_ebook_edition,
    book.default_audio_edition,
  ];
  for (const ed of editions) {
    if (ed?.isbn_13) return ed.isbn_13;
  }
  for (const ed of editions) {
    if (ed?.isbn_10) return ed.isbn_10;
  }
  return null;
}
