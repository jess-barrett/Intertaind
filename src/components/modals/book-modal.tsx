"use client";

import { useState } from "react";
import { BookOpen, Clock, Check, X, Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

type BookShelf = "tbr" | "currently_reading" | "finished" | "dnf";

const SHELF_OPTIONS: {
  key: BookShelf;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { key: "tbr", label: "To Be Read", icon: BookOpen, color: "text-brand-light" },
  { key: "currently_reading", label: "Currently Reading", icon: Clock, color: "text-accent-game" },
  { key: "finished", label: "Finished", icon: Check, color: "text-accent-book" },
  { key: "dnf", label: "Did Not Finish", icon: X, color: "text-accent-movie" },
];

export default function BookModal({
  title,
  onClose,
  onSave,
  initial,
}: {
  title: string;
  onClose: () => void;
  onSave: (data: {
    status: string;
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown>;
    started_at: string | null;
    completed_at: string | null;
  }) => void;
  initial?: {
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown> | null;
    started_at: string | null;
  };
}) {
  const initialShelf = (initial?.progress?.sub_shelf as BookShelf) ?? null;
  const [shelf, setShelf] = useState<BookShelf | null>(initialShelf);
  const today = new Date().toISOString().split("T")[0];
  const [dateStarted, setDateStarted] = useState(
    initial?.started_at?.split("T")[0] ?? today
  );
  const [currentPage, setCurrentPage] = useState(
    (initial?.progress?.current_page as number) ?? 0
  );
  const [isReread, setIsReread] = useState(
    (initial?.progress?.is_reread as boolean) ?? false
  );
  const [rating, setRating] = useState<number | null>(
    initial?.rating ? initial.rating / 2 : null
  );
  const [review, setReview] = useState(initial?.review ?? "");
  const [isFavorite, setIsFavorite] = useState(initial?.is_favorite ?? false);

  function handleSave() {
    if (!shelf) return;

    const statusMap: Record<BookShelf, string> = {
      tbr: "want",
      currently_reading: "in_progress",
      finished: "completed",
      dnf: "dropped",
    };

    onSave({
      status: statusMap[shelf],
      rating: rating ? rating * 2 : null,
      review,
      is_favorite: isFavorite,
      progress: {
        sub_shelf: shelf,
        ...(shelf === "currently_reading" ? { current_page: currentPage, is_reread: isReread } : {}),
      },
      started_at: shelf === "currently_reading" ? new Date(dateStarted).toISOString() : null,
      completed_at: shelf === "finished" ? new Date().toISOString() : null,
    });
  }

  // Step 1: pick a shelf
  if (!shelf) {
    return (
      <ModalWrapper title={title} onClose={onClose}>
        <p className="mb-4 text-sm text-text-muted">
          Which shelf should this go on?
        </p>
        <div className="space-y-2">
          {SHELF_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setShelf(opt.key)}
              className="flex w-full items-center gap-3 rounded-lg border border-surface-border px-4 py-3 text-left transition-colors hover:bg-surface-overlay"
            >
              <opt.icon size={18} className={opt.color} />
              <span className="text-sm font-medium text-text-primary">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </ModalWrapper>
    );
  }

  // Step 2: shelf-specific fields
  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        {/* Shelf indicator */}
        <button
          onClick={() => setShelf(null)}
          className="flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          &larr; {SHELF_OPTIONS.find((o) => o.key === shelf)?.label}
        </button>

        {/* TBR — no extra fields, just save */}
        {shelf === "tbr" && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Add to shelf
            </button>
          </div>
        )}

        {/* Currently Reading */}
        {shelf === "currently_reading" && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Date started
              </label>
              <input
                type="date"
                value={dateStarted}
                onChange={(e) => setDateStarted(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Current page
              </label>
              <input
                type="number"
                min={0}
                value={currentPage || ""}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                placeholder="0"
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isReread}
                onChange={(e) => setIsReread(e.target.checked)}
                className="h-4 w-4 rounded border-surface-border bg-surface-overlay accent-brand"
              />
              <span className="text-sm text-text-secondary">This is a reread</span>
            </label>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                Save
              </button>
            </div>
          </>
        )}

        {/* Finished or DNF */}
        {(shelf === "finished" || shelf === "dnf") && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Rating
              </label>
              <StarRating value={rating} onChange={setRating} size={28} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Review
              </label>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Your thoughts on this book..."
                rows={3}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isFavorite
                    ? "bg-accent-movie/10 text-accent-movie"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Heart size={16} className={isFavorite ? "fill-accent-movie" : ""} />
                {isFavorite ? "Loved" : "Love it?"}
              </button>

              <button
                onClick={handleSave}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}
