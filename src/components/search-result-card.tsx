"use client";

import { useState, useTransition } from "react";
import { BookOpen, Film, Tv, Gamepad2, Plus, Check, Loader2 } from "lucide-react";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { quickAddMedia } from "@/app/actions/media";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

export default function SearchResultCard({ result }: { result: SearchResult }) {
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const config = MEDIA_TYPE_CONFIG[result.media_type];
  const Icon = MEDIA_ICONS[result.media_type];

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        await quickAddMedia(result);
        setAdded(true);
      } catch {
        // Could show error toast in the future
      }
    });
  }

  return (
    <div className="group shelf-item">
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
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

          {/* Type badge */}
          <div
            className={`absolute top-2 left-2 flex items-center gap-1 rounded-md ${config.bg} px-2 py-0.5`}
          >
            <Icon size={12} className={config.color} />
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            disabled={added || isPending}
            className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full transition-all ${
              added
                ? "bg-accent-book text-white"
                : "bg-brand text-white opacity-0 group-hover:opacity-100 hover:bg-brand-dark"
            }`}
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : added ? (
              <Check size={14} />
            ) : (
              <Plus size={14} />
            )}
          </button>
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
