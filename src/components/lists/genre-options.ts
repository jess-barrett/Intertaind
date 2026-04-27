// TMDb's published genre list (movies + TV combined). Exposed here as
// plain string options for the list-form Genre dropdown so the client
// bundle doesn't have to pull in `lib/api/tmdb.ts` (which carries the
// fetch helpers). Keep this in sync with `TMDB_GENRES` in tmdb.ts.

export const GENRE_OPTIONS = [
  "Action",
  "Action & Adventure",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Kids",
  "Music",
  "Mystery",
  "News",
  "Reality",
  "Romance",
  "Sci-Fi & Fantasy",
  "Science Fiction",
  "Soap",
  "Talk",
  "Thriller",
  "TV Movie",
  "War",
  "War & Politics",
  "Western",
] as const;

export type GenreOption = (typeof GENRE_OPTIONS)[number];

/** Stored form for tags: lowercased label so `genre = "Action"` and a
    free-form tag the user types as "action" deduplicate cleanly. */
export function genreToTag(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Inverse — given a list's stored tags, find the first one that maps
 * back to a known genre option. Used to pre-populate the Genre
 * dropdown on the edit form when the user originally picked a genre.
 */
export function tagToGenre(tags: string[]): string | null {
  for (const tag of tags) {
    const match = GENRE_OPTIONS.find((g) => genreToTag(g) === tag.toLowerCase());
    if (match) return match;
  }
  return null;
}

// Mood is free-form (not a fixed list like Genre), so we identify it
// via a `mood:` prefix on the stored tag — that way the edit form can
// reliably pluck it back out without ambiguity with other tags.

const MOOD_PREFIX = "mood:";

export function moodToTag(mood: string): string {
  return `${MOOD_PREFIX}${mood.trim().toLowerCase()}`;
}

export function tagToMood(tags: string[]): string | null {
  for (const tag of tags) {
    if (tag.toLowerCase().startsWith(MOOD_PREFIX)) {
      return tag.slice(MOOD_PREFIX.length);
    }
  }
  return null;
}

export function isMoodTag(tag: string): boolean {
  return tag.toLowerCase().startsWith(MOOD_PREFIX);
}
