import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Heart, List, Eye } from "lucide-react";
import type { MediaItem, MediaType, UserMedia } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { StarRatingDisplay } from "@/components/star-rating";
import CoverImage from "@/components/cover-image";
import MediaCardActions from "@/components/media-card-actions";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function MediaCard({
  item,
  compact,
  showStats,
  userRating,
  userFavorite,
  customCoverUrl,
  userMedia,
}: {
  item: MediaItem;
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
}) {
  const config = MEDIA_TYPE_CONFIG[item.media_type];
  const Icon = MEDIA_ICONS[item.media_type];
  const showInfo = !compact && !showStats;
  const coverUrl = customCoverUrl ?? item.cover_image_url;

  return (
    <Link href={`/media/${item.id}`} className="group shelf-item relative block">
      <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised">
        {/* Cover image */}
        <div className="relative aspect-2/3 bg-surface-overlay">
          <CoverImage
            src={coverUrl}
            alt={item.title}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center">
                <Icon size={32} className={`${config.color} opacity-40`} />
              </div>
            }
          />

          <MediaCardActions
            mediaId={item.id}
            mediaType={item.media_type}
            mediaTitle={item.title}
            totalSeasons={
              (item.metadata?.number_of_seasons as number | undefined) ??
              (item.metadata?.seasons as number | undefined) ??
              1
            }
            seasonEpisodes={
              (item.metadata?.season_episodes as Record<string, number> | undefined) ?? null
            }
            userMedia={userMedia}
            compact={compact}
          />
        </div>

        {/* Stats row — replaces the title/info section */}
        {showStats && (
          <div className="flex items-center justify-around px-2 py-1.5 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <Eye size={10} />
              {(item.tracking_count ?? 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <List size={10} />
              {(item.lists_count ?? 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Heart size={10} />
              {(item.favorites_count ?? 0).toLocaleString()}
            </span>
          </div>
        )}

        {/* Full info (title + rating/year) */}
        {showInfo && (
          <div className="p-3">
            <h3 className="truncate text-sm font-normal text-text-primary group-hover:text-brand transition-colors duration-200">
              {item.title}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
              {userRating ? (
                <StarRatingDisplay value={userRating} size={10} />
              ) : item.avg_rating ? (
                <StarRatingDisplay value={item.avg_rating} size={10} />
              ) : null}
              {userFavorite && (
                <Heart size={10} className="fill-accent-movie text-accent-movie" />
              )}
              {item.release_date && (
                <span>{new Date(item.release_date).getFullYear()}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
