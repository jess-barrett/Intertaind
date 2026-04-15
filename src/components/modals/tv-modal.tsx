"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

export default function TVModal({
  title,
  totalSeasons,
  onClose,
  onSave,
  initial,
}: {
  title: string;
  totalSeasons: number;
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
  const existingSeasons =
    (initial?.progress?.seasons as Record<string, { rating: number | null; review: string; completed: boolean }>) ?? {};

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [seasonRating, setSeasonRating] = useState<number | null>(null);
  const [seasonReview, setSeasonReview] = useState("");
  const [seasons, setSeasons] = useState<
    Record<string, { rating: number | null; review: string; completed: boolean }>
  >(existingSeasons);
  const [isFavorite, setIsFavorite] = useState(initial?.is_favorite ?? false);

  const seasonCount = Math.max(totalSeasons, 1);
  const completedCount = Object.values(seasons).filter((s) => s.completed).length;
  const allCompleted = completedCount === seasonCount;

  function handleSelectSeason(num: number) {
    const existing = seasons[String(num)];
    setSelectedSeason(num);
    setSeasonRating(existing?.rating ? existing.rating / 2 : null);
    setSeasonReview(existing?.review ?? "");
  }

  function handleSaveSeason() {
    if (selectedSeason === null) return;
    setSeasons((prev) => ({
      ...prev,
      [String(selectedSeason)]: {
        rating: seasonRating ? seasonRating * 2 : null,
        review: seasonReview,
        completed: true,
      },
    }));
    setSelectedSeason(null);
    setSeasonRating(null);
    setSeasonReview("");
  }

  function handleSaveAll() {
    // Compute overall rating as average of season ratings
    const ratedSeasons = Object.values(seasons).filter((s) => s.rating !== null);
    const avgRating =
      ratedSeasons.length > 0
        ? Math.round(ratedSeasons.reduce((sum, s) => sum + (s.rating ?? 0), 0) / ratedSeasons.length)
        : null;

    onSave({
      status: allCompleted ? "completed" : "in_progress",
      rating: avgRating,
      review: "",
      is_favorite: isFavorite,
      progress: { seasons, current_season: completedCount + 1 },
      completed_at: allCompleted ? new Date().toISOString() : null,
    });
  }

  // Season detail view
  if (selectedSeason !== null) {
    return (
      <ModalWrapper title={`${title} — Season ${selectedSeason}`} onClose={onClose}>
        <div className="space-y-5">
          <button
            onClick={() => setSelectedSeason(null)}
            className="text-sm text-text-muted transition-colors hover:text-text-secondary"
          >
            &larr; All seasons
          </button>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Rating
            </label>
            <StarRating value={seasonRating} onChange={setSeasonRating} size={28} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Review
            </label>
            <textarea
              value={seasonReview}
              onChange={(e) => setSeasonReview(e.target.value)}
              placeholder="Thoughts on this season..."
              rows={3}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSeason}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Save season
            </button>
          </div>
        </div>
      </ModalWrapper>
    );
  }

  // Season picker view
  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-text-muted">
          Select a season to rate ({completedCount}/{seasonCount} logged)
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: seasonCount }, (_, i) => i + 1).map((num) => {
            const logged = !!seasons[String(num)]?.completed;
            return (
              <button
                key={num}
                onClick={() => handleSelectSeason(num)}
                className={`rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors ${
                  logged
                    ? "border-accent-tv/30 bg-accent-tv/10 text-accent-tv"
                    : "border-surface-border text-text-secondary hover:bg-surface-overlay"
                }`}
              >
                S{num}
                {logged && seasons[String(num)]?.rating && (
                  <span className="mt-0.5 block text-xs text-accent-game">
                    {((seasons[String(num)]?.rating ?? 0) / 2).toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer: heart + save */}
        <div className="flex items-center justify-between border-t border-surface-border pt-4">
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
            onClick={handleSaveAll}
            disabled={completedCount === 0}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
