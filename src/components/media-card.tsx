import { BookOpen, Film, Tv, Gamepad2, Heart, List, Eye } from "lucide-react";
import type {
  MediaItem,
  MediaType,
  SearchResult,
  UserMedia,
} from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { StarRatingDisplay } from "@/components/star-rating";
import CoverImage from "@/components/cover-image";
import MediaCardActions from "@/components/media-card-actions";
import MediaCardLink from "@/components/media-card-link";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function MediaCard({
  item,
  searchResult,
  compact,
  showStats,
  userRating,
  userFavorite,
  customCoverUrl,
  userMedia,
  topSlot,
}: {
  /** Existing media_items row. When present, the link goes straight to
      `/media/{id}`. */
  item?: MediaItem;
  /** TMDb-shaped result for items not yet in our DB. When present and
      `item` isn't, the card renders identically but the link upserts on
      click and then navigates. At least one of `item` or `searchResult`
      must be provided. */
  searchResult?: SearchResult;
  /** No text section below cover */
  compact?: boolean;
  /** Show stats row (tracking, lists, favorites) below cover, no title */
  showStats?: boolean;
  userRating?: number | null;
  userFavorite?: boolean;
  /** User-selected override for the cover image */
  customCoverUrl?: string | null;
  /** Existing tracking row — drives the hover action bar's initial state */
  userMedia?: UserMedia | null;
  /** Optional content rendered above the cover, inside the card border but
      outside the Link (so interactive widgets like inputs work). */
  topSlot?: React.ReactNode;
}) {
  // Pull display fields from whichever source is provided.
  const display = item
    ? {
        id: item.id,
        title: item.title,
        cover: item.cover_image_url,
        media_type: item.media_type,
        metadata: item.metadata,
        avg_rating: item.avg_rating,
        tracking_count: item.tracking_count,
        favorites_count: item.favorites_count,
        lists_count: item.lists_count,
        release_date: item.release_date,
      }
    : searchResult
      ? {
          id: undefined as string | undefined,
          title: searchResult.title,
          cover: searchResult.cover_image_url,
          media_type: searchResult.media_type,
          metadata: searchResult.metadata,
          avg_rating: null,
          tracking_count: 0,
          favorites_count: 0,
          lists_count: 0,
          release_date: searchResult.release_date,
        }
      : null;

  if (!display) return null;

  const config = MEDIA_TYPE_CONFIG[display.media_type];
  const Icon = MEDIA_ICONS[display.media_type];
  const showInfo = !compact && !showStats;
  const coverUrl = customCoverUrl ?? display.cover;
  const meta = (display.metadata ?? {}) as Record<string, unknown>;

  return (
    <div className="group shelf-item relative overflow-hidden rounded-sm border border-surface-border bg-surface-raised">
      {topSlot && (
        <div className="border-b border-surface-border">{topSlot}</div>
      )}
      {/* Cover area: clickable + slide-out actions overlaid as a sibling.
          MediaCardActions can't live inside a button (its own buttons
          would be invalid descendants), so we keep them as siblings and
          rely on `relative` parent + `absolute` positioning. */}
      <div className="relative aspect-2/3 bg-surface-overlay">
        <MediaCardLink
          mediaId={display.id}
          searchResult={!display.id ? searchResult : undefined}
          className="block h-full w-full"
        >
          <CoverImage
            src={coverUrl}
            alt={display.title}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center">
                <Icon size={32} className={`${config.color} opacity-40`} />
              </div>
            }
          />
        </MediaCardLink>

        <MediaCardActions
          mediaId={display.id}
          mediaType={display.media_type}
          mediaTitle={display.title}
          searchResult={searchResult}
          totalSeasons={
            (meta.number_of_seasons as number | undefined) ??
            (meta.seasons as number | undefined) ??
            1
          }
          seasonEpisodes={
            (meta.season_episodes as Record<string, number> | undefined) ?? null
          }
          totalPagesDefault={
            display.media_type === "book"
              ? (meta.page_count as number | undefined) ?? null
              : null
          }
          userMedia={userMedia}
          compact={compact}
        />
      </div>

      {/* Stats / info row — also clickable so the whole card area
          navigates the same as the cover. */}
      {(showStats || showInfo) && (
        <MediaCardLink
          mediaId={display.id}
          searchResult={!display.id ? searchResult : undefined}
          className="block"
        >
          {showStats && (
            <div className="flex items-center justify-around px-2 py-1.5 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <Eye size={10} />
                {(display.tracking_count ?? 0).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <List size={10} />
                {(display.lists_count ?? 0).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Heart size={10} />
                {(display.favorites_count ?? 0).toLocaleString()}
              </span>
            </div>
          )}

          {showInfo && (
            <div className="p-3">
              <h3 className="truncate text-sm font-normal text-text-primary group-hover:text-brand transition-colors duration-200">
                {display.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                {userRating ? (
                  <StarRatingDisplay value={userRating} size={10} />
                ) : display.avg_rating ? (
                  <StarRatingDisplay value={display.avg_rating} size={10} />
                ) : null}
                {userFavorite && (
                  <Heart size={10} className="fill-accent-movie text-accent-movie" />
                )}
                {display.release_date && (
                  <span>{new Date(display.release_date).getFullYear()}</span>
                )}
              </div>
            </div>
          )}
        </MediaCardLink>
      )}
    </div>
  );
}
