import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import type { MediaItem, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

const GRID_ORDER: { type: MediaType; label: string; shelfPath: string }[] = [
  { type: "movie", label: "Top Movies", shelfPath: "movies" },
  { type: "book", label: "Top Books", shelfPath: "books" },
  { type: "tv_show", label: "Top Shows", shelfPath: "tv-shows" },
  { type: "video_game", label: "Top Games", shelfPath: "games" },
];

export default function TopFiveGrid({
  topFives,
  username,
}: {
  topFives: Record<MediaType, MediaItem[]>;
  username: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GRID_ORDER.map(({ type, label, shelfPath }) => {
        const items = topFives[type];
        const config = MEDIA_TYPE_CONFIG[type];
        const Icon = MEDIA_ICONS[type];

        return (
          <div key={type} className="glass p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={14} className={config.color} />
                <span className={`text-sm font-semibold ${config.color}`}>
                  {label}
                </span>
              </div>
              <Link
                href={`/u/${username}/${shelfPath}`}
                className="text-xs text-text-muted transition-colors hover:text-text-secondary"
              >
                View all &rarr;
              </Link>
            </div>

            {items.length > 0 ? (
              <div className="flex gap-2">
                {items.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={`/media/${item.id}`}
                    className="shelf-item block flex-1"
                  >
                    <div className="aspect-2/3 overflow-hidden rounded-lg border border-surface-border bg-surface-overlay">
                      {item.cover_image_url ? (
                        <img
                          src={item.cover_image_url}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Icon
                            size={16}
                            className={`${config.color} opacity-30`}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">
                No top picks yet
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
