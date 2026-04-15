// TMDB raw response types (movies + TV)

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TMDBMovieDetails extends TMDBMovie {
  runtime: number | null;
  genres: { id: number; name: string }[];
  credits?: {
    crew: { job: string; name: string }[];
    cast: { name: string; character: string; order: number }[];
  };
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TMDBTVDetails extends TMDBTVShow {
  number_of_seasons: number;
  number_of_episodes: number;
  genres: { id: number; name: string }[];
  created_by: { name: string }[];
  status: string;
  seasons: { season_number: number; name: string; episode_count: number }[];
}

export interface TMDBSearchResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// Google Books raw response types

export interface GoogleBooksVolume {
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
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
    };
    averageRating?: number;
    ratingsCount?: number;
    industryIdentifiers?: {
      type: string;
      identifier: string;
    }[];
  };
}

export interface GoogleBooksSearchResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

// IGDB raw response types

export interface IGDBGame {
  id: number;
  name: string;
  summary?: string;
  cover?: { image_id: string };
  first_release_date?: number; // Unix timestamp
  genres?: { name: string }[];
  platforms?: { name: string }[];
  involved_companies?: {
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }[];
  rating?: number;
  rating_count?: number;
}
