"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import type { MediaItem, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { getUserLibrary, addTopPick } from "@/app/actions/top-picks";

export default function TopPickModal({
  mediaType,
  existingIds,
  onClose,
  onAdded,
}: {
  mediaType: MediaType;
  existingIds: string[];
  onClose: () => void;
  onAdded: (item: MediaItem) => void;
}) {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const config = MEDIA_TYPE_CONFIG[mediaType];

  useEffect(() => {
    getUserLibrary(mediaType).then((items) => {
      setLibrary(items);
      setLoading(false);
    });
  }, [mediaType]);

  function handleSelect(item: MediaItem) {
    setSavingId(item.id);
    startTransition(async () => {
      await addTopPick(mediaType, item.id);
      onAdded(item);
    });
  }

  const alreadyAdded = new Set(existingIds);

  return (
    <ModalWrapper
      title={`Add to Top ${config.label}`}
      onClose={onClose}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      ) : library.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-muted">
            No {config.label.toLowerCase()} in your library yet.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Search and add some first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {library.map((item) => {
            const isAdded = alreadyAdded.has(item.id);
            const isSaving = savingId === item.id;

            return (
              <button
                key={item.id}
                onClick={() => !isAdded && handleSelect(item)}
                disabled={isAdded || isPending}
                className="group relative text-left disabled:opacity-60"
              >
                <div className="aspect-2/3 overflow-hidden rounded-lg border border-surface-border bg-surface-overlay transition-all group-hover:border-brand/40">
                  {item.cover_image_url ? (
                    <img
                      src={item.cover_image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-surface-overlay">
                      <span className="text-xs text-text-muted">
                        No cover
                      </span>
                    </div>
                  )}

                  {/* Added overlay */}
                  {isAdded && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <Check size={20} className="text-accent-book" />
                    </div>
                  )}

                  {/* Saving spinner */}
                  {isSaving && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <Loader2
                        size={20}
                        className="animate-spin text-white"
                      />
                    </div>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-text-secondary">
                  {item.title}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </ModalWrapper>
  );
}
