"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { upsertMediaItem } from "@/app/actions/media";

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
      className="group shelf-item cursor-pointer"
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

          {/* Media type icon tab — bottom-left with 45° corner cut */}
          <div
            className="absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center bg-surface-raised"
            style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%, 100% 35%, 65% 0)" }}
          >
            <Icon size={13} className={`${config.color} -translate-x-px translate-y-0.5`} />
          </div>

        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {result.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            {result.release_date && (
              <span>{new Date(result.release_date).getFullYear()}</span>
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
