export type MediaType =
  | "book"
  | "movie"
  | "tv_show"
  | "video_game";

export type TrackingStatus =
  | "want"
  | "in_progress"
  | "completed"
  | "dropped"
  | "on_hold";

export interface MediaItem {
  id: string;
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, unknown> | null;
  avg_rating: number | null;
  rating_count: number;
  tracking_count: number;
  favorites_count: number;
  lists_count: number;
  created_at: string;
}

export interface SearchResult {
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, string | number>;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  created_at: string;
}

export interface UserMedia {
  id: string;
  user_id: string;
  media_id: string;
  status: TrackingStatus;
  rating: number | null;
  review: string | null;
  is_favorite: boolean;
  started_at: string | null;
  completed_at: string | null;
  progress: Record<string, unknown> | null;
  created_at: string;
  media_items?: MediaItem;
}

export interface List {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  like_count: number;
  created_at: string;
  profiles?: Profile;
}

export interface ListItem {
  id: string;
  list_id: string;
  media_id: string;
  position: number;
  note: string | null;
  media_items?: MediaItem;
}

export interface Shelf {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  position: number;
  created_at: string;
}

export interface ShelfItem {
  id: string;
  shelf_id: string;
  media_id: string;
  position: number;
  note: string | null;
  media_items?: MediaItem;
}

export const TOP_5_SHELF_NAMES: Record<MediaType, string> = {
  movie: "__top5_movie",
  tv_show: "__top5_tv_show",
  book: "__top5_book",
  video_game: "__top5_video_game",
};

export const MEDIA_TYPE_CONFIG: Record<
  MediaType,
  { label: string; color: string; bg: string }
> = {
  book: { label: "Books", color: "text-accent-book", bg: "bg-accent-book/10" },
  movie: { label: "Movies", color: "text-accent-movie", bg: "bg-accent-movie/10" },
  tv_show: { label: "TV Shows", color: "text-accent-tv", bg: "bg-accent-tv/10" },
  video_game: { label: "Games", color: "text-accent-game", bg: "bg-accent-game/10" },
};
