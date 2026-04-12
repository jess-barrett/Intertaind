import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Star } from "lucide-react";
import type { MediaItem, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function MediaCard({ item }: { item: MediaItem }) {
  const config = MEDIA_TYPE_CONFIG[item.media_type];
  const Icon = MEDIA_ICONS[item.media_type];

  return (
    <Link href={`/media/${item.id}`} className="group shelf-item block">
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
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

          {/* Media type badge */}
          <div
            className={`absolute top-2 left-2 flex items-center gap-1 rounded-md ${config.bg} px-2 py-0.5`}
          >
            <Icon size={12} className={config.color} />
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="truncate text-sm font-medium text-text-primary group-hover:text-brand transition-colors">
            {item.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            {item.avg_rating && (
              <span className="flex items-center gap-0.5">
                <Star size={10} className="fill-accent-game text-accent-game" />
                {item.avg_rating.toFixed(1)}
              </span>
            )}
            {item.release_date && (
              <span>{new Date(item.release_date).getFullYear()}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
