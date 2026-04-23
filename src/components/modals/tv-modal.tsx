"use client";

import { useState } from "react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

export default function TVModal({
  title,
  totalSeasons,
  onClose,
  onSave,
  initial,
  initialSelectedSeason,
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
    activity_type_override?: string;
    activity_metadata_extra?: Record<string, unknown>;
  }) => void;
  initial?: {
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown> | null;
  };
  /** Jump straight into the rating/review form for this season. */
  initialSelectedSeason?: number | null;
}) {
  const existingSeasons =
    (initial?.progress?.seasons as Record<string, { rating: number | null; review: string; completed: boolean }>) ?? {};

  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    initialSelectedSeason ?? null
  );
  const initialPrefilled = initialSelectedSeason != null
    ? existingSeasons[String(initialSelectedSeason)]
    : undefined;
  const [seasonRating, setSeasonRating] = useState<number | null>(
    initialPrefilled?.rating ? initialPrefilled.rating / 2 : null
  );
  const [seasonReview, setSeasonReview] = useState(
    initialPrefilled?.review ?? ""
  );
  const [seasons, setSeasons] = useState<
    Record<string, { rating: number | null; review: string; completed: boolean }>
  >(existingSeasons);
  // Carry the existing favorite state through unchanged — the button has
  // been removed but we don't want to overwrite an existing favorite.
  const isFavorite = initial?.is_favorite ?? false;
  // Remember the season the user most recently saved so we can surface it
  // as a "logged_season" activity row with its specific rating/review.
  const [lastLoggedSeason, setLastLoggedSeason] = useState<number | null>(null);

  const seasonCount = Math.max(totalSeasons, 1);
  const completedCount = Object.values(seasons).filter((s) => s.completed).length;
  const allCompleted = completedCount === seasonCount;
  // Disable Save until the seasons map differs from what we loaded — opening
  // and closing without changes shouldn't fire a fresh activity row.
  const isDirty = JSON.stringify(seasons) !== JSON.stringify(existingSeasons);

  function handleSelectSeason(num: number) {
    const existing = seasons[String(num)];
    setSelectedSeason(num);
    setSeasonRating(existing?.rating ? existing.rating / 2 : null);
    setSeasonReview(existing?.review ?? "");
  }

  function handleSaveSeason() {
    if (selectedSeason === null) return;
    const updatedEntry = {
      rating: seasonRating ? seasonRating * 2 : null,
      review: seasonReview,
      completed: true,
    };
    const updatedSeasons = {
      ...seasons,
      [String(selectedSeason)]: updatedEntry,
    };
    setSeasons(updatedSeasons);
    setLastLoggedSeason(selectedSeason);

    // If the modal opened pre-selected to a specific season (e.g. from
    // the end-of-season celebration popup), saving that season IS the
    // commit — no sense bouncing back to the grid just to click Save
    // again. Commit directly using the freshly-updated map so we don't
    // read a stale `seasons` value before React flushes setState.
    if (initialSelectedSeason === selectedSeason) {
      commit(updatedSeasons, selectedSeason);
      return;
    }

    setSelectedSeason(null);
    setSeasonRating(null);
    setSeasonReview("");
  }

  function handleSaveAll() {
    commit(seasons, lastLoggedSeason);
  }

  function commit(
    seasonsMap: Record<
      string,
      { rating: number | null; review: string; completed: boolean }
    >,
    lastLogged: number | null
  ) {
    const seasonValues = Object.values(seasonsMap);
    const completed = seasonValues.filter((s) => s.completed).length;
    const all = completed === seasonCount;

    const ratedSeasons = seasonValues.filter((s) => s.rating !== null);
    const avgRating =
      ratedSeasons.length > 0
        ? Math.round(
            ratedSeasons.reduce((sum, s) => sum + (s.rating ?? 0), 0) /
              ratedSeasons.length
          )
        : null;

    const seasonKey = lastLogged !== null ? String(lastLogged) : null;
    const seasonData = seasonKey ? seasonsMap[seasonKey] : null;
    const seasonReviewText = seasonData?.review?.trim() ?? "";
    const hasSeasonReview = seasonReviewText.length > 0;
    const overrideExtras: Record<string, unknown> | undefined =
      lastLogged !== null
        ? {
            season: lastLogged,
            ...(seasonData?.rating != null
              ? { rating: seasonData.rating }
              : {}),
            ...(hasSeasonReview
              ? {
                  review_length: seasonReviewText.length,
                  review_text: seasonReviewText,
                }
              : {}),
            ...(isFavorite ? { is_favorite: true } : {}),
          }
        : undefined;

    onSave({
      status: all ? "completed" : "in_progress",
      rating: avgRating,
      review: "",
      is_favorite: isFavorite,
      progress: { seasons: seasonsMap, current_season: completed + 1 },
      completed_at: all ? new Date().toISOString() : null,
      ...(lastLogged !== null
        ? {
            activity_type_override: "logged_season",
            activity_metadata_extra: overrideExtras,
          }
        : {}),
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
              className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSeason}
              className="rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
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
                className={`rounded-sm border px-3 py-3 text-center text-sm font-medium transition-colors ${
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

        {/* Footer */}
        <div className="flex justify-end border-t border-surface-border pt-4">
          <button
            onClick={handleSaveAll}
            disabled={completedCount === 0 || !isDirty}
            className="rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50 disabled:hover:bg-brand"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
