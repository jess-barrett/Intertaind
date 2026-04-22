"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

export default function MovieModal({
  title,
  onClose,
  onSave,
  initial,
}: {
  title: string;
  onClose: () => void;
  onSave: (data: {
    status: "completed";
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: { watched_on: string; is_rewatch: boolean };
    completed_at: string;
  }) => void;
  initial?: {
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown> | null;
    completed_at: string | null;
  };
}) {
  const today = new Date().toISOString().split("T")[0];
  const initialWatchedOn =
    (initial?.progress?.watched_on as string) ??
    initial?.completed_at?.split("T")[0] ??
    today;
  const initialIsRewatch = (initial?.progress?.is_rewatch as boolean) ?? false;
  // Convert DB rating (1-10) to star rating (0.5-5.0)
  const initialRating = initial?.rating ? initial.rating / 2 : null;
  const initialReview = initial?.review ?? "";
  const initialFavorite = initial?.is_favorite ?? false;
  const [watchedOn, setWatchedOn] = useState(initialWatchedOn);
  const [isRewatch, setIsRewatch] = useState(initialIsRewatch);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [review, setReview] = useState(initialReview);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);

  const isDirty =
    watchedOn !== initialWatchedOn ||
    isRewatch !== initialIsRewatch ||
    rating !== initialRating ||
    review !== initialReview ||
    isFavorite !== initialFavorite;

  function handleSave() {
    onSave({
      status: "completed",
      rating: rating ? rating * 2 : null,
      review,
      is_favorite: isFavorite,
      progress: { watched_on: watchedOn, is_rewatch: isRewatch },
      completed_at: new Date(watchedOn).toISOString(),
    });
  }

  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        {/* Watched on */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Watched on
          </label>
          <input
            type="date"
            value={watchedOn}
            onChange={(e) => setWatchedOn(e.target.value)}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </div>

        {/* Rewatch */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRewatch}
            onChange={(e) => setIsRewatch(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-overlay accent-brand"
          />
          <span className="text-sm text-text-secondary">
            I&apos;ve watched this before
          </span>
        </label>

        {/* Rating */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Rating
          </label>
          <StarRating value={rating} onChange={setRating} size={28} />
        </div>

        {/* Review */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Review
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="What did you think?"
            rows={3}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {/* Footer: heart + save */}
        <div className="flex items-center justify-between pt-2">
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
