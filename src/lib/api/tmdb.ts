import type {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBTVShow,
  TMDBTVDetails,
  TMDBSearchResponse,
  TMDBImage,
  TMDBImagesResponse,
} from "./types";

const BASE_URL = "https://api.themoviedb.org/3";

function headers() {
  return {
    Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function searchMovies(
  query: string,
  page = 1
): Promise<TMDBSearchResponse<TMDBMovie>> {
  const url = `${BASE_URL}/search/movie?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB search movies failed: ${res.status}`);
  return res.json();
}

export async function searchTVShows(
  query: string,
  page = 1
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const url = `${BASE_URL}/search/tv?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB search TV failed: ${res.status}`);
  return res.json();
}

export async function getMovieDetails(
  tmdbId: number
): Promise<TMDBMovieDetails> {
  const url = `${BASE_URL}/movie/${tmdbId}?append_to_response=credits,release_dates,alternative_titles,keywords`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB movie details failed: ${res.status}`);
  return res.json();
}

export async function getTVDetails(tmdbId: number): Promise<TMDBTVDetails> {
  const url = `${BASE_URL}/tv/${tmdbId}?append_to_response=credits,alternative_titles,keywords`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB TV details failed: ${res.status}`);
  return res.json();
}

export function tmdbImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function getMovieImages(
  tmdbId: number
): Promise<TMDBImagesResponse> {
  // include_image_language narrows to English + language-neutral so we
  // don't rank non-English alternates that would look out of place.
  const url = `${BASE_URL}/movie/${tmdbId}/images?include_image_language=en,null`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB movie images failed: ${res.status}`);
  return res.json();
}

export async function getTVImages(
  tmdbId: number
): Promise<TMDBImagesResponse> {
  const url = `${BASE_URL}/tv/${tmdbId}/images?include_image_language=en,null`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB TV images failed: ${res.status}`);
  return res.json();
}

/**
 * Rank TMDb backdrops and return the best one's URL.
 * Priority:
 *   1. Language-neutral (no embedded text) > English > other.
 *   2. Higher vote_average wins.
 *   3. Higher vote_count as a tiebreaker.
 * Returns null if the list is empty.
 */
export function pickBestTMDBBackdrop(
  backdrops: TMDBImage[] | undefined
): string | null {
  if (!backdrops || backdrops.length === 0) return null;
  const langScore = (lang: string | null): number => {
    if (lang === null) return 2;
    if (lang === "en") return 1;
    return 0;
  };
  const ranked = [...backdrops].sort((a, b) => {
    const langDiff = langScore(b.iso_639_1) - langScore(a.iso_639_1);
    if (langDiff !== 0) return langDiff;
    if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
    return b.vote_count - a.vote_count;
  });
  return tmdbImageUrl(ranked[0].file_path, "original");
}

/**
 * Fetch /images for a movie or show and return the best backdrop's URL,
 * falling back to the provided URL on any failure.
 */
export async function fetchBestTMDBBackdrop(
  mediaType: "movie" | "tv_show",
  tmdbId: number,
  fallback: string | null
): Promise<string | null> {
  try {
    const images =
      mediaType === "movie"
        ? await getMovieImages(tmdbId)
        : await getTVImages(tmdbId);
    return pickBestTMDBBackdrop(images.backdrops) ?? fallback;
  } catch {
    return fallback;
  }
}
