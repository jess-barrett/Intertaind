"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  Heart,
  MoreHorizontal,
  BookOpen,
  BookOpenCheck,
  Bookmark,
  Film,
  Tv,
  TvMinimalPlay,
  Gamepad2,
  Swords,
  Check,
  Clapperboard,
  GalleryHorizontalEnd,
  Loader2,
  ExternalLink,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import type {
  MediaType,
  SearchResult,
  TrackingStatus,
  UserMedia,
} from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import {
  trackMedia,
  toggleFavorite,
  removeTracking,
  rateMedia,
  upsertMediaItem,
} from "@/app/actions/media";
import StarRating from "@/components/star-rating";
import MovieModal from "@/components/modals/movie-modal";
import TVModal from "@/components/modals/tv-modal";
import BookModal from "@/components/modals/book-modal";
import GameModal from "@/components/modals/game-modal";
import LogEpisodeModal from "@/components/modals/log-episode-modal";
import CurrentEpisodeModal from "@/components/modals/current-episode-modal";
import CurrentReadingModal from "@/components/modals/current-reading-modal";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

type GameStatus =
  | "playing"
  | "completed"
  | "played"
  | "shelved"
  | "retired"
  | "abandoned";

const GAME_STATUSES: {
  key: GameStatus;
  label: string;
  tracking: TrackingStatus;
}[] = [
  { key: "playing", label: "Playing", tracking: "in_progress" },
  { key: "completed", label: "Completed", tracking: "completed" },
  { key: "played", label: "Played", tracking: "completed" },
  { key: "shelved", label: "Shelved", tracking: "on_hold" },
  { key: "retired", label: "Retired", tracking: "on_hold" },
  { key: "abandoned", label: "Abandoned", tracking: "dropped" },
];

export default function MediaCardActions({
  mediaId: initialMediaId,
  mediaType,
  mediaTitle,
  searchResult,
  totalSeasons,
  seasonEpisodes,
  userMedia,
  totalPagesDefault,
  compact,
}: {
  mediaId?: string;
  mediaType: MediaType;
  mediaTitle: string;
  searchResult?: SearchResult;
  /** TV-only — needed by Log Season / Log Episode modals */
  totalSeasons?: number;
  seasonEpisodes?: Record<string, number> | null;
  /** Existing tracking row, if user already tracks this item */
  userMedia?: UserMedia | null;
  /** Book-only — Google Books page count used as Total pages placeholder */
  totalPagesDefault?: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const Icon = MEDIA_ICONS[mediaType];
  const config = MEDIA_TYPE_CONFIG[mediaType];

  const [mediaId, setMediaId] = useState<string | null>(initialMediaId ?? null);
  const [userMediaId, setUserMediaId] = useState<string | null>(
    userMedia?.id ?? null
  );
  const [status, setStatus] = useState<TrackingStatus | null>(
    userMedia?.status ?? null
  );
  const [favorite, setFavorite] = useState<boolean>(
    userMedia?.is_favorite ?? false
  );
  const [rating, setRating] = useState<number | null>(
    userMedia?.rating ? userMedia.rating / 2 : null
  );
  const [gameStatus, setGameStatus] = useState<GameStatus | "">(
    ((userMedia?.progress as Record<string, unknown> | null)
      ?.sub_status as GameStatus) ?? ""
  );
  const [progress, setProgress] = useState<Record<string, unknown>>(
    (userMedia?.progress as Record<string, unknown>) ?? {}
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const [movieModalOpen, setMovieModalOpen] = useState(false);
  const [tvModalOpen, setTvModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [logEpisodeModalOpen, setLogEpisodeModalOpen] = useState(false);
  const [currentEpisodeModalOpen, setCurrentEpisodeModalOpen] = useState(false);
  const [currentReadingModalOpen, setCurrentReadingModalOpen] = useState(false);

  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync local state from the userMedia prop when it changes. Other
  // components on the same card (e.g. TVProgressHeader's quick-log button)
  // trigger router.refresh after a server mutation — without this sync the
  // three-dots popup would keep showing the pre-refresh progress / status
  // / rating until the user navigates away.
  useEffect(() => {
    setUserMediaId(userMedia?.id ?? null);
    setStatus(userMedia?.status ?? null);
    setFavorite(userMedia?.is_favorite ?? false);
    setRating(userMedia?.rating ? userMedia.rating / 2 : null);
    setGameStatus(
      ((userMedia?.progress as Record<string, unknown> | null)
        ?.sub_status as GameStatus) ?? ""
    );
    setProgress((userMedia?.progress as Record<string, unknown>) ?? {});
  }, [userMedia]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setMenuOpen(false);
        setGameDropdownOpen(false);
      }
    }
    function onScrollOrResize() {
      // Close on scroll/resize rather than recompute — keeps things simple
      // and avoids the menu visibly drifting.
      setMenuOpen(false);
      setGameDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menuOpen]);

  function openMenu() {
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      // Anchor the bottom of the menu just above the top of the bar, aligned
      // to the bar's left edge.
      setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
    }
    setMenuOpen(true);
  }

  function stopLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function ensureMediaId(): Promise<string> {
    if (mediaId) return mediaId;
    if (!searchResult) throw new Error("No mediaId or searchResult provided");
    const newId = await upsertMediaItem(searchResult);
    setMediaId(newId);
    return newId;
  }

  function handleEye(e: React.MouseEvent) {
    stopLink(e);
    startTransition(async () => {
      try {
        if (status === "completed" && userMediaId) {
          await removeTracking(userMediaId);
          setUserMediaId(null);
          setStatus(null);
          setFavorite(false);
          setRating(null);
        } else {
          const id = await ensureMediaId();
          const umId = await trackMedia(id, "completed");
          setUserMediaId(umId);
          setStatus("completed");
        }
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleHeart(e: React.MouseEvent) {
    stopLink(e);
    startTransition(async () => {
      try {
        if (userMediaId) {
          await toggleFavorite(userMediaId);
          setFavorite(!favorite);
        } else {
          const id = await ensureMediaId();
          const umId = await trackMedia(id, "want", { is_favorite: true });
          setUserMediaId(umId);
          setStatus("want");
          setFavorite(true);
        }
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleStatusClick(newStatus: TrackingStatus) {
    // Toggle behavior for the "want" (Watchlist / TBR / Wishlist) buttons:
    // clicking while already on the wishlist removes the tracking entirely
    // so users can take it off without going to the media detail page.
    if (newStatus === "want" && status === "want" && userMediaId) {
      startTransition(async () => {
        try {
          await removeTracking(userMediaId);
          setUserMediaId(null);
          setStatus(null);
          setFavorite(false);
          setRating(null);
          router.refresh();
        } catch (err) {
          console.error(err);
        }
      });
      return;
    }
    startTransition(async () => {
      try {
        const id = await ensureMediaId();
        const umId = await trackMedia(id, newStatus);
        setUserMediaId(umId);
        setStatus(newStatus);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleGameStatusChange(newGameStatus: GameStatus) {
    const entry = GAME_STATUSES.find((s) => s.key === newGameStatus);
    if (!entry) return;
    setGameStatus(newGameStatus);
    setStatus(entry.tracking);
    setGameDropdownOpen(false);
    startTransition(async () => {
      try {
        const id = await ensureMediaId();
        const umId = await trackMedia(id, entry.tracking, {
          progress: { ...progress, sub_status: newGameStatus },
        });
        setUserMediaId(umId);
        setProgress((p) => ({ ...p, sub_status: newGameStatus }));
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleRate(newRating: number | null) {
    startTransition(async () => {
      try {
        // StarRating emits 0.5–5.0; DB stores 1–10.
        const dbRating = newRating ? newRating * 2 : null;
        if (userMediaId) {
          // Already tracking — standalone rate logs one "rated" activity.
          await rateMedia(userMediaId, dbRating);
        } else {
          // Not tracked yet — fold the rating into the initial trackMedia
          // call so we get one combined activity row instead of two.
          const id = await ensureMediaId();
          const umId = await trackMedia(id, "completed", { rating: dbRating });
          setUserMediaId(umId);
          setStatus("completed");
        }
        setRating(newRating);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  /** Save handler shared by Movie/TV/Book/Game modals (mirrors media-detail). */
  function handleModalSave(data: {
    status: string;
    rating?: number | null;
    review?: string;
    is_favorite?: boolean;
    progress: Record<string, unknown>;
    started_at?: string | null;
    completed_at?: string | null;
    activity_type_override?: string;
    activity_metadata_extra?: Record<string, unknown>;
  }) {
    setMovieModalOpen(false);
    setTvModalOpen(false);
    setBookModalOpen(false);
    setGameModalOpen(false);
    setCurrentReadingModalOpen(false);
    setMenuOpen(false);
    startTransition(async () => {
      try {
        const id = await ensureMediaId();
        const umId = await trackMedia(id, data.status as TrackingStatus, {
          rating: data.rating,
          review: data.review,
          is_favorite: data.is_favorite,
          progress: data.progress,
          started_at: data.started_at,
          completed_at: data.completed_at,
          activity_type_override: data.activity_type_override,
          activity_metadata_extra: data.activity_metadata_extra,
        });
        setUserMediaId(umId);
        setStatus(data.status as TrackingStatus);
        if (data.rating !== undefined) {
          setRating(data.rating ? data.rating / 2 : null);
        }
        if (data.is_favorite !== undefined) {
          setFavorite(data.is_favorite);
        }
        setProgress(data.progress);
        const sub = data.progress?.sub_status as GameStatus | undefined;
        if (sub) setGameStatus(sub);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleLogEpisodeSave({
    season,
    episode,
    rating: r,
    review,
    is_favorite,
  }: {
    season: number;
    episode: number;
    rating: number | null;
    review: string;
    is_favorite: boolean;
  }) {
    setLogEpisodeModalOpen(false);
    setMenuOpen(false);
    startTransition(async () => {
      try {
        const id = await ensureMediaId();
        const watched: Record<string, number[]> = {
          ...((progress.watched_episodes as Record<string, number[]>) ?? {}),
        };
        const seasonKey = String(season);
        const existing = new Set(watched[seasonKey] ?? []);
        existing.add(episode);
        watched[seasonKey] = Array.from(existing).sort((a, b) => a - b);

        const episodeLogs =
          (progress.episode_logs as Record<
            string,
            Record<string, { rating: number | null; review: string }>
          >) ?? {};
        if (!episodeLogs[seasonKey]) episodeLogs[seasonKey] = {};
        episodeLogs[seasonKey][String(episode)] = { rating: r, review };

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
            nextEpisode = episode;
            newStatus = "completed";
          }
        }

        const newProgress = {
          ...progress,
          current_season: nextSeason,
          current_episode: nextEpisode,
          watched_episodes: watched,
          episode_logs: episodeLogs,
        };

        const umId = await trackMedia(id, newStatus, {
          is_favorite: is_favorite || favorite,
          progress: newProgress,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
          activity_type_override: "logged_episode",
          activity_metadata_extra: {
            season,
            episode,
            ...(r != null ? { rating: r } : {}),
            ...(review && review.trim().length > 0
              ? { review_length: review.length, review_text: review }
              : {}),
            ...(is_favorite ? { is_favorite: true } : {}),
          },
        });
        setUserMediaId(umId);
        setStatus(newStatus);
        setProgress(newProgress);
        if (is_favorite) setFavorite(true);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleCurrentEpisodeSave({
    season,
    episode,
    rating: r,
    review,
    is_favorite,
  }: {
    season: number;
    episode: number;
    rating: number | null;
    review: string;
    is_favorite: boolean;
  }) {
    setCurrentEpisodeModalOpen(false);
    setMenuOpen(false);
    startTransition(async () => {
      try {
        const id = await ensureMediaId();
        const watched: Record<string, number[]> = {
          ...((progress.watched_episodes as Record<string, number[]>) ?? {}),
        };
        watched[String(season)] = Array.from(
          { length: episode - 1 },
          (_, i) => i + 1
        );
        const newProgress = {
          ...progress,
          current_season: season,
          current_episode: episode,
          watched_episodes: watched,
        };
        const hasReview = !!(review && review.trim().length > 0);
        const umId = await trackMedia(id, "in_progress", {
          progress: newProgress,
          is_favorite: is_favorite || favorite,
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
        setUserMediaId(umId);
        setStatus("in_progress");
        setProgress(newProgress);
        if (is_favorite) setFavorite(true);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  const iconBtnSize = compact ? 12 : 14;
  const containerH = compact ? "h-6" : "h-8";
  const iconOffset = compact ? 10 : 13;

  const watched = status === "completed";

  const modalInitial = userMedia
    ? {
        rating: userMedia.rating,
        review: userMedia.review ?? "",
        is_favorite: userMedia.is_favorite,
        progress: userMedia.progress,
        started_at: userMedia.started_at,
        completed_at: userMedia.completed_at,
      }
    : undefined;

  // Popup row class — shared button look
  const rowCls =
    "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50";

  return (
    <div ref={rootRef}>
      {/* Expanding bar. Shifted -1px on left/bottom so subpixel rounding
          on the aspect-2/3 container can't leak the cover image through.
          The card's outer overflow-hidden clips the overshoot. */}
      <div
        ref={barRef}
        className={`absolute -bottom-px -left-px flex items-center overflow-hidden bg-surface-raised transition-[width] duration-200 ease-out ${containerH} w-8 group-hover:w-27`}
        style={{
          clipPath:
            "polygon(0 0, 0 100%, 100% 100%, 100% 12px, calc(100% - 12px) 0)",
        }}
      >
        <div className={`flex ${containerH} w-8 shrink-0 items-center justify-center`}>
          <Icon
            size={iconOffset}
            className={`${config.color} -translate-x-px translate-y-0.5`}
          />
        </div>
        <div className="pointer-events-none flex flex-1 items-center justify-around opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:delay-100">
          <button
            type="button"
            onClick={handleEye}
            disabled={pending}
            aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-surface-overlay ${
              watched ? "text-accent-book" : "text-text-secondary"
            }`}
          >
            {watched ? (
              <Check size={iconBtnSize} />
            ) : mediaType === "book" ? (
              <BookOpenCheck size={iconBtnSize} />
            ) : mediaType === "video_game" ? (
              <Swords size={iconBtnSize} />
            ) : (
              <Eye size={iconBtnSize} />
            )}
          </button>
          <button
            type="button"
            onClick={handleHeart}
            disabled={pending}
            aria-label={favorite ? "Unfavorite" : "Favorite"}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-surface-overlay ${
              favorite ? "text-accent-movie" : "text-text-secondary"
            }`}
          >
            <Heart size={iconBtnSize} className={favorite ? "fill-current" : ""} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stopLink(e);
              if (menuOpen) {
                setMenuOpen(false);
                setGameDropdownOpen(false);
              } else {
                openMenu();
              }
            }}
            aria-label="More actions"
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-overlay"
          >
            <MoreHorizontal size={iconBtnSize} />
          </button>
        </div>
      </div>

      {pending && (
        <div className="pointer-events-none absolute right-1 top-1">
          <Loader2 size={12} className="animate-spin text-text-muted" />
        </div>
      )}

      {/* Popup menu — portaled to body so the card's overflow-hidden
          wrapper doesn't clip it. */}
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          onClick={stopLink}
          style={{
            position: "fixed",
            left: menuPos.left,
            bottom: menuPos.bottom,
          }}
          className="z-50 w-44 rounded-sm border border-surface-border bg-surface-raised p-1 shadow-xl shadow-black/40"
        >
          {mediaType === "movie" && (
            <>
              <StatusButton label="Watched" icon={Eye} active={status === "completed"} onClick={() => handleStatusClick("completed")} pending={pending} color={config.color} />
              <StatusButton label="Watchlist" icon={Bookmark} active={status === "want"} onClick={() => handleStatusClick("want")} pending={pending} color={config.color} />
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setMovieModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <MessageSquare size={12} />
                Review or log
              </button>
            </>
          )}

          {mediaType === "tv_show" && (
            <>
              <StatusButton label="Watched" icon={Eye} active={status === "completed"} onClick={() => handleStatusClick("completed")} pending={pending} color={config.color} />
              <StatusButton label="Currently Watching" icon={TvMinimalPlay} active={status === "in_progress"} onClick={() => handleStatusClick("in_progress")} pending={pending} color={config.color} />
              <StatusButton label="Watchlist" icon={Bookmark} active={status === "want"} onClick={() => handleStatusClick("want")} pending={pending} color={config.color} />
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setLogEpisodeModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <GalleryHorizontalEnd size={12} />
                Log episode
              </button>
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setTvModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <Clapperboard size={12} />
                Log season
              </button>
            </>
          )}

          {mediaType === "book" && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setCurrentReadingModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <BookOpen size={12} />
                Currently Reading
              </button>
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setBookModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <MessageSquare size={12} />
                Review
              </button>
            </>
          )}

          {mediaType === "video_game" && (
            <>
              {/* Game status dropdown */}
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setGameDropdownOpen((v) => !v);
                }}
                disabled={pending}
                className={`${rowCls} justify-between`}
              >
                <span className="flex items-center gap-2">
                  <Gamepad2 size={12} />
                  {gameStatus
                    ? GAME_STATUSES.find((s) => s.key === gameStatus)?.label
                    : "Set status"}
                </span>
                <ChevronDown
                  size={12}
                  className={`transition-transform ${gameDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {gameDropdownOpen && (
                <div className="ml-2 border-l border-surface-border pl-1">
                  {GAME_STATUSES.map((s) => (
                    <StatusButton
                      key={s.key}
                      label={s.label}
                      active={gameStatus === s.key}
                      onClick={() => handleGameStatusChange(s.key)}
                      pending={pending}
                      color={config.color}
                    />
                  ))}
                </div>
              )}
              <StatusButton label="Wishlist" icon={Bookmark} active={status === "want"} onClick={() => handleStatusClick("want")} pending={pending} color={config.color} />
              <button
                type="button"
                onClick={(e) => {
                  stopLink(e);
                  setMenuOpen(false);
                  setGameModalOpen(true);
                }}
                disabled={pending}
                className={rowCls}
              >
                <MessageSquare size={12} />
                Log game
              </button>
            </>
          )}

          <div className="my-1 border-t border-surface-border" />

          <div className="flex items-center justify-center px-2.5 py-0.5">
            <StarRating
              value={rating}
              onChange={handleRate}
              size={18}
              showClear={false}
            />
          </div>

          <div className="my-1 border-t border-surface-border" />

          {mediaId ? (
            <Link
              href={`/media/${mediaId}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <ExternalLink size={12} />
              View details
            </Link>
          ) : null}
        </div>,
        document.body
      )}

      {/* Modals — portaled to body so they live outside the card's
          <Link> tree. Each is wrapped in a div that stops click propagation
          since React events still bubble through the React tree even when
          the DOM is portaled (otherwise closing the modal navigates the
          user to the media page via the Link). */}
      {movieModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <MovieModal
              title={mediaTitle}
              onClose={() => setMovieModalOpen(false)}
              onSave={handleModalSave}
              initial={modalInitial}
            />
          </div>,
          document.body
        )}
      {tvModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <TVModal
              title={mediaTitle}
              totalSeasons={totalSeasons ?? 1}
              onClose={() => setTvModalOpen(false)}
              onSave={handleModalSave}
              initial={modalInitial}
            />
          </div>,
          document.body
        )}
      {bookModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <BookModal
              title={mediaTitle}
              onClose={() => setBookModalOpen(false)}
              onSave={handleModalSave}
              initial={modalInitial}
            />
          </div>,
          document.body
        )}
      {gameModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <GameModal
              title={mediaTitle}
              onClose={() => setGameModalOpen(false)}
              onSave={handleModalSave}
              initial={modalInitial}
            />
          </div>,
          document.body
        )}
      {logEpisodeModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <LogEpisodeModal
              title={mediaTitle}
              seasonEpisodes={seasonEpisodes ?? null}
              totalSeasons={totalSeasons ?? 1}
              initialSeason={progress.current_season as number | undefined}
              initialEpisode={progress.current_episode as number | undefined}
              watchedEpisodes={
                progress.watched_episodes as
                  | Record<string, number[]>
                  | undefined
              }
              onClose={() => setLogEpisodeModalOpen(false)}
              onSave={handleLogEpisodeSave}
            />
          </div>,
          document.body
        )}
      {currentReadingModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <CurrentReadingModal
              title={mediaTitle}
              totalPagesDefault={totalPagesDefault ?? null}
              initial={
                userMedia
                  ? {
                      progress: userMedia.progress,
                      started_at: userMedia.started_at,
                    }
                  : undefined
              }
              onClose={() => setCurrentReadingModalOpen(false)}
              onSave={handleModalSave}
            />
          </div>,
          document.body
        )}
      {currentEpisodeModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <CurrentEpisodeModal
              title={mediaTitle}
              seasonEpisodes={seasonEpisodes ?? null}
              totalSeasons={totalSeasons ?? 1}
              initialSeason={progress.current_season as number | undefined}
              initialEpisode={progress.current_episode as number | undefined}
              onClose={() => setCurrentEpisodeModalOpen(false)}
              onSave={handleCurrentEpisodeSave}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

function StatusButton({
  label,
  icon: Icon,
  active,
  onClick,
  pending,
  color,
}: {
  label: string;
  icon?: React.ElementType;
  active: boolean;
  onClick: () => void;
  pending: boolean;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={pending}
      className={`flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-overlay disabled:opacity-50 ${
        active ? "text-text-primary" : "text-text-secondary"
      }`}
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={12} />}
        {label}
      </span>
      {active && <Check size={12} className={color} />}
    </button>
  );
}
