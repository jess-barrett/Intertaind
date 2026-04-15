"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Plus, X } from "lucide-react";
import type { MediaItem, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { removeTopPick } from "@/app/actions/top-picks";
import TopPickModal from "@/components/modals/top-pick-modal";

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

const MAX_PICKS = 4;

export default function TopFiveGrid({
  topFives: initialTopFives,
  username,
  isOwner,
}: {
  topFives: Record<MediaType, MediaItem[]>;
  username: string;
  isOwner: boolean;
}) {
  const [topFives, setTopFives] = useState(initialTopFives);
  const [pickerType, setPickerType] = useState<MediaType | null>(null);

  function handleAdded(type: MediaType, item: MediaItem) {
    setTopFives((prev) => ({
      ...prev,
      [type]: [...prev[type], item],
    }));
    setPickerType(null);
  }

  function handleRemove(type: MediaType, mediaId: string) {
    setTopFives((prev) => ({
      ...prev,
      [type]: prev[type].filter((i) => i.id !== mediaId),
    }));
    removeTopPick(type, mediaId);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GRID_ORDER.map(({ type, label, shelfPath }) => {
          const items = topFives[type];
          const config = MEDIA_TYPE_CONFIG[type];
          const Icon = MEDIA_ICONS[type];
          const emptySlots = isOwner ? MAX_PICKS - items.length : 0;

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

              <div className="flex gap-2">
                {/* Existing picks */}
                {items.slice(0, MAX_PICKS).map((item) => (
                  <div key={item.id} className="group/pick relative flex-1">
                    <Link
                      href={`/media/${item.id}`}
                      className="shelf-item block"
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
                    {/* Remove button (owner only) */}
                    {isOwner && (
                      <button
                        onClick={() => handleRemove(type, item.id)}
                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised border border-surface-border text-text-muted opacity-0 transition-opacity hover:text-accent-movie group-hover/pick:opacity-100"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}

                {/* Placeholder "+" slots (owner only) */}
                {Array.from({ length: emptySlots }, (_, i) => (
                  <button
                    key={`empty-${i}`}
                    onClick={() => setPickerType(type)}
                    className="flex-1"
                  >
                    <div className="flex aspect-2/3 items-center justify-center rounded-lg border-2 border-dashed border-surface-border transition-colors hover:border-brand/40 hover:bg-surface-overlay">
                      <Plus
                        size={20}
                        className="text-text-muted transition-colors group-hover:text-brand"
                      />
                    </div>
                  </button>
                ))}

                {/* Visitor sees empty message if no picks and not owner */}
                {!isOwner && items.length === 0 && (
                  <p className="w-full py-6 text-center text-sm text-text-muted">
                    No top picks yet
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Picker modal */}
      {pickerType && (
        <TopPickModal
          mediaType={pickerType}
          existingIds={topFives[pickerType].map((i) => i.id)}
          onClose={() => setPickerType(null)}
          onAdded={(item) => handleAdded(pickerType, item)}
        />
      )}
    </>
  );
}
