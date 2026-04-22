"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Heart,
  Bookmark,
  Check,
  Clock,
  Tv,
  Gamepad2,
  BookOpen,
  MessageSquare,
  History,
  ChevronDown,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import type { MediaType, TrackingStatus, UserMedia } from "@/lib/types";
import { trackMedia, toggleFavorite, rateMedia } from "@/app/actions/media";
import StarRating from "@/components/star-rating";
import MovieModal from "@/components/modals/movie-modal";
import TVModal from "@/components/modals/tv-modal";
import BookModal from "@/components/modals/book-modal";
import GameModal from "@/components/modals/game-modal";
import CurrentEpisodeModal from "@/components/modals/current-episode-modal";
import LogEpisodeModal from "@/components/modals/log-episode-modal";
import CoverPickerModal from "@/components/modals/cover-picker-modal";

// Genre-specific config for the action panel
interface ActionConfig {
  primaryLabel: string;
  primaryIcon: React.ElementType;
  primaryStatus: TrackingStatus;
  secondaryPrimary?: {
    label: string;
    icon: React.ElementType;
    status: TrackingStatus;
  };
  wantLabel: string;
  logLabel: string;
}

const ACTION_CONFIG: Record<MediaType, ActionConfig> = {
  movie: {
    primaryLabel: "Watched",
    primaryIcon: Eye,
    primaryStatus: "completed",
    wantLabel: "Watchlist",
    logLabel: "Review or log...",
  },
  tv_show: {
    primaryLabel: "Watched",
    primaryIcon: Eye,
    primaryStatus: "completed",
    secondaryPrimary: {
      label: "Watching",
      icon: Tv,
      status: "in_progress",
    },
    wantLabel: "Watchlist",
    logLabel: "Log a season...",
  },
  book: {
    primaryLabel: "Read",
    primaryIcon: Check,
    primaryStatus: "completed",
    wantLabel: "Want to Read",
    logLabel: "Review or shelve...",
  },
  video_game: {
    primaryLabel: "Played",
    primaryIcon: Gamepad2,
    primaryStatus: "completed",
    wantLabel: "Wishlist",
    logLabel: "Log game...",
  },
};

type GameStatus =
  | "playing"
  | "completed"
  | "played"
  | "shelved"
  | "retired"
  | "abandoned";

const GAME_STATUSES: { key: GameStatus; label: string; desc: string; tracking: TrackingStatus }[] = [
  { key: "playing", label: "Playing", desc: "Currently playing", tracking: "in_progress" },
  { key: "completed", label: "Completed", desc: "Finished main objective", tracking: "completed" },
  { key: "played", label: "Played", desc: "Played, not specific", tracking: "completed" },
  { key: "shelved", label: "Shelved", desc: "Paused, may return", tracking: "on_hold" },
  { key: "retired", label: "Retired", desc: "No longer playing", tracking: "on_hold" },
  { key: "abandoned", label: "Abandoned", desc: "Won't pick back up", tracking: "dropped" },
];

function GameStatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: GameStatus | "";
  onChange: (status: GameStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = GAME_STATUSES.find((s) => s.key === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm transition-colors hover:border-brand/40 disabled:opacity-50"
      >
        <span className={current ? "text-text-primary" : "text-text-muted"}>
          {current ? current.label : "Set status..."}
        </span>
        <ChevronDown size={14} className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-surface-border bg-surface-raised py-1 shadow-xl shadow-black/40">
          {GAME_STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                onChange(s.key);
                setOpen(false);
              }}
              className={`flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-surface-overlay ${
                value === s.key ? "bg-surface-overlay" : ""
              }`}
            >
              <span className="text-sm font-medium text-text-primary">{s.label}</span>
              <span className="text-xs text-text-muted">{s.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaDetailClient({
  mediaId,
  mediaType,
  mediaTitle,
  totalSeasons,
  seasonEpisodes,
  userMedia,
  isLoggedIn,
  defaultCoverUrl,
  currentCoverUrl,
  authorName,
}: {
  mediaId: string;
  mediaType: MediaType;
  mediaTitle: string;
  totalSeasons: number;
  seasonEpisodes: Record<string, number> | null;
  userMedia: UserMedia | null;
  isLoggedIn: boolean;
  defaultCoverUrl: string | null;
  currentCoverUrl: string | null;
  authorName?: string;
}) {
  const cfg = ACTION_CONFIG[mediaType];

  const [status, setStatus] = useState<TrackingStatus | null>(
    userMedia?.status ?? null
  );
  const [userMediaId, setUserMediaId] = useState<string | null>(
    userMedia?.id ?? null
  );
  const [isFavorite, setIsFavorite] = useState(
    userMedia?.is_favorite ?? false
  );
  const [gameStatus, setGameStatus] = useState<GameStatus | "">(
    (userMedia?.progress as Record<string, unknown>)?.sub_status as GameStatus ?? ""
  );
  const [rating, setRating] = useState<number | null>(
    userMedia?.rating ? userMedia.rating / 2 : null
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEpisodeModalOpen, setCurrentEpisodeModalOpen] = useState(false);
  const [logEpisodeModalOpen, setLogEpisodeModalOpen] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const userProgress = (userMedia?.progress as Record<string, unknown>) ?? {};
  const initialCurrentSeason = userProgress.current_season as number | undefined;
  const initialCurrentEpisode = userProgress.current_episode as number | undefined;

  if (!isLoggedIn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-muted">
          <Link href="/login" className="text-brand hover:text-brand-light">
            Sign in
          </Link>{" "}
          to track, rate, and review.
        </p>
      </div>
    );
  }

  function handleGameStatusChange(newGameStatus: GameStatus) {
    const entry = GAME_STATUSES.find((s) => s.key === newGameStatus);
    if (!entry) return;
    setGameStatus(newGameStatus);
    setStatus(entry.tracking);
    startTransition(async () => {
      const id = await trackMedia(mediaId, entry.tracking, {
        progress: { sub_status: newGameStatus },
      });
      setUserMediaId(id);
      router.refresh();
    });
  }

  const isPrimary = status === cfg.primaryStatus;
  const isSecondary = cfg.secondaryPrimary
    ? status === cfg.secondaryPrimary.status
    : false;
  const isWant = status === "want";

  function handleStatusToggle(targetStatus: TrackingStatus) {
    const isActive = status === targetStatus;
    const newStatus = isActive ? null : targetStatus;
    setStatus(newStatus);
    startTransition(async () => {
      if (newStatus) {
        const id = await trackMedia(mediaId, newStatus);
        setUserMediaId(id);
      } else {
        await trackMedia(mediaId, "want" as TrackingStatus);
        setStatus(null);
      }
      router.refresh();
    });
  }

  function handleWantToggle() {
    const newStatus = isWant ? null : ("want" as TrackingStatus);
    setStatus(newStatus);
    startTransition(async () => {
      if (newStatus) {
        const id = await trackMedia(mediaId, "want" as TrackingStatus);
        setUserMediaId(id);
      }
      router.refresh();
    });
  }

  function handleFavoriteToggle() {
    if (!userMediaId) {
      // Need to track first
      startTransition(async () => {
        const id = await trackMedia(mediaId, cfg.primaryStatus);
        setUserMediaId(id);
        setStatus(cfg.primaryStatus);
        const val = await toggleFavorite(id);
        setIsFavorite(val);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      const val = await toggleFavorite(userMediaId);
      setIsFavorite(val);
      router.refresh();
    });
  }

  function handleRatingChange(newRating: number | null) {
    setRating(newRating);
    startTransition(async () => {
      let id = userMediaId;
      if (!id) {
        id = await trackMedia(mediaId, cfg.primaryStatus, {
          rating: newRating ? newRating * 2 : null,
        });
        setUserMediaId(id);
        setStatus(cfg.primaryStatus);
      } else {
        await rateMedia(id, newRating ? newRating * 2 : null);
      }
      router.refresh();
    });
  }

  function handleModalSave(data: {
    status: string;
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown>;
    started_at?: string | null;
    completed_at?: string | null;
    activity_type_override?: string;
    activity_metadata_extra?: Record<string, unknown>;
  }) {
    setModalOpen(false);
    startTransition(async () => {
      const id = await trackMedia(mediaId, data.status as TrackingStatus, {
        rating: data.rating,
        review: data.review,
        is_favorite: data.is_favorite,
        progress: data.progress,
        started_at: data.started_at,
        completed_at: data.completed_at,
        activity_type_override: data.activity_type_override,
        activity_metadata_extra: data.activity_metadata_extra,
      });
      setUserMediaId(id);
      setStatus(data.status as TrackingStatus);
      setRating(data.rating ? data.rating / 2 : null);
      setIsFavorite(data.is_favorite);
      // Sync game sub_status dropdown to whatever the modal saved
      const subStatus = data.progress?.sub_status as GameStatus | undefined;
      if (subStatus) setGameStatus(subStatus);
      router.refresh();
    });
  }

  const PrimaryIcon = cfg.primaryIcon;

  return (
    <>
      <div className="space-y-3">
        {/* Game-specific: custom status dropdown */}
        {mediaType === "video_game" ? (
          <GameStatusDropdown
            value={gameStatus}
            onChange={handleGameStatusChange}
            disabled={isPending}
          />
        ) : (
          <>
            {/* Primary action(s): Watching/Watched for TV, single for others */}
            {cfg.secondaryPrimary ? (
              <div className="flex gap-1">
                <button
                  onClick={() => handleStatusToggle(cfg.primaryStatus)}
                  disabled={isPending}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition-colors ${
                    isPrimary
                      ? "bg-accent-book/15 text-accent-book"
                      : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
                  } disabled:opacity-50`}
                >
                  <PrimaryIcon size={14} className="shrink-0" />
                  {cfg.primaryLabel}
                </button>
                <button
                  onClick={() => {
                    if (mediaType === "tv_show") {
                      setCurrentEpisodeModalOpen(true);
                    } else {
                      handleStatusToggle(cfg.secondaryPrimary!.status);
                    }
                  }}
                  disabled={isPending}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition-colors ${
                    isSecondary
                      ? "bg-accent-tv/15 text-accent-tv"
                      : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
                  } disabled:opacity-50`}
                >
                  <cfg.secondaryPrimary.icon size={14} className="shrink-0" />
                  {cfg.secondaryPrimary.label}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStatusToggle(cfg.primaryStatus)}
                disabled={isPending}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isPrimary
                    ? "bg-accent-book/15 text-accent-book"
                    : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
                } disabled:opacity-50`}
              >
                {mediaType === "book" ? (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isPrimary
                      ? "border-accent-book bg-accent-book text-white"
                      : "border-current"
                  }`}>
                    <PrimaryIcon size={12} />
                  </span>
                ) : (
                  <PrimaryIcon size={16} className="shrink-0" />
                )}
                {cfg.primaryLabel}
              </button>
            )}

          </>
        )}

        {/* Love */}
        <button
          onClick={handleFavoriteToggle}
          disabled={isPending}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isFavorite
              ? "bg-accent-movie/15 text-accent-movie"
              : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
          } disabled:opacity-50`}
        >
          <Heart size={16} className={isFavorite ? "fill-accent-movie" : ""} />
          Loved
        </button>

        {/* Watchlist / Want / Wishlist */}
        <button
          onClick={handleWantToggle}
          disabled={isPending}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isWant
              ? "bg-brand/15 text-brand-light"
              : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
          } disabled:opacity-50`}
        >
          <Bookmark size={16} className={isWant ? "fill-brand-light" : ""} />
          {cfg.wantLabel}
        </button>

        {/* Log buttons — TV gets split, others get single */}
        {mediaType === "tv_show" ? (
          <div className="flex gap-1">
            <button
              onClick={() => setModalOpen(true)}
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
            >
              <MessageSquare size={14} className="shrink-0" />
              Log Season
            </button>
            <button
              onClick={() => setLogEpisodeModalOpen(true)}
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
            >
              <MessageSquare size={14} className="shrink-0" />
              Log Episode
            </button>
          </div>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            disabled={isPending}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
          >
            <MessageSquare size={16} />
            {cfg.logLabel}
          </button>
        )}

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Inline star rating */}
        <div className="px-1">
          <StarRating
            value={rating}
            onChange={handleRatingChange}
            disabled={isPending}
            size={20}
            showClear
          />
        </div>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Show your activity */}
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <History size={16} />
          Show your activity
        </button>

        {/* Change cover — books only, tracked only */}
        {mediaType === "book" && userMediaId && (
          <button
            onClick={() => setCoverModalOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <ImageIcon size={16} />
            Change cover
          </button>
        )}
      </div>

      {/* Modals */}
      {modalOpen && renderModal()}

      {currentEpisodeModalOpen && mediaType === "tv_show" && (
        <CurrentEpisodeModal
          title={mediaTitle}
          seasonEpisodes={seasonEpisodes}
          totalSeasons={totalSeasons}
          initialSeason={initialCurrentSeason}
          initialEpisode={initialCurrentEpisode}
          onClose={() => setCurrentEpisodeModalOpen(false)}
          onSave={({ season, episode, rating: r, review, is_favorite }) => {
            setCurrentEpisodeModalOpen(false);
            const watched: Record<string, number[]> = {
              ...(userProgress.watched_episodes as Record<string, number[]> | undefined),
            };
            watched[String(season)] = Array.from({ length: episode - 1 }, (_, i) => i + 1);
            const hasReview = !!(review && review.trim().length > 0);
            startTransition(async () => {
              const id = await trackMedia(mediaId, "in_progress", {
                progress: {
                  ...userProgress,
                  current_season: season,
                  current_episode: episode,
                  watched_episodes: watched,
                },
                is_favorite: is_favorite || isFavorite,
                activity_type_override: "logged_season",
                activity_metadata_extra: {
                  season,
                  episode,
                  ...(r != null ? { rating: r } : {}),
                  ...(hasReview
                    ? { review_length: review.length, review_text: review }
                    : {}),
                  ...(is_favorite ? { is_favorite: true } : {}),
                },
              });
              setUserMediaId(id);
              setStatus("in_progress");
              if (is_favorite) setIsFavorite(true);
              router.refresh();
            });
          }}
        />
      )}

      {logEpisodeModalOpen && mediaType === "tv_show" && (
        <LogEpisodeModal
          title={mediaTitle}
          seasonEpisodes={seasonEpisodes}
          totalSeasons={totalSeasons}
          initialSeason={initialCurrentSeason}
          initialEpisode={initialCurrentEpisode}
          onClose={() => setLogEpisodeModalOpen(false)}
          onSave={({ season, episode, rating, review, is_favorite }) => {
            setLogEpisodeModalOpen(false);
            // Append episode to watched_episodes for this season
            const watched: Record<string, number[]> = {
              ...(userProgress.watched_episodes as Record<string, number[]> | undefined),
            };
            const seasonKey = String(season);
            const existing = new Set(watched[seasonKey] ?? []);
            existing.add(episode);
            watched[seasonKey] = Array.from(existing).sort((a, b) => a - b);

            // Store per-episode log
            const episodeLogs =
              (userProgress.episode_logs as Record<string, Record<string, { rating: number | null; review: string }>>) ??
              {};
            if (!episodeLogs[seasonKey]) episodeLogs[seasonKey] = {};
            episodeLogs[seasonKey][String(episode)] = { rating, review };

            // Advance current_episode to the next one in the same season.
            // If we just logged the season finale, jump to episode 1 of the next season.
            // If there's no next season, mark the show as completed.
            const seasonEpCount = seasonEpisodes?.[seasonKey] ?? 0;
            let nextSeason = season;
            let nextEpisode: number | null = episode + 1;
            let newStatus: TrackingStatus = status ?? "in_progress";

            if (seasonEpCount > 0 && episode >= seasonEpCount) {
              const nextSeasonNum = season + 1;
              const nextSeasonHasEps = seasonEpisodes?.[String(nextSeasonNum)] ?? 0;
              if (nextSeasonHasEps > 0) {
                nextSeason = nextSeasonNum;
                nextEpisode = 1;
              } else {
                // Series finale — mark as completed
                nextEpisode = episode;
                newStatus = "completed";
              }
            }

            const hasReview = !!(review && review.trim().length > 0);
            startTransition(async () => {
              const id = await trackMedia(mediaId, newStatus, {
                is_favorite: is_favorite || isFavorite,
                progress: {
                  ...userProgress,
                  current_season: nextSeason,
                  current_episode: nextEpisode,
                  watched_episodes: watched,
                  episode_logs: episodeLogs,
                },
                completed_at: newStatus === "completed" ? new Date().toISOString() : null,
                activity_type_override: "logged_episode",
                activity_metadata_extra: {
                  season,
                  episode,
                  ...(rating != null ? { rating } : {}),
                  ...(hasReview
                    ? { review_length: review.length, review_text: review }
                    : {}),
                  ...(is_favorite ? { is_favorite: true } : {}),
                },
              });
              setUserMediaId(id);
              setStatus(newStatus);
              if (is_favorite) setIsFavorite(true);
              router.refresh();
            });
          }}
        />
      )}

      {coverModalOpen && userMediaId && (
        <CoverPickerModal
          userMediaId={userMediaId}
          title={mediaTitle}
          author={authorName}
          currentCoverUrl={currentCoverUrl}
          defaultCoverUrl={defaultCoverUrl}
          onClose={() => setCoverModalOpen(false)}
          onSaved={() => {
            setCoverModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );

  function renderModal() {
    const initial = userMedia
      ? {
          rating: userMedia.rating,
          review: userMedia.review ?? "",
          is_favorite: userMedia.is_favorite,
          progress: userMedia.progress,
          started_at: userMedia.started_at,
          completed_at: userMedia.completed_at,
        }
      : undefined;

    switch (mediaType) {
      case "movie":
        return (
          <MovieModal
            title={mediaTitle}
            onClose={() => setModalOpen(false)}
            onSave={handleModalSave}
            initial={initial}
          />
        );
      case "tv_show":
        return (
          <TVModal
            title={mediaTitle}
            totalSeasons={totalSeasons}
            onClose={() => setModalOpen(false)}
            onSave={handleModalSave}
            initial={initial}
          />
        );
      case "book":
        return (
          <BookModal
            title={mediaTitle}
            onClose={() => setModalOpen(false)}
            onSave={handleModalSave}
            initial={initial}
          />
        );
      case "video_game":
        return (
          <GameModal
            title={mediaTitle}
            onClose={() => setModalOpen(false)}
            onSave={handleModalSave}
            initial={initial}
          />
        );
    }
  }
}
