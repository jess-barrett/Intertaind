import { tmdbImageUrl } from "@intertaind/media";
import type {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBTVShow,
  TMDBTVDetails,
  TMDBSearchResponse,
  TMDBImage,
  TMDBImagesResponse,
  TMDBPerson,
  TMDBPersonCombinedCredits,
  TMDBCompany,
  TMDBNetwork,
} from "@intertaind/media";

const BASE_URL = "https://api.themoviedb.org/3";

// Movie / TV details + search results barely change between visits, so
// we let Next cache TMDb responses on the data layer. 24h is conservative
// — popular titles get hammered by enrichment + page renders, and a day
// is more than enough freshness for canonical metadata.
const TMDB_CACHE_SECONDS = 86_400;

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
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB search movies failed: ${res.status}`);
  return res.json();
}

export async function searchTVShows(
  query: string,
  page = 1
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const url = `${BASE_URL}/search/tv?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB search TV failed: ${res.status}`);
  return res.json();
}

export async function getMovieDetails(
  tmdbId: number
): Promise<TMDBMovieDetails> {
  const url = `${BASE_URL}/movie/${tmdbId}?append_to_response=credits,release_dates,alternative_titles,keywords`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB movie details failed: ${res.status}`);
  return res.json();
}

export async function getTVDetails(tmdbId: number): Promise<TMDBTVDetails> {
  const url = `${BASE_URL}/tv/${tmdbId}?append_to_response=credits,alternative_titles,keywords`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB TV details failed: ${res.status}`);
  return res.json();
}

export interface TMDBSeasonEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  overview: string;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  runtime: number | null;
}

export interface TMDBSeasonDetails {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  air_date: string | null;
  poster_path: string | null;
  episodes: TMDBSeasonEpisode[];
}

/**
 * Fetch a single season's full episode list, including per-episode
 * `vote_average` + `vote_count` for the ratings graph. One call returns
 * every episode in the season — much cheaper than per-episode requests
 * which would be ~10-25 API calls per season.
 *
 * Cached for 24h like every other TMDb call. Per-episode ratings drift
 * slowly enough that day-old freshness is fine for the sidebar graph.
 */
export async function getTVSeason(
  tmdbId: number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> {
  const url = `${BASE_URL}/tv/${tmdbId}/season/${seasonNumber}`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok)
    throw new Error(
      `TMDB season ${seasonNumber} of ${tmdbId} failed: ${res.status}`
    );
  return res.json();
}

export async function getMovieImages(
  tmdbId: number
): Promise<TMDBImagesResponse> {
  // include_image_language narrows to English + language-neutral so we
  // don't rank non-English alternates that would look out of place.
  const url = `${BASE_URL}/movie/${tmdbId}/images?include_image_language=en,null`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB movie images failed: ${res.status}`);
  return res.json();
}

export async function getTVImages(
  tmdbId: number
): Promise<TMDBImagesResponse> {
  const url = `${BASE_URL}/tv/${tmdbId}/images?include_image_language=en,null`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: TMDB_CACHE_SECONDS },
  });
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

// Person bios and filmographies barely change — let Next cache them on
// the data layer so popular people don't hammer TMDb. 24h is conservative;
// if a person updates their bio it'll surface within a day.
const PERSON_CACHE_SECONDS = 86_400;

export async function getPersonDetails(personId: number): Promise<TMDBPerson> {
  const url = `${BASE_URL}/person/${personId}`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: PERSON_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB person details failed: ${res.status}`);
  return res.json();
}

export async function getPersonCombinedCredits(
  personId: number
): Promise<TMDBPersonCombinedCredits> {
  const url = `${BASE_URL}/person/${personId}/combined_credits`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: PERSON_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB person credits failed: ${res.status}`);
  return res.json();
}

// TMDb's published genre IDs — combined movie + TV map. Centralized
// here so any consumer (filmography, entity pages, search) can resolve
// raw genre_ids → display names without re-deriving the table.
export const TMDB_GENRES: Record<number, string> = {
  // Movies
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  // TV-only
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

// Studio / network bios and filmographies are similarly stable.
const ENTITY_CACHE_SECONDS = 86_400;

export async function getCompanyDetails(
  companyId: number
): Promise<TMDBCompany> {
  const url = `${BASE_URL}/company/${companyId}`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: ENTITY_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB company details failed: ${res.status}`);
  return res.json();
}

export async function getNetworkDetails(
  networkId: number
): Promise<TMDBNetwork> {
  const url = `${BASE_URL}/network/${networkId}`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: ENTITY_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB network details failed: ${res.status}`);
  return res.json();
}

export async function discoverMoviesByCompany(
  companyId: number,
  page = 1
): Promise<TMDBSearchResponse<TMDBMovie>> {
  const url = `${BASE_URL}/discover/movie?with_companies=${companyId}&page=${page}&include_adult=false&sort_by=popularity.desc`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: ENTITY_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB discover movies failed: ${res.status}`);
  return res.json();
}

export async function discoverTVByCompany(
  companyId: number,
  page = 1
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const url = `${BASE_URL}/discover/tv?with_companies=${companyId}&page=${page}&include_adult=false&sort_by=popularity.desc`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: ENTITY_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB discover TV failed: ${res.status}`);
  return res.json();
}

export async function discoverTVByNetwork(
  networkId: number,
  page = 1
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const url = `${BASE_URL}/discover/tv?with_networks=${networkId}&page=${page}&include_adult=false&sort_by=popularity.desc`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: ENTITY_CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`TMDB discover TV failed: ${res.status}`);
  return res.json();
}

/**
 * Pull up to ~3 pages (60 results) of discover output for a given fetcher.
 * Big studios have hundreds of titles; we cap server-side pagination so
 * the page-load stays fast and rely on filters/sort to surface what
 * matters. If we ever need exhaustive lists we can swap in a
 * client-driven Load More that hits the API directly.
 */
export async function discoverAllPages<T>(
  fetcher: (page: number) => Promise<TMDBSearchResponse<T>>,
  maxPages = 3
): Promise<T[]> {
  const first = await fetcher(1);
  const total = Math.min(first.total_pages, maxPages);
  if (total <= 1) return first.results;
  const rest = await Promise.all(
    Array.from({ length: total - 1 }, (_, i) => fetcher(i + 2))
  );
  return [
    ...first.results,
    ...rest.flatMap((r) => r.results),
  ];
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
