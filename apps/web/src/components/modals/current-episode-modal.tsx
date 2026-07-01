"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import ModalWrapper from "./modal-wrapper";
import StarRating from "@/components/star-rating";

export default function CurrentEpisodeModal({
  title,
  seasonEpisodes,
  totalSeasons,
  initialSeason,
  initialEpisode,
  onClose,
  onSave,
}: {
  title: string;
  /** Per-season episode counts: { "1": 9, "2": 10 } */
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
  // Build available seasons from metadata, falling back to totalSeasons range
  const seasonNumbers = seasonEpisodes
    ? Object.keys(seasonEpisodes)
        .map(Number)
        .sort((a, b) => a - b)
    : Array.from({ length: Math.max(totalSeasons, 1) }, (_, i) => i + 1);

  const [selectedSeason, setSelectedSeason] = useState<number>(
    initialSeason ?? seasonNumbers[0] ?? 1
  );
  const [currentEpisode, setCurrentEpisode] = useState<number | null>(
    initialEpisode ?? null
  );
  const [manualEpisodeCount, setManualEpisodeCount] = useState<number>(0);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");

  const knownCount = seasonEpisodes?.[String(selectedSeason)] ?? 0;
  const episodeCount = knownCount > 0 ? knownCount : manualEpisodeCount;

  function handleEpisodeClick(ep: number) {
    setCurrentEpisode(ep);
  }

  function handleSave() {
    if (!currentEpisode) return;
    onSave({
      season: selectedSeason,
      episode: currentEpisode,
      rating,
      review: review.trim(),
      is_favorite: false,
    });
  }

  return (
    <ModalWrapper title={`${title} — Current Episode`} onClose={onClose}>
      <div className="space-y-5">
        {/* Season selector */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">Season</p>
          <div className="flex flex-wrap gap-2">
            {seasonNumbers.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSelectedSeason(s);
                  setCurrentEpisode(null);
                }}
                className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSeason === s
                    ? "bg-accent-tv/15 text-accent-tv border border-accent-tv/30"
                    : "border border-surface-border text-text-secondary hover:bg-surface-overlay"
                }`}
              >
                S{s}
              </button>
            ))}
          </div>
        </div>

        {/* Episode grid or manual entry */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">
            Season {selectedSeason} — pick your current episode
          </p>

          {episodeCount === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Episode count not available. How many episodes does this season
                have?
              </p>
              <input
                type="number"
                min={1}
                value={manualEpisodeCount || ""}
                onChange={(e) =>
                  setManualEpisodeCount(Number(e.target.value))
                }
                placeholder="Number of episodes"
                className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>
          ) : (
            <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
              {Array.from({ length: episodeCount }, (_, i) => i + 1).map(
                (ep) => {
                  const isWatched =
                    currentEpisode !== null && ep < currentEpisode;
                  const isCurrent = currentEpisode === ep;
                  return (
                    <button
                      key={ep}
                      onClick={() => handleEpisodeClick(ep)}
                      className={`relative flex h-9 items-center justify-center rounded-sm text-xs font-medium transition-all ${
                        isCurrent
                          ? "bg-brand text-white ring-2 ring-brand-light"
                          : isWatched
                            ? "bg-accent-tv/20 text-accent-tv"
                            : "border border-surface-border text-text-muted hover:bg-surface-overlay hover:text-text-secondary"
                      }`}
                    >
                      {isWatched && (
                        <Check
                          size={10}
                          className="absolute top-0.5 right-0.5 text-accent-tv"
                        />
                      )}
                      {ep}
                    </button>
                  );
                }
              )}
            </div>
          )}

          {currentEpisode && (
            <p className="mt-3 text-xs text-text-muted">
              Marking episodes 1–{currentEpisode - 1} as watched, episode{" "}
              {currentEpisode} as your current episode.
            </p>
          )}
        </div>

        {/* Rate this season */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">
            Rate this season (optional)
          </p>
          <StarRating value={rating} onChange={setRating} size={20} />
        </div>

        {/* Review */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">
            Review (optional)
          </p>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={4}
            placeholder="What did you think of this season?"
            className="w-full resize-none rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={!currentEpisode}
            className="rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
