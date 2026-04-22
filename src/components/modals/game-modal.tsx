"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

type GameStatus =
  | "playing"
  | "completed"
  | "played"
  | "shelved"
  | "retired"
  | "abandoned";

const STATUS_OPTIONS: { key: GameStatus; label: string }[] = [
  { key: "playing", label: "Playing" },
  { key: "completed", label: "Completed" },
  { key: "played", label: "Played" },
  { key: "shelved", label: "Shelved" },
  { key: "retired", label: "Retired" },
  { key: "abandoned", label: "Abandoned" },
];

const GAME_STATUS_TO_TRACKING: Record<GameStatus, string> = {
  playing: "in_progress",
  completed: "completed",
  played: "completed",
  shelved: "on_hold",
  retired: "on_hold",
  abandoned: "dropped",
};

export default function GameModal({
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
  };
}) {
  const initialSubStatus = (initial?.progress?.sub_status as GameStatus) ?? "played";
  const initialHoursPlayed =
    (initial?.progress?.hours_played as number)?.toString() ?? "";
  const initialRating = initial?.rating ? initial.rating / 2 : null;
  const initialReview = initial?.review ?? "";
  const initialFavorite = initial?.is_favorite ?? false;
  const [gameStatus, setGameStatus] = useState<GameStatus>(initialSubStatus);
  const [hoursPlayed, setHoursPlayed] = useState<string>(initialHoursPlayed);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [review, setReview] = useState(initialReview);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);

  // Disable Save until something differs from the loaded values, so opening
  // the modal and clicking Save without edits doesn't generate a noisy
  // activity row.
  const isDirty =
    gameStatus !== initialSubStatus ||
    hoursPlayed !== initialHoursPlayed ||
    rating !== initialRating ||
    review !== initialReview ||
    isFavorite !== initialFavorite;

  function handleSave() {
    const trackingStatus = GAME_STATUS_TO_TRACKING[gameStatus];

    onSave({
      status: trackingStatus,
      rating: rating ? rating * 2 : null,
      review,
      is_favorite: isFavorite,
      progress: {
        sub_status: gameStatus,
        ...(hoursPlayed ? { hours_played: parseFloat(hoursPlayed) } : {}),
      },
      started_at: gameStatus === "playing" ? new Date().toISOString() : null,
      completed_at:
        gameStatus === "completed" || gameStatus === "played"
          ? new Date().toISOString()
          : null,
    });
  }

  return (
    <ModalWrapper title={title} onClose={onClose}>
      <div className="space-y-5">
        {/* Play Status */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Play Status
          </label>
          <select
            value={gameStatus}
            onChange={(e) => setGameStatus(e.target.value as GameStatus)}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Hours Played */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Hours Played
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={hoursPlayed}
            onChange={(e) => setHoursPlayed(e.target.value)}
            placeholder="0"
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {/* Rating */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Your Rating
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
            placeholder="Write a review..."
            rows={3}
            className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {/* Footer: Love + Save */}
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
