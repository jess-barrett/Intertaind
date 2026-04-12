"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Trash2 } from "lucide-react";
import type { TrackingStatus, UserMedia } from "@/lib/types";
import {
  trackMedia,
  updateTrackingStatus,
  rateMedia,
  toggleFavorite,
  reviewMedia,
  removeTracking,
} from "@/app/actions/media";
import StatusBadge from "@/components/status-badge";
import RatingInput from "@/components/rating-input";
import Link from "next/link";

const STATUSES: { value: TrackingStatus; label: string }[] = [
  { value: "want", label: "Want" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
];

export default function MediaDetailClient({
  mediaId,
  userMedia,
  isLoggedIn,
}: {
  mediaId: string;
  userMedia: UserMedia | null;
  isLoggedIn: boolean;
}) {
  const [status, setStatus] = useState<TrackingStatus | null>(
    userMedia?.status ?? null
  );
  const [userMediaId, setUserMediaId] = useState<string | null>(
    userMedia?.id ?? null
  );
  const [rating, setRating] = useState<number | null>(
    userMedia?.rating ?? null
  );
  const [isFavorite, setIsFavorite] = useState(
    userMedia?.is_favorite ?? false
  );
  const [review, setReview] = useState(userMedia?.review ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!isLoggedIn) {
    return (
      <div className="glass p-4">
        <p className="text-sm text-text-secondary">
          <Link href="/login" className="text-brand hover:text-brand-light">
            Sign in
          </Link>{" "}
          to track this media, rate it, and write reviews.
        </p>
      </div>
    );
  }

  function handleStatusChange(newStatus: TrackingStatus) {
    setStatus(newStatus);
    startTransition(async () => {
      if (userMediaId) {
        await updateTrackingStatus(userMediaId, newStatus);
      } else {
        const id = await trackMedia(mediaId, newStatus);
        setUserMediaId(id);
      }
      router.refresh();
    });
  }

  function handleRate(newRating: number) {
    if (!userMediaId) return;
    setRating(newRating);
    startTransition(async () => {
      await rateMedia(userMediaId!, newRating);
      router.refresh();
    });
  }

  function handleToggleFavorite() {
    if (!userMediaId) return;
    startTransition(async () => {
      const newVal = await toggleFavorite(userMediaId!);
      setIsFavorite(newVal);
    });
  }

  function handleReviewSubmit() {
    if (!userMediaId || !review.trim()) return;
    startTransition(async () => {
      await reviewMedia(userMediaId!, review.trim());
      router.refresh();
    });
  }

  function handleRemove() {
    if (!userMediaId) return;
    startTransition(async () => {
      await removeTracking(userMediaId!);
      setStatus(null);
      setUserMediaId(null);
      setRating(null);
      setIsFavorite(false);
      setReview("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Status controls */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-text-muted">
          Tracking Status
        </h3>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              disabled={isPending}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                status === s.value
                  ? "bg-brand text-white"
                  : "bg-surface-overlay text-text-secondary border border-surface-border hover:bg-surface-border"
              } disabled:opacity-50`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rating + favorite (only show if tracking) */}
      {status && userMediaId && (
        <>
          <div>
            <h3 className="mb-3 text-sm font-medium text-text-muted">
              Your Rating
            </h3>
            <RatingInput
              value={rating}
              onChange={handleRate}
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleFavorite}
              disabled={isPending}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
                isFavorite
                  ? "bg-accent-movie/10 text-accent-movie"
                  : "bg-surface-overlay text-text-secondary border border-surface-border hover:bg-surface-border"
              } disabled:opacity-50`}
            >
              <Heart
                size={14}
                className={isFavorite ? "fill-accent-movie" : ""}
              />
              {isFavorite ? "Favorited" : "Favorite"}
            </button>

            <button
              onClick={handleRemove}
              disabled={isPending}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-accent-movie disabled:opacity-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          </div>

          {/* Review */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-text-muted">
              Review
            </h3>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Write your thoughts..."
              rows={4}
              className="w-full rounded-xl border border-surface-border bg-surface-overlay p-4 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
            <button
              onClick={handleReviewSubmit}
              disabled={isPending || !review.trim()}
              className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {userMedia?.review ? "Update review" : "Post review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
