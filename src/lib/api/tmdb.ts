import type {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBTVShow,
  TMDBTVDetails,
  TMDBSearchResponse,
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
  const url = `${BASE_URL}/movie/${tmdbId}?append_to_response=credits`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB movie details failed: ${res.status}`);
  return res.json();
}

export async function getTVDetails(tmdbId: number): Promise<TMDBTVDetails> {
  const url = `${BASE_URL}/tv/${tmdbId}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB TV details failed: ${res.status}`);
  return res.json();
}

export function tmdbImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
