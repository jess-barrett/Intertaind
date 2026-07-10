/**
 * `activity.ts` — the SINGLE source of the "what activity should this tracking
 * write log?" decision, shared by web and mobile so both platforms produce
 * identical `activity_log` rows. The companion to `format-activity.ts`: this
 * decides WHICH row to write; that decides how a row READS. Both live here (the
 * only workspace with a vitest runner) so the logic stays unit-tested.
 *
 * Pure + platform-agnostic: each function returns an `ActivityDraft`
 * (`{ activity_type, metadata }`) or `null` when nothing feed-worthy happened.
 * The caller (a web server action / a mobile mutation) inserts the row with its
 * own supabase client — this module never touches the DB.
 *
 * The rules mirror web's server actions (apps/web/src/app/actions/media.ts) so
 * the two never drift:
 *   - `resolveTrackActivity` = web `trackMedia` (priority + "should I log?"
 *     guards + metadata), the nuanced one.
 *   - the small builders = the by-id actions (rate / review / favorite / remove)
 *     and the quick-add.
 * `metadata` shapes match what `formatActivity` reads (status, rating,
 * review_*, sub_status, current_season/episode, hours_played, previous_status).
 *
 * Ratings here are the 1–10 DB scale (what `activity_log.metadata.rating`
 * stores) — convert display stars with `starsToRating` BEFORE calling.
 */
import type { ActivityType, TrackingStatus } from "./index.ts";

/** A pending `activity_log` write: its type + metadata (the caller adds
 *  user_id/media_id and inserts). */
export interface ActivityDraft {
  activity_type: ActivityType;
  metadata: Record<string, unknown>;
}

/** The user_media row state BEFORE a track write (null = untracked). */
export interface TrackSnapshot {
  status: TrackingStatus;
  rating: number | null;
  review: string | null;
  is_favorite: boolean;
  progress: Record<string, unknown> | null;
}

/** Inputs to the `trackMedia`-style decision. Optional fields mirror the
 *  "only touch what's passed" upsert semantics. */
export interface TrackActivityInput {
  /** The row as it was before this write (from a fresh read), or null. */
  prior: TrackSnapshot | null;
  status: TrackingStatus;
  rating?: number | null;
  review?: string;
  is_favorite?: boolean;
  progress?: Record<string, unknown> | null;
  /** Explicit intent the row-diff can't convey — TV episode/season logs,
   *  start-reading. `{ activity_type, metadata }`. */
  override?: { activity_type: ActivityType; metadata?: Record<string, unknown> };
}

/** Safely read a key off a progress blob (non-object → undefined). */
function progressField(
  progress: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  return progress && typeof progress === "object" ? progress[key] : undefined;
}

/**
 * Decide the activity for a `trackMedia`-style write. Returns null when the
 * write is a silent metadata edit (nothing feed-worthy) — mirrors web's
 * `shouldLog` guards so re-saving a date/hours or editing existing review text
 * logs nothing.
 *
 * activity_type priority: override > reviewed (new review) > status_changed
 * (existing row, status/sub_status moved, no rating/review this write) >
 * completed (new status = completed) > added_to_shelf.
 */
export function resolveTrackActivity(
  input: TrackActivityInput,
): ActivityDraft | null {
  const { prior, status, rating, review, is_favorite, progress, override } =
    input;

  const hasReview = !!(review && review.trim().length > 0);
  const hasRatingChange = rating !== undefined;
  const priorSubStatus = progressField(prior?.progress, "sub_status");
  const newSubStatus = progressField(progress, "sub_status");
  const isStatusChange =
    !!prior &&
    !hasReview &&
    !hasRatingChange &&
    (prior.status !== status || priorSubStatus !== newSubStatus);

  const activityType: ActivityType =
    override?.activity_type ??
    (hasReview
      ? "reviewed"
      : isStatusChange
        ? "status_changed"
        : status === "completed"
          ? "completed"
          : "added_to_shelf");

  // "Should I log?" — a genuine event, not a silent edit.
  const overrideAlwaysLogs =
    override?.activity_type === "logged_episode" ||
    override?.activity_type === "logged_season";
  const isFirstTime = !prior;
  const ratingNewlySet = !!prior && prior.rating == null && rating != null;
  const ratingCleared = !!prior && prior.rating != null && rating === null;
  const priorReviewText =
    typeof prior?.review === "string" ? prior.review.trim() : "";
  const reviewNewlyAdded = !!prior && priorReviewText.length === 0 && hasReview;

  const shouldLog =
    overrideAlwaysLogs ||
    isFirstTime ||
    isStatusChange ||
    ratingNewlySet ||
    ratingCleared ||
    reviewNewlyAdded;
  if (!shouldLog) return null;

  const metadata: Record<string, unknown> = {
    status,
    ...(override?.metadata ?? {}),
  };
  if (rating != null) metadata.rating = rating;
  if (hasReview && review) {
    metadata.review_length = review.length;
    metadata.review_text = review;
  }
  if (is_favorite) metadata.is_favorite = true;
  if (newSubStatus != null) metadata.sub_status = newSubStatus;
  const currentSeason = progressField(progress, "current_season");
  const currentEpisode = progressField(progress, "current_episode");
  if (currentSeason != null) metadata.current_season = currentSeason;
  if (currentEpisode != null) metadata.current_episode = currentEpisode;
  const hoursPlayed = progressField(progress, "hours_played");
  if (typeof hoursPlayed === "number" && hoursPlayed > 0) {
    metadata.hours_played = hoursPlayed;
  }

  return { activity_type: activityType, metadata };
}

/** Rating set (by-id) → `rated`. Null (a clear) logs nothing (web parity). */
export function rateActivity(rating: number | null): ActivityDraft | null {
  if (rating == null) return null;
  return { activity_type: "rated", metadata: { rating } };
}

/** Review saved (by-id) → `reviewed`. Stored verbatim (web parity). */
export function reviewActivity(review: string): ActivityDraft {
  return {
    activity_type: "reviewed",
    metadata: { review_length: review.length, review_text: review },
  };
}

/** Favorite toggled → `favorited` on the positive transition only. */
export function favoriteActivity(newValue: boolean): ActivityDraft | null {
  return newValue ? { activity_type: "favorited", metadata: {} } : null;
}

/** A by-id status change (a shelf move, not a full track) → `status_changed`.
 *  Uses `to_status` (web `updateTrackingStatus` parity; formatActivity reads
 *  `to_status ?? status`). */
export function statusChangedActivity(toStatus: TrackingStatus): ActivityDraft {
  return { activity_type: "status_changed", metadata: { to_status: toStatus } };
}

/** Tracking removed → `removed`, carrying the prior status for the sentence. */
export function removeActivity(previousStatus: string): ActivityDraft {
  return {
    activity_type: "removed",
    metadata: { previous_status: previousStatus },
  };
}

/** A bare shelf add (quick-add / lazy-create at status "want") →
 *  `added_to_shelf`. */
export function addedToShelfActivity(status: TrackingStatus): ActivityDraft {
  return { activity_type: "added_to_shelf", metadata: { status } };
}

/**
 * Authoring an "Intertain" pairing → `recommended`. The row's media is the
 * TARGET (what to try); the source goes in metadata (the activity row can only
 * embed the target via `media_id`). We store the source's cover + type too, so
 * the feed can render the full SOURCE → TARGET pairing (matching the profile
 * Recs tab) without a join — the target's poster comes from the row's media
 * embed. `source_title` also lets formatActivity render the text fallback
 * ("Intertaind {target} for fans of {source}") for old rows lacking the cover.
 * The caller sets `media_id` = the recommended (target) media id.
 */
export function recommendActivity(args: {
  sourceMediaId: string;
  recommendedMediaId: string;
  sourceTitle: string | null;
  recommendedTitle: string | null;
  hasNote: boolean;
  sourceCoverUrl?: string | null;
  sourceMediaType?: string | null;
  /** The author's note text, so the feed can show the reasoning inline. */
  note?: string | null;
}): ActivityDraft {
  return {
    activity_type: "recommended",
    metadata: {
      source_media_id: args.sourceMediaId,
      recommended_media_id: args.recommendedMediaId,
      source_title: args.sourceTitle,
      recommended_title: args.recommendedTitle,
      has_note: args.hasNote,
      note: args.note ?? null,
      source_cover_url: args.sourceCoverUrl ?? null,
      source_media_type: args.sourceMediaType ?? null,
    },
  };
}
