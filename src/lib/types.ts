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
  backdrop_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, unknown> | null;
  avg_rating: number | null;
  rating_count: number;
  tracking_count: number;
  /** Denormalized count of user_media rows with status='completed'. */
  completed_count: number;
  /** Denormalized count of user_media rows with status='in_progress'. */
  in_progress_count: number;
  favorites_count: number;
  lists_count: number;
  /** Denormalized count of recommendations rows with this media as
      `source_media_id` — i.e. how many users have recommended *something*
      to fans of this. Maintained by trigger. */
  recommendations_count: number;
  /** Denormalized count of recommendations rows with this media as
      `recommended_media_id` — i.e. how many users have recommended *this*
      to fans of something else. Maintained by trigger. */
  recommended_for_count: number;
  /** Books only — series identifier, prefixed by source: `gb:{id}` for
      Google Books native series, `ol:{slug}` for OpenLibrary-detected
      series. Null when the book isn't in a known series. */
  series_id: string | null;
  /** Human-readable series name, denormalized for display. */
  series_name: string | null;
  /** 1-based position within the series. */
  series_position: number | null;
  /** Series completion status — populated only when Wikidata has the
      data (no reliable signal from GB/OL). null when unknown. */
  series_status: "ongoing" | "complete" | "cancelled" | "hiatus" | null;
  created_at: string;
}

export interface SearchResult {
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  backdrop_url: string | null;
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
  followers_count: number;
  following_count: number;
  created_at: string;
}

export type NotificationType =
  | "follow"
  | "follow_request"
  | "follow_accepted";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string;
  read_at: string | null;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface FollowRequest {
  requester_id: string;
  target_id: string;
  created_at: string;
}

/** Viewer's relationship to a profile, for follow-button state. */
export type FollowState =
  | "self"
  | "none"
  | "following"
  | "requested"
  | "blocked_by_me";

export type ActivityType =
  | "added_to_shelf"
  | "completed"
  | "status_changed"
  | "reviewed"
  | "rated"
  | "favorited"
  | "removed"
  | "logged_episode"
  | "logged_season"
  | "started_reading"
  | "added_to_top"
  | "removed_from_top"
  | "created_list"
  | "liked_list"
  | "saved_list"
  | "recommended";

export interface Activity {
  id: string;
  user_id: string;
  media_id: string | null;
  activity_type: ActivityType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ActivityWithMedia = Activity & {
  media: Pick<MediaItem, "id" | "title" | "cover_image_url" | "media_type"> | null;
};

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

export type ListType =
  | "curated"
  | "if_you_liked"
  | "genre"
  | "vibe"
  | "mood"
  | "cross_media";

/** Source-media is required for these list types — the list is anchored
    on a specific title and doesn't make sense without one. */
export const LIST_TYPES_REQUIRING_SOURCE: ListType[] = ["if_you_liked", "vibe"];

/** Types the user can pick on the create form. `cross_media` is hidden
    (deprecated by the `media_types[]` field) but kept in the enum for
    older rows. */
export const SELECTABLE_LIST_TYPES: ListType[] = [
  "curated",
  "if_you_liked",
  "genre",
  "vibe",
  "mood",
];

export const LIST_TYPE_LABELS: Record<ListType, string> = {
  curated: "General",
  if_you_liked: "If you liked…",
  genre: "Genre",
  vibe: "Vibe",
  mood: "Mood",
  cross_media: "Cross-media",
};

export type ListVisibility =
  | "public"
  | "unlisted"
  | "friends_unlisted"
  | "private";

export const LIST_VISIBILITY_OPTIONS: {
  value: ListVisibility;
  label: string;
  help: string;
}[] = [
  {
    value: "public",
    label: "Anyone (Public List)",
    help: "Discoverable on /lists and in search; anyone can view.",
  },
  {
    value: "unlisted",
    label: "Anyone with the share link",
    help: "Hidden from discovery; anyone with the URL can view.",
  },
  {
    value: "friends_unlisted",
    label: "Friends (people you follow) with share link",
    help: "Hidden from discovery; viewable only by people you follow.",
  },
  {
    value: "private",
    label: "You (Private List)",
    help: "Only you can see this list.",
  },
];

export interface List {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  visibility: ListVisibility;
  list_type: ListType;
  media_types: MediaType[];
  source_media_id: string | null;
  tags: string[];
  like_count: number;
  saves_count: number;
  /** Denormalized count of list_items rows. */
  item_count: number;
  /** Denormalized count of list_comments rows. */
  comments_count: number;
  /** Toggled manually for editorial picks. Surfaces in Featured. */
  featured: boolean;
  /** When true, items render with a position-based rank badge and the
      sort dropdown is suppressed (position IS the order). */
  ranked: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  source_media?: MediaItem | null;
}

export interface ListItem {
  id: string;
  list_id: string;
  media_id: string;
  position: number;
  note: string | null;
  reason: string | null;
  created_at: string;
  media_items?: MediaItem;
}

export interface ListLike {
  user_id: string;
  list_id: string;
  created_at: string;
}

export interface ListComment {
  id: string;
  list_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  /** Author's profile, populated by joiner queries on the page. */
  profiles?: Profile;
}

export interface ListSave {
  user_id: string;
  list_id: string;
  created_at: string;
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

/** A one-shot "if you liked X, try Y" pairing. Lighter than a list:
    no title, no description, just a single source → target with an
    optional 280-char note. Surfaced on each media page. */
export interface Recommendation {
  id: string;
  user_id: string;
  source_media_id: string;
  recommended_media_id: string;
  note: string | null;
  created_at: string;
  /** Recommender profile, populated by joiner queries. */
  profiles?: Profile;
  /** The other media item — which side it represents depends on the
      query direction (target when listing recs FOR a source, source
      when listing recs OF a target). The fetch helpers narrow this. */
  source_media?: MediaItem;
  recommended_media?: MediaItem;
}

/** Recommendation hydrated for "show recs for THIS media as the source"
    — i.e. the target side is the interesting one. */
export type RecommendationWithTarget = Recommendation & {
  recommended_media: MediaItem;
  profiles: Profile;
};

/** Recommendation hydrated for the inverse view — "show recs where
    THIS media is the recommended target", so the source is what we
    want to render. */
export type RecommendationWithSource = Recommendation & {
  source_media: MediaItem;
  profiles: Profile;
};

// Shelf-name identifiers kept as-is (`__top5_*`) because they're stored in
// the `shelves.name` column for existing rows. Renaming the string would
// require a data migration; the *concept* is now "Top 4" but the storage
// key is just an opaque label.
export const TOP_4_SHELF_NAMES: Record<MediaType, string> = {
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
