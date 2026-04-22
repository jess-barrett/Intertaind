"use client";

import { useState } from "react";
import { Check, X, Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

type BookShelf = "finished" | "dnf";

const SHELF_OPTIONS: {
  key: BookShelf;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
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
    completed_at: string | null;
  }) => void;
  initial?: {
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown> | null;
  };
}) {
  const initialShelf = (() => {
    const sub = initial?.progress?.sub_shelf as string | undefined;
    if (sub === "finished" || sub === "dnf") return sub;
    return null;
  })();
  const initialRating = initial?.rating ? initial.rating / 2 : null;
  const initialReview = initial?.review ?? "";
  const initialFavorite = initial?.is_favorite ?? false;
  const [shelf, setShelf] = useState<BookShelf | null>(initialShelf);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [review, setReview] = useState(initialReview);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);

  const isDirty =
    shelf !== initialShelf ||
    rating !== initialRating ||
    review !== initialReview ||
    isFavorite !== initialFavorite;

  function handleSave() {
    if (!shelf) return;

    const statusMap: Record<BookShelf, string> = {
      finished: "completed",
      dnf: "dropped",
    };

    onSave({
      status: statusMap[shelf],
      rating: rating ? rating * 2 : null,
      review,
      is_favorite: isFavorite,
      progress: { sub_shelf: shelf },
      completed_at: shelf === "finished" ? new Date().toISOString() : null,
    });
  }

  // Step 1: pick Finished or DNF
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
              className="flex w-full items-center gap-3 rounded-sm border border-surface-border px-4 py-3 text-left transition-colors hover:bg-surface-overlay"
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

  // Step 2: rating + review fields
  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        <button
          onClick={() => setShelf(null)}
          className="flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          &larr; {SHELF_OPTIONS.find((o) => o.key === shelf)?.label}
        </button>

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
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <div
          className={`flex items-center pt-2 ${
            shelf === "dnf" ? "justify-end" : "justify-between"
          }`}
        >
          {/* Love button only for Finished — DNF shouldn't be loved. */}
          {shelf === "finished" && (
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm transition-colors ${
                isFavorite
                  ? "bg-accent-movie/10 text-accent-movie"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Heart size={16} className={isFavorite ? "fill-accent-movie" : ""} />
              {isFavorite ? "Loved" : "Love it?"}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50 disabled:hover:bg-brand"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
