"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

export default function LogEpisodeModal({
  title,
  seasonEpisodes,
  totalSeasons,
  initialSeason,
  initialEpisode,
  onClose,
  onSave,
}: {
  title: string;
  seasonEpisodes: Record<string, number> | null;
  totalSeasons: number;
  initialSeason?: number | null;
  initialEpisode?: number | null;
  onClose: () => void;
  onSave: (data: {
    season: number;
    episode: number;
    rating: number | null;
    review: string;
    is_favorite: boolean;
  }) => void;
}) {
  const seasonNumbers = seasonEpisodes
    ? Object.keys(seasonEpisodes)
        .map(Number)
        .sort((a, b) => a - b)
    : Array.from({ length: Math.max(totalSeasons, 1) }, (_, i) => i + 1);

  const [season, setSeason] = useState<number>(
    initialSeason ?? seasonNumbers[0] ?? 1
  );
  const [episode, setEpisode] = useState<number | null>(initialEpisode ?? null);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [manualEpisodeCount, setManualEpisodeCount] = useState<number>(0);

  const knownCount = seasonEpisodes?.[String(season)] ?? 0;
  const episodeCount = knownCount > 0 ? knownCount : manualEpisodeCount;

  function handleSave() {
    if (!episode) return;
    onSave({
      season,
      episode,
      rating: rating ? rating * 2 : null,
      review,
      is_favorite: isFavorite,
    });
  }

  return (
    <ModalWrapper title={`Log Episode — ${title}`} onClose={onClose}>
      <div className="space-y-5">
        {/* Season selector */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">Season</p>
          <div className="flex flex-wrap gap-2">
            {seasonNumbers.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSeason(s);
                  setEpisode(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  season === s
                    ? "bg-accent-tv/15 text-accent-tv border border-accent-tv/30"
                    : "border border-surface-border text-text-secondary hover:bg-surface-overlay"
                }`}
              >
                S{s}
              </button>
            ))}
          </div>
        </div>

        {/* Episode picker */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">Episode</p>
          {episodeCount === 0 ? (
            <input
              type="number"
              min={1}
              value={manualEpisodeCount || ""}
              onChange={(e) => setManualEpisodeCount(Number(e.target.value))}
              placeholder="Number of episodes in this season"
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          ) : (
            <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
              {Array.from({ length: episodeCount }, (_, i) => i + 1).map(
                (ep) => (
                  <button
                    key={ep}
                    onClick={() => setEpisode(ep)}
                    className={`flex h-9 items-center justify-center rounded-md text-xs font-medium transition-all ${
                      episode === ep
                        ? "bg-accent-tv text-white"
                        : "border border-surface-border text-text-muted hover:bg-surface-overlay hover:text-text-secondary"
                    }`}
                  >
                    {ep}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Rating */}
        {episode && (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                Episode rating
              </p>
              <StarRating value={rating} onChange={setRating} size={24} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">Review</p>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Thoughts on this episode..."
                rows={3}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-surface-border pt-4">
          <button
            type="button"
            onClick={() => setIsFavorite(!isFavorite)}
            disabled={!episode}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
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
            disabled={!episode}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
