import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Heart } from "lucide-react";
import type { MediaItem, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { StarRatingDisplay } from "@/components/star-rating";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function MediaCard({
  item,
  compact,
  userRating,
  userFavorite,
}: {
  item: MediaItem;
  compact?: boolean;
  userRating?: number | null;
  userFavorite?: boolean;
}) {
  const config = MEDIA_TYPE_CONFIG[item.media_type];
  const Icon = MEDIA_ICONS[item.media_type];

  return (
    <Link href={`/media/${item.id}`} className="group shelf-item block">
      <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised">
        {/* Cover image */}
        <div className="relative aspect-[2/3] bg-surface-overlay">
          {item.cover_image_url ? (
            <img
              src={item.cover_image_url}
              alt={item.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icon size={32} className={`${config.color} opacity-40`} />
            </div>
          )}

          {/* Media type icon tab — bottom-left with 45° corner cut */}
          <div
            className={`absolute bottom-0 left-0 flex items-center justify-center ${compact ? "h-6 w-6" : "h-8 w-8"} bg-surface-raised`}
            style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%, 100% 35%, 65% 0)" }}
          >
            <Icon size={compact ? 10 : 13} className={`${config.color} -translate-x-px translate-y-0.5`} />
          </div>
        </div>

        {/* Info — hidden in compact mode */}
        {!compact && (
          <div className="p-3">
            <h3 className="truncate text-sm font-medium text-text-primary group-hover:text-brand transition-colors">
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
