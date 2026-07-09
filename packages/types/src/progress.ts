/**
 * Pure, immutable builders for the `user_media.progress` JSONB column,
 * shared by web and mobile.
 *
 * ## Why these exist — the progress-replacement landmine
 *
 * The `progress` column is a single JSONB blob written whole on every
 * write: PostgREST `update({ progress })` REPLACES the column, and
 * mobile's `useTrackMediaMutation` sends the whole `progress` payload
 * (web parity — web's modals merge client-side first). So any flow that
 * touches progress MUST start from the row's CURRENT value and merge,
 * or it silently wipes sibling keys — a book flow setting
 * `sub_shelf: "finished"` would drop an existing `custom_cover_url`; a
 * TV flow logging one episode would drop other seasons' watched
 * episodes. These builders are the merge step: each takes the EXISTING
 * progress (or null) and returns a MERGED COPY that preserves every
 * other key.
 *
 * ## Contract
 *
 * - **Pure & immutable.** Never mutate the input (or its nested arrays /
 *   objects) — always return a fresh copy. Callers pass the value they
 *   just fresh-read from the DB; mutating it would corrupt caches.
 * - **Preserve siblings.** Only the keys a builder is responsible for
 *   change; everything else is carried over verbatim.
 * - **No RN / Supabase imports.** This module is imported by both apps;
 *   keep it dependency-free.
 *
 * ## Not handled here — the "currently on" pointer
 *
 * `current_season` / `current_episode` (and the "mark episodes 1..N−1
 * watched" bulk-fill + season-finale advance) depend on the exact web flow
 * AND per-season episode counts from `metadata`, so they are the consuming
 * sheet's job (Task 2.6), not a pure builder: the sheet computes the target
 * (season, episode) and layers those keys on top of the merge primitives
 * here (e.g. `addWatchedEpisode` / `setEpisodeLog`).
 *
 * The exact field assembly (which keys, the watched-episode dedupe/sort,
 * the stringified season/episode keying) mirrors web's modals + detail
 * client (`apps/web/src/components/modals/*`,
 * `apps/web/src/components/tv-progress-header.tsx`,
 * `apps/web/src/app/media/[id]/media-detail-client.tsx`). Progress shapes
 * are documented per media type below.
 */

/** Loose bag type for a progress blob. The per-type shapes below are the
 *  authoritative documentation; we keep the merge functions permissive
 *  (extra/unknown keys are preserved, not dropped) so a future key added
 *  by one platform is never silently discarded by the other. */
export type ProgressRecord = Record<string, unknown>;

/** book: `{ sub_shelf, current_page?, total_pages?, is_reread?, custom_cover_url? }` */
export type BookSubShelf = "currently_reading" | "finished" | "dnf";

/** video_game `sub_status` — the six play states web's game modal offers. */
export type GameSubStatus =
  | "playing"
  | "completed"
  | "played"
  | "shelved"
  | "retired"
  | "abandoned";

/**
 * A single per-episode log entry (tv_show `episode_logs[season][episode]`).
 * `review` is a required string (empty when none) — web always persists it
 * as a string and its read sites assume that shape, so keeping it required
 * keeps mobile/web episode-log blobs identical. `has_spoilers` is OPTIONAL and
 * mobile-only for now (marks the review as a spoiler); web doesn't set or read
 * it, so an absent value is the norm.
 */
export type EpisodeLog = {
  rating: number | null;
  review: string;
  has_spoilers?: boolean;
};

/** A single per-season log entry (tv_show `seasons[season]`). `review` is a
 *  required string (empty when none), matching web's tv-modal payload.
 *  `has_spoilers` is OPTIONAL / mobile-only (see EpisodeLog). */
export type SeasonLog = {
  rating: number | null;
  review: string;
  completed: boolean;
  has_spoilers?: boolean;
};

/**
 * Normalize the `existing` argument to a plain object we can spread.
 * `null` (untracked / no progress yet) becomes `{}`. Returned object is
 * always a fresh shallow copy so the caller's input is never mutated.
 */
function base(existing: ProgressRecord | null): ProgressRecord {
  return existing ? { ...existing } : {};
}

/**
 * Movie progress. Sets `watched_on` + `is_rewatch`, preserving any other
 * keys (notably `custom_backdrop_url`). Mirrors web's movie-modal
 * payload `{ watched_on, is_rewatch }`.
 */
export function buildMovieProgress(
  existing: ProgressRecord | null,
  fields: { watched_on: string; is_rewatch: boolean }
): ProgressRecord {
  return {
    ...base(existing),
    watched_on: fields.watched_on,
    is_rewatch: fields.is_rewatch,
  };
}

/**
 * Book progress. Always sets `sub_shelf`; includes `current_page` /
 * `is_reread` only when provided. `total_pages` is included whenever the
 * key is present in `fields` — even as `null` — mirroring web's
 * current-reading-modal, which always emits `total_pages` (including
 * null) so clearing the field overwrites a previously-saved override
 * instead of silently keeping the old value. Preserves all other keys
 * (notably `custom_cover_url` — the headline preservation case).
 */
export function buildBookProgress(
  existing: ProgressRecord | null,
  fields: {
    sub_shelf: BookSubShelf;
    current_page?: number;
    total_pages?: number | null;
    is_reread?: boolean;
  }
): ProgressRecord {
  const next = base(existing);
  next.sub_shelf = fields.sub_shelf;
  if (fields.current_page !== undefined) next.current_page = fields.current_page;
  // total_pages: keyed presence, not truthiness — an explicit null clears.
  if ("total_pages" in fields) next.total_pages = fields.total_pages;
  if (fields.is_reread !== undefined) next.is_reread = fields.is_reread;
  return next;
}

/**
 * Game progress. Always sets `sub_status`; includes `hours_played` only
 * when provided (web's game modal omits it when the field is blank).
 * Preserves all other keys (notably `custom_backdrop_url`).
 */
export function buildGameProgress(
  existing: ProgressRecord | null,
  fields: { sub_status: GameSubStatus; hours_played?: number }
): ProgressRecord {
  const next = base(existing);
  next.sub_status = fields.sub_status;
  if (fields.hours_played !== undefined) next.hours_played = fields.hours_played;
  return next;
}

/**
 * Read `watched_episodes` off a progress blob as a typed map, defaulting
 * to an empty object. Deliberately loose about the stored shape.
 */
function readWatched(existing: ProgressRecord | null): Record<string, number[]> {
  return (existing?.watched_episodes as Record<string, number[]> | undefined) ?? {};
}

/**
 * Add one episode to `watched_episodes[season]`, deduped and sorted
 * ascending, returning a merged copy. The season key is the STRINGIFIED
 * season number (web keys these blobs by string). Other seasons'
 * arrays — and every other progress key (`episode_logs`,
 * `custom_backdrop_url`, `current_season`, …) — are preserved.
 *
 * Mirrors web's log-episode assembly:
 *   const existing = new Set(watched[sk] ?? []);
 *   existing.add(episode);
 *   watched[sk] = Array.from(existing).sort((a, b) => a - b);
 */
export function addWatchedEpisode(
  existing: ProgressRecord | null,
  season: number,
  episode: number
): ProgressRecord {
  const seasonKey = String(season);
  const prevWatched = readWatched(existing);
  const deduped = new Set(prevWatched[seasonKey] ?? []);
  deduped.add(episode);
  return {
    ...base(existing),
    watched_episodes: {
      ...prevWatched,
      [seasonKey]: Array.from(deduped).sort((a, b) => a - b),
    },
  };
}

/**
 * Set `episode_logs[season][episode] = log` AND mark that episode
 * watched via `watched_episodes` (web logs an episode and adds it to the
 * watched set in the same save). Season/episode are stringified for the
 * nested keys. Other episodes in the season, other seasons, and every
 * other progress key are preserved.
 *
 * Mirrors web's log-episode assembly (tv-progress-header /
 * media-detail-client): the watched-set add above, plus
 *   if (!episodeLogs[sk]) episodeLogs[sk] = {};
 *   episodeLogs[sk][String(episode)] = { rating, review };
 */
export function setEpisodeLog(
  existing: ProgressRecord | null,
  season: number,
  episode: number,
  log: EpisodeLog
): ProgressRecord {
  const seasonKey = String(season);
  const episodeKey = String(episode);
  // First fold in the watched-episode add (also merges base()).
  const withWatched = addWatchedEpisode(existing, season, episode);
  // Read the log map off the already-merged base (`withWatched`), not the
  // raw input, so the composition stays self-consistent even if
  // addWatchedEpisode ever starts touching episode_logs.
  const prevLogs =
    (withWatched.episode_logs as
      | Record<string, Record<string, EpisodeLog>>
      | undefined) ?? {};
  return {
    ...withWatched,
    episode_logs: {
      ...prevLogs,
      [seasonKey]: {
        ...(prevLogs[seasonKey] ?? {}),
        [episodeKey]: log,
      },
    },
  };
}

/**
 * Set `seasons[season] = log`, returning a merged copy. Season key is
 * stringified. Other seasons' entries, and every other progress key
 * (`watched_episodes`, `episode_logs`, `custom_backdrop_url`,
 * `current_season`, …), are preserved. Mirrors web's tv-modal
 * `seasons[String(season)] = { rating, review, completed }`.
 */
export function setSeasonLog(
  existing: ProgressRecord | null,
  season: number,
  log: SeasonLog
): ProgressRecord {
  const seasonKey = String(season);
  const prevSeasons =
    (existing?.seasons as Record<string, SeasonLog> | undefined) ?? {};
  return {
    ...base(existing),
    seasons: {
      ...prevSeasons,
      [seasonKey]: log,
    },
  };
}
