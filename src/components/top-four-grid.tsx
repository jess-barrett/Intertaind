"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Plus, X } from "lucide-react";
import type { MediaItem, MediaType, UserMedia } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { removeTopPick } from "@/app/actions/top-picks";
import TopPickModal from "@/components/modals/top-pick-modal";
import MediaCardActions from "@/components/media-card-actions";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

const GRID_ORDER: MediaType[] = ["movie", "book", "tv_show", "video_game"];

const MAX_PICKS = 4;

export default function TopFourGrid({
  topFours: initialTopFours,
  displayName,
  isOwner,
  viewerTracking,
}: {
  topFours: Record<MediaType, MediaItem[]>;
  displayName: string;
  isOwner: boolean;
  /** Viewer's own tracking rows, keyed by media_id. Used to seed the
      MediaCardActions slideout on non-owner views so the viewer can
      add the profile owner's favorites to their own library. */
  viewerTracking?: Record<string, UserMedia>;
}) {
  const [topFours, setTopFours] = useState(initialTopFours);
  const [pickerType, setPickerType] = useState<MediaType | null>(null);

  function handleAdded(type: MediaType, item: MediaItem) {
    setTopFours((prev) => ({
      ...prev,
      [type]: [...prev[type], item],
    }));
    setPickerType(null);
  }

  function handleRemove(type: MediaType, mediaId: string) {
    setTopFours((prev) => ({
      ...prev,
      [type]: prev[type].filter((i) => i.id !== mediaId),
    }));
    removeTopPick(type, mediaId);
  }

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        {displayName}&apos;s <span className="text-brand">Are You Not Intertaind</span> Favorites
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {GRID_ORDER.map((type, idx) => {
          const items = topFours[type];
          const config = MEDIA_TYPE_CONFIG[type];
          const Icon = MEDIA_ICONS[type];
          const emptySlots = MAX_PICKS - items.length;
          // Dividers form a "+" between the four cells. Mobile is a single
          // column so only bottom borders between stacked cells.
          const dividerCls = [
            "border-surface-border",
            idx === 0 && "border-b sm:border-r",
            idx === 1 && "border-b",
            idx === 2 && "border-b sm:border-b-0 sm:border-r",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={type} className={`p-4 ${dividerCls}`}>
              <div className="flex gap-2">
                {/* Existing picks */}
                {items.slice(0, MAX_PICKS).map((item) => {
                  const meta = (item.metadata ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const viewerUm = viewerTracking?.[item.id];
                  return (
                    <div
                      key={item.id}
                      className="group group/pick relative flex-1"
                    >
                      <Link
                        href={`/media/${item.id}`}
                        className="shelf-item block"
                      >
                        <div className="relative aspect-2/3 overflow-hidden rounded-lg border border-surface-border bg-surface-overlay">
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
                          {/* Hover slideout — only when viewing someone
                              else's favorites. Owners see the remove X
                              instead. */}
                          {!isOwner && (
                            <MediaCardActions
                              mediaId={item.id}
                              mediaType={item.media_type}
                              mediaTitle={item.title}
                              totalSeasons={
                                (meta.number_of_seasons as number | undefined) ??
                                (meta.seasons as number | undefined) ??
                                1
                              }
                              seasonEpisodes={
                                (meta.season_episodes as
                                  | Record<string, number>
                                  | undefined) ?? null
                              }
                              totalPagesDefault={
                                item.media_type === "book"
                                  ? (meta.page_count as number | undefined) ??
                                    null
                                  : null
                              }
                              userMedia={viewerUm ?? null}
                              compact
                            />
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
                  );
                })}

                {/* Empty slots. Interactive "+" for the owner, non-interactive
                    dashed placeholder for visitors so picks stay left-aligned
                    and don't stretch to fill the row. */}
                {Array.from({ length: emptySlots }, (_, i) =>
                  isOwner ? (
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
                  ) : (
                    <div key={`empty-${i}`} className="flex-1">
                      <div className="aspect-2/3 rounded-lg border-2 border-dashed border-surface-border/60" />
                    </div>
                  ),
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
          existingIds={topFours[pickerType].map((i) => i.id)}
          onClose={() => setPickerType(null)}
          onAdded={(item) => handleAdded(pickerType, item)}
        />
      )}
    </>
  );
}
