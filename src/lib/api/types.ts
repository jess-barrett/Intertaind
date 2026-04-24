// TMDB raw response types (movies + TV)

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TMDBMovieDetails extends TMDBMovie {
  runtime: number | null;
  tagline: string | null;
  genres: { id: number; name: string }[];
  production_companies: {
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }[];
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: {
    iso_639_1: string;
    english_name: string;
    name: string;
  }[];
  credits?: {
    crew: {
      job: string;
      department: string;
      name: string;
      profile_path: string | null;
    }[];
    cast: {
      name: string;
      character: string;
      order: number;
      profile_path: string | null;
    }[];
  };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: {
        type: number;
        release_date: string;
        certification: string;
      }[];
    }[];
  };
  alternative_titles?: {
    titles: { iso_3166_1: string; title: string; type: string }[];
  };
  keywords?: {
    keywords: { id: number; name: string }[];
  };
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface TMDBTVDetails extends TMDBTVShow {
  number_of_seasons: number;
  number_of_episodes: number;
  tagline: string | null;
  genres: { id: number; name: string }[];
  created_by: { name: string }[];
  status: string;
  seasons: {
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_path: string | null;
    overview: string;
  }[];
  production_companies: {
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }[];
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: {
    iso_639_1: string;
    english_name: string;
    name: string;
  }[];
  networks: {
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }[];
  origin_country: string[];
  credits?: {
    crew: {
      job: string;
      department: string;
      name: string;
      profile_path: string | null;
    }[];
    cast: {
      name: string;
      character: string;
      order: number;
      profile_path: string | null;
    }[];
  };
  alternative_titles?: {
    results: { iso_3166_1: string; title: string; type: string }[];
  };
  keywords?: {
    results: { id: number; name: string }[];
  };
}

export interface TMDBSearchResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBImage {
  file_path: string;
  aspect_ratio: number;
  /** Language code of any text embedded in the image — `null` means
      language-neutral (preferred for a clean backdrop). */
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
  width: number;
  height: number;
}

export interface TMDBImagesResponse {
  id: number;
  backdrops: TMDBImage[];
  posters: TMDBImage[];
  logos: TMDBImage[];
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
    language?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
      extraLarge?: string;
    };
    averageRating?: number;
    ratingsCount?: number;
    industryIdentifiers?: {
      type: string;
      identifier: string;
    }[];
    maturityRating?: "MATURE" | "NOT_MATURE";
  };
  accessInfo?: {
    viewability?: "NO_PAGES" | "PARTIAL" | "ALL_PAGES" | "UNKNOWN";
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
  /** Curated key art — preferred for the cinematic backdrop. */
  artworks?: { image_id: string }[];
  /** In-game frames — fallback when artworks is empty. */
  screenshots?: { image_id: string }[];
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
