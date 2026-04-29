"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { upsertMediaItem } from "@/app/actions/media";
import MediaCardActions from "@/components/media-card-actions";
import { yearFromDateString } from "@/lib/time";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function SearchResultCard({ result }: { result: SearchResult }) {
  const [navigating, setNavigating] = useState(false);
  const config = MEDIA_TYPE_CONFIG[result.media_type];
  const Icon = MEDIA_ICONS[result.media_type];
  const router = useRouter();

  async function handleClick() {
    if (navigating) return;
    setNavigating(true);
    try {
      const mediaId = await upsertMediaItem(result);
      router.push(`/media/${mediaId}`);
    } catch {
      setNavigating(false);
    }
  }

  return (
    <div
      className="group shelf-item relative cursor-pointer"
      onClick={handleClick}
    >
      <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised">
        {/* Cover */}
        <div className="relative aspect-2/3 bg-surface-overlay">
          {result.cover_image_url ? (
            <img
              src={result.cover_image_url}
              alt={result.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icon size={32} className={`${config.color} opacity-40`} />
            </div>
          )}

          <MediaCardActions
            mediaType={result.media_type}
            mediaTitle={result.title}
            searchResult={result}
            totalSeasons={
              (result.metadata?.number_of_seasons as number | undefined) ??
              (result.metadata?.seasons as number | undefined) ??
              1
            }
            seasonEpisodes={
              (result.metadata?.season_episodes as Record<string, number> | undefined) ?? null
            }
          />
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {result.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            {result.release_date && (
              <span>{yearFromDateString(result.release_date)}</span>
            )}
            {result.media_type === "book" &&
              Array.isArray(result.metadata?.authors) &&
              result.metadata.authors.length > 0 ? (
                <span className="truncate">
                  {(result.metadata.authors as string[])[0]}
                </span>
              ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
