"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GalleryHorizontalEnd } from "lucide-react";
import { trackMedia } from "@/app/actions/media";
import type { TrackingStatus, UserMedia } from "@intertaind/types";
import LogEpisodeModal from "@/components/modals/log-episode-modal";
import TVModal from "@/components/modals/tv-modal";

export default function TVProgressHeader({
  userMedia,
  mediaId,
  title,
  totalSeasons,
  seasonEpisodes,
  editable,
}: {
  userMedia: UserMedia;
  mediaId: string;
  title: string;
  totalSeasons: number;
  seasonEpisodes: Record<string, number> | null;
  editable: boolean;
}) {
  const progress =
    (userMedia.progress as Record<string, unknown> | null) ?? {};
  const currentSeason =
    (progress.current_season as number | undefined) ?? 1;
  const currentEpisode =
    (progress.current_episode as number | undefined) ?? 1;
  const watchedEpisodes =
    (progress.watched_episodes as Record<string, number[]> | undefined) ?? {};

  const seasonKey = String(currentSeason);
  const seasonTotal = seasonEpisodes?.[seasonKey] ?? 0;
  const watchedCount = watchedEpisodes[seasonKey]?.length ?? 0;
  const pct =
    seasonTotal > 0
      ? Math.min(100, Math.round((watchedCount / seasonTotal) * 100))
      : 0;

  const [isPending, startTransition] = useTransition();
  const [logEpisodeOpen, setLogEpisodeOpen] = useState(false);
  const [finishedSeasonPrompt, setFinishedSeasonPrompt] = useState<
    number | null
  >(null);
  const [tvModalOpen, setTvModalOpen] = useState(false);
  const [tvModalSeason, setTvModalSeason] = useState<number | null>(null);
  const [finishedShowPrompt, setFinishedShowPrompt] = useState(false);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function anchorPopup() {
    if (!headerRef.current) return;
    const rect = headerRef.current.getBoundingClientRect();
    setPopupPos({
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }

  function closePopups() {
    setFinishedSeasonPrompt(null);
    setFinishedShowPrompt(false);
    setPopupPos(null);
  }

  function handleLogEpisodeSave(data: {
    season: number;
    episode: number;
    rating: number | null;
    review: string;
    is_favorite: boolean;
  }) {
    setLogEpisodeOpen(false);
    startTransition(async () => {
      try {
        const sk = String(data.season);
        const existing = new Set(watchedEpisodes[sk] ?? []);
        existing.add(data.episode);
        const watched = {
          ...watchedEpisodes,
          [sk]: Array.from(existing).sort((a, b) => a - b),
        };

        const episodeLogs =
          (progress.episode_logs as
            | Record<
                string,
                Record<string, { rating: number | null; review: string }>
              >
            | undefined) ?? {};
        const newEpisodeLogs = { ...episodeLogs };
        if (!newEpisodeLogs[sk]) newEpisodeLogs[sk] = {};
        newEpisodeLogs[sk][String(data.episode)] = {
          rating: data.rating,
          review: data.review,
        };

        const seasonEpCount = seasonEpisodes?.[sk] ?? 0;
        // Advance current_episode/season. If we just logged the season
        // finale, jump to the next season's episode 1. If no next season,
        // leave status for the celebration popup to handle.
        let nextSeason = data.season;
        let nextEpisode: number | null = data.episode + 1;
        const justFinishedSeason =
          seasonEpCount > 0 && data.episode >= seasonEpCount;
        const nextSeasonNum = data.season + 1;
        const nextSeasonHasEps = seasonEpisodes?.[String(nextSeasonNum)] ?? 0;
        const isFinalSeason = justFinishedSeason && !(nextSeasonHasEps > 0);
        if (justFinishedSeason) {
          if (nextSeasonHasEps > 0) {
            nextSeason = nextSeasonNum;
            nextEpisode = 1;
          } else {
            nextEpisode = data.episode;
          }
        }

        const newProgress = {
          ...progress,
          current_season: nextSeason,
          current_episode: nextEpisode,
          watched_episodes: watched,
          episode_logs: newEpisodeLogs,
        };

        await trackMedia(
          mediaId,
          (userMedia.status ?? "in_progress") as TrackingStatus,
          {
            progress: newProgress,
            activity_type_override: "logged_episode",
            activity_metadata_extra: {
              season: data.season,
              episode: data.episode,
              ...(data.rating != null ? { rating: data.rating } : {}),
              ...(data.review?.trim().length > 0
                ? {
                    review_length: data.review.length,
                    review_text: data.review,
                  }
                : {}),
              ...(data.is_favorite ? { is_favorite: true } : {}),
            },
          }
        );

        if (justFinishedSeason) {
          anchorPopup();
          setFinishedSeasonPrompt(data.season);
          // Stash whether this was the final season so we can chain the
          // "Move to Watched" prompt after the season log save.
          finalSeasonRef.current = isFinalSeason;
        } else {
          router.refresh();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  const finalSeasonRef = useRef(false);

  function openSeasonReview() {
    const season = finishedSeasonPrompt;
    if (season == null) return;
    setFinishedSeasonPrompt(null);
    setTvModalSeason(season);
    setTvModalOpen(true);
  }

  function handleTVModalSave(data: {
    status: string;
    rating: number | null;
    review: string;
    is_favorite: boolean;
    progress: Record<string, unknown>;
    completed_at: string | null;
    activity_type_override?: string;
    activity_metadata_extra?: Record<string, unknown>;
  }) {
    setTvModalOpen(false);
    setTvModalSeason(null);
    startTransition(async () => {
      try {
        await trackMedia(mediaId, data.status as TrackingStatus, {
          rating: data.rating,
          review: data.review,
          is_favorite: data.is_favorite,
          // Merge existing progress (current_season/episode/watched_episodes)
          // with the TVModal's season-review data so we don't clobber
          // the episode-log state.
          progress: { ...progress, ...data.progress },
          completed_at: data.completed_at,
          activity_type_override: data.activity_type_override,
          activity_metadata_extra: data.activity_metadata_extra,
        });
        if (finalSeasonRef.current) {
          finalSeasonRef.current = false;
          anchorPopup();
          setFinishedShowPrompt(true);
        } else {
          router.refresh();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleMoveToWatched() {
    startTransition(async () => {
      try {
        await trackMedia(mediaId, "completed", {
          completed_at: new Date().toISOString(),
        });
        closePopups();
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Close popover on outside click / scroll / resize / Escape.
  useEffect(() => {
    if (!finishedSeasonPrompt && !finishedShowPrompt) return;
    function onDocClick(e: MouseEvent) {
      if (!popupRef.current?.contains(e.target as Node)) {
        closePopups();
        router.refresh();
      }
    }
    function onScrollOrResize() {
      closePopups();
      router.refresh();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePopups();
        router.refresh();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedSeasonPrompt, finishedShowPrompt]);

  return (
    <>
      <div
        ref={headerRef}
        className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-text-muted"
      >
        <span className="text-text-primary">
          S{currentSeason}E{currentEpisode}
        </span>
        {editable && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setLogEpisodeOpen(true);
            }}
            disabled={isPending}
            aria-label="Log episode"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay text-text-secondary transition-colors hover:border-accent-tv/40 hover:text-accent-tv disabled:opacity-50"
          >
            <GalleryHorizontalEnd size={11} />
          </button>
        )}

        {seasonTotal > 0 ? (
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
            <div
              className="absolute inset-y-0 left-0 bg-accent-tv transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>

      {/* Log Episode modal — portaled from inside this component so it can
          reach above the card's overflow-hidden. */}
      {logEpisodeOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <LogEpisodeModal
              title={title}
              seasonEpisodes={seasonEpisodes}
              totalSeasons={totalSeasons}
              initialSeason={currentSeason}
              initialEpisode={currentEpisode}
              watchedEpisodes={watchedEpisodes}
              onClose={() => setLogEpisodeOpen(false)}
              onSave={handleLogEpisodeSave}
            />
          </div>,
          document.body
        )}

      {/* TVModal for season review, pre-selected to the just-finished season */}
      {tvModalOpen &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <TVModal
              title={title}
              totalSeasons={totalSeasons}
              initialSelectedSeason={tvModalSeason}
              initial={{
                rating: userMedia.rating,
                review: userMedia.review ?? "",
                is_favorite: userMedia.is_favorite,
                progress: userMedia.progress,
              }}
              onClose={() => {
                setTvModalOpen(false);
                setTvModalSeason(null);
                // If this was the final-season flow and the user backed out
                // without saving, still give them the "Move to Watched" nudge.
                if (finalSeasonRef.current) {
                  finalSeasonRef.current = false;
                  anchorPopup();
                  setFinishedShowPrompt(true);
                }
              }}
              onSave={handleTVModalSave}
            />
          </div>,
          document.body
        )}

      {/* End-of-season celebration */}
      {finishedSeasonPrompt !== null &&
        popupPos &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              left: popupPos.left,
              top: popupPos.top,
              transform: "translate(-50%, -60%)",
            }}
            className="z-50 w-72 rounded-sm border border-surface-border bg-surface-raised p-4 shadow-2xl shadow-black/60"
          >
            <p className="mb-3 text-center text-sm text-text-secondary">
              You finished{" "}
              <span className="font-medium text-text-primary">
                Season {finishedSeasonPrompt}
              </span>{" "}
              of{" "}
              <span className="font-medium text-text-primary">{title}</span>!
            </p>
            <button
              onClick={openSeasonReview}
              disabled={isPending}
              className="w-full rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              Review and Log Season?
            </button>
          </div>,
          document.body
        )}

      {/* End-of-show celebration */}
      {finishedShowPrompt &&
        popupPos &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              left: popupPos.left,
              top: popupPos.top,
              transform: "translate(-50%, -60%)",
            }}
            className="z-50 w-72 rounded-sm border border-surface-border bg-surface-raised p-4 shadow-2xl shadow-black/60"
          >
            <p className="mb-3 text-center text-sm text-text-secondary">
              You finished{" "}
              <span className="font-medium text-text-primary">{title}</span>!
            </p>
            <button
              onClick={handleMoveToWatched}
              disabled={isPending}
              className="w-full rounded-sm bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              Move to Watched
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
