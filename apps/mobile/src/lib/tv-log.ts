/**
 * Shared TV season/episode log SAVE logic, so the detail log sheets
 * (tv-log-season-sheet / tv-log-episode-sheet) and the quick-log TV panels run
 * the EXACT same rules — no drift on the tricky bits (season-average rating,
 * the episode pointer advance + season/series-finale handling).
 *
 * Each helper takes the viewer's CURRENT progress (already OPTIMISTIC-guarded
 * by the caller) and returns the `useTrackMediaMutation` fields to write; the
 * caller adds `mediaId` and fires the mutation. Mirrors web's tv-modal /
 * log-episode-modal `onSave` (media-detail-client / tv-progress-header).
 */
import {
  setEpisodeLog,
  setSeasonLog,
  starsToRating,
  type ProgressRecord,
  type SeasonLog,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

type Progress = Tables<"user_media">["progress"];

/** Minimal shape of `parseTvSeasons`'s result the helpers need (structural). */
type SeasonMeta = {
  seasonNumbers: number[];
  episodeCountFor: (season: number) => number;
};

/** The `useTrackMediaMutation` fields a season log produces. */
export type SeasonLogVars = {
  status: Extract<TrackingStatus, "completed" | "in_progress">;
  rating: number | null;
  review: string;
  progress: Progress;
  completed_at: string | null;
};

/**
 * Log a season: sets `progress.seasons[n] = { rating, review, completed:true,
 * has_spoilers }`, recomputes `current_season` + the all-complete status, and
 * a TOP-LEVEL rating = the rounded average of every rated season (web parity;
 * top-level review stays "").
 */
export function buildSeasonLogVars(args: {
  existingProgress: ProgressRecord | null;
  seasonMeta: SeasonMeta;
  season: number;
  stars: number | null;
  review: string;
  hasSpoilers: boolean;
}): SeasonLogVars {
  const progress = setSeasonLog(args.existingProgress, args.season, {
    rating: starsToRating(args.stars),
    review: args.review,
    completed: true,
    has_spoilers: args.hasSpoilers,
  });

  const mergedSeasons = progress.seasons as Record<string, SeasonLog>;
  const seasonValues = Object.values(mergedSeasons);
  const completedCount = seasonValues.filter((s) => s.completed).length;
  const seasonCount = Math.max(args.seasonMeta.seasonNumbers.length, 1);
  const all = completedCount >= seasonCount;
  progress.current_season = completedCount + 1;

  const ratedSeasons = seasonValues.filter((s) => s.rating != null);
  const avgRating =
    ratedSeasons.length > 0
      ? Math.round(
          ratedSeasons.reduce((sum, s) => sum + (s.rating ?? 0), 0) /
            ratedSeasons.length,
        )
      : null;

  return {
    status: all ? "completed" : "in_progress",
    rating: avgRating,
    review: "",
    progress: progress as Progress,
    completed_at: all ? new Date().toISOString() : null,
  };
}

/** The `useTrackMediaMutation` fields an episode log produces. Rating/review
 *  are OMITTED at the top level (they live in the per-episode log). */
export type EpisodeLogVars = {
  status: TrackingStatus;
  progress: Progress;
  completed_at: string | null;
};

/**
 * Log an episode: sets `progress.episode_logs[s][e] = { rating, review,
 * has_spoilers }` + marks it watched, then advances the "currently on" pointer
 * with the season/series-finale rule (web parity):
 *   - normally current_episode = episode + 1 (same season);
 *   - at a season finale: jump to next-season E1 if it exists;
 *   - at the series finale (no next season): keep the pointer, mark completed.
 */
export function buildEpisodeLogVars(args: {
  existingProgress: ProgressRecord | null;
  seasonMeta: SeasonMeta;
  currentStatus: TrackingStatus | null;
  season: number;
  episode: number;
  stars: number | null;
  review: string;
  hasSpoilers: boolean;
}): EpisodeLogVars {
  const { season, episode } = args;
  const progress = setEpisodeLog(args.existingProgress, season, episode, {
    rating: starsToRating(args.stars),
    review: args.review,
    has_spoilers: args.hasSpoilers,
  });

  const seasonEpCount = args.seasonMeta.episodeCountFor(season);
  let nextSeason = season;
  let nextEpisode: number = episode + 1;
  let newStatus: TrackingStatus = args.currentStatus ?? "in_progress";
  let isSeriesFinale = false;

  if (seasonEpCount > 0 && episode >= seasonEpCount) {
    const nextSeasonNum = season + 1;
    const nextSeasonHasEps = args.seasonMeta.episodeCountFor(nextSeasonNum);
    if (nextSeasonHasEps > 0) {
      nextSeason = nextSeasonNum;
      nextEpisode = 1;
    } else {
      // Series finale — keep the pointer, mark completed.
      nextEpisode = episode;
      newStatus = "completed";
      isSeriesFinale = true;
    }
  }

  progress.current_season = nextSeason;
  progress.current_episode = nextEpisode;

  return {
    status: newStatus,
    progress: progress as Progress,
    completed_at: isSeriesFinale ? new Date().toISOString() : null,
  };
}
