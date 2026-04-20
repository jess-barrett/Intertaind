"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import { setCustomCover } from "@/app/actions/media";

type CoverOption = {
  volumeId: string;
  coverUrl: string;
  publisher: string | null;
  publishedDate: string | null;
  language: string | null;
};

export default function CoverPickerModal({
  userMediaId,
  title,
  author,
  currentCoverUrl,
  defaultCoverUrl,
  onClose,
  onSaved,
}: {
  userMediaId: string;
  title: string;
  author?: string;
  /** The cover currently displayed (either custom or default) */
  currentCoverUrl: string | null;
  /** The default cover (without user override) */
  defaultCoverUrl: string | null;
  onClose: () => void;
  onSaved: (newCoverUrl: string | null) => void;
}) {
  const [options, setOptions] = useState<CoverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams({ title });
    if (author) params.set("author", author);
    fetch(`/api/book-covers?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOptions(data);
      })
      .finally(() => setLoading(false));
  }, [title, author]);

  function handlePick(coverUrl: string) {
    startTransition(async () => {
      await setCustomCover(userMediaId, coverUrl);
      onSaved(coverUrl);
    });
  }

  function handleReset() {
    startTransition(async () => {
      await setCustomCover(userMediaId, null);
      onSaved(null);
    });
  }

  return (
    <ModalWrapper title="Choose cover" onClose={onClose}>
      <div className="space-y-4">
        {defaultCoverUrl && (
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <p className="text-xs text-text-muted">
              Using default cover? Reset to restore.
            </p>
            <button
              onClick={handleReset}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
            >
              <RotateCcw size={12} />
              Reset to default
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : options.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            No alternative covers found.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {options.map((opt) => {
              const isSelected = opt.coverUrl === currentCoverUrl;
              return (
                <button
                  key={opt.volumeId}
                  onClick={() => handlePick(opt.coverUrl)}
                  disabled={isPending}
                  className={`group relative overflow-hidden rounded-md border-2 transition-colors ${
                    isSelected
                      ? "border-brand"
                      : "border-surface-border hover:border-brand/40"
                  } disabled:opacity-50`}
                >
                  <div className="aspect-2/3 bg-surface-overlay">
                    <img
                      src={opt.coverUrl}
                      alt={opt.publisher ?? ""}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {opt.publishedDate && (
                    <div className="bg-surface-raised px-2 py-1 text-[10px] text-text-muted">
                      <p className="truncate">{opt.publisher ?? "—"}</p>
                      <p className="truncate">
                        {new Date(opt.publishedDate).getFullYear() || opt.publishedDate}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
