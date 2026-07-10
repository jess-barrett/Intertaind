/**
 * TanStack Query mutations for the viewer's `user_media` tracking rows —
 * the write-side counterpart of `useViewerTracking` (./media.ts).
 *
 * Mirrors the `user_media` WRITE semantics of web's server actions in
 * `apps/web/src/app/actions/media.ts` (`trackMedia`,
 * `updateTrackingStatus`, `rateMedia`, `toggleFavorite`, `reviewMedia`,
 * `removeTracking`).
 *
 *   `activity_log` writes: each mutation logs its activity via `logActivity`
 *   (below), deriving WHAT to log from the shared `@intertaind/types` decision
 *   module (`resolveTrackActivity` + the by-id builders) — the SAME logic web
 *   uses, so both platforms produce identical feed rows. (This supersedes the
 *   earlier plan to move logging into a Postgres trigger: a trigger can't see
 *   the per-type INTENT — logged_episode/season, started_reading — that lives
 *   at the action layer. Web keeps its equivalent inline writes until it
 *   migrates onto the same shared module.) Logging is fire-and-forget: it never
 *   fails the tracking write.
 *
 * Ratings: `user_media.rating` is the **1–10 DB scale**, not 0.5–5
 * stars — see the two-scale rule in `packages/types/src/rating.ts`.
 * Mutations REJECT invalid ratings via `isValidDbRating` (throw, never
 * clamp): clamping at the write boundary would silently persist
 * corrupted input. Clamping is read-path only (`ratingToStars`).
 * Convert star input with `starsToRating` BEFORE calling these hooks.
 *
 * Upsert field-merge semantics (verified against
 * @supabase/postgrest-js 2.108.1 + PostgREST):
 *   A single-object `.upsert(payload, { onConflict })` POSTs exactly
 *   the payload's keys with `Prefer: resolution=merge-duplicates`
 *   (postgrest-js only widens the column list for ARRAY payloads, via
 *   the `columns` query param). PostgREST then generates
 *   `INSERT ... ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col`
 *   for ONLY the payload's columns. Therefore a key omitted from the
 *   payload is (a) left at its existing value on conflict and (b) given
 *   its column default on fresh insert. That's why `useTrackMediaMutation`
 *   only includes `rating`/`review`/`is_favorite`/`progress` when the
 *   caller passed them — a status-only track never nulls an existing
 *   rating. `started_at`/`completed_at` are ALWAYS in the payload
 *   (mirroring web), so every track call rewrites them:
 *   `provided ?? (status-derived ? now : null)`.
 *
 * Lazy-create (design choice): web auto-creates a `status: "want"` row
 * before rating/favoriting an untracked item (`quickAddMedia`'s
 * get-or-create). Mobile folds that into the byId mutations instead:
 * `useRateMediaMutation` / `useReviewMediaMutation` /
 * `useToggleFavoriteMutation` take `{ mediaId, userMediaId? }` — pass
 * `userMediaId` when the panel has a tracking row (exact web byId
 * semantics), omit it for an untracked item and the mutation looks up
 * the viewer's row by (user_id, media_id) and, when none exists,
 * inserts a NEW row. Rate/review lazy-create it as `status: "completed"`
 * (rating or reviewing implies you CONSUMED it — so the detail page
 * highlights watched/played/read, not the Watchlist bookmark); favorite
 * lazy-creates `status: "want"` (a love can be aspirational). Read-then-write
 * (not a blind upsert) so a stale-cache caller can never clobber an EXISTING
 * row's status.
 * Both lazy-create insert paths catch Postgres 23505 (a concurrent
 * lazy-create won the (user_id, media_id) unique race) and finish as
 * an update instead of throwing — see `patchOrLazyCreate`'s doc.
 *
 * Cache strategy:
 *   - Every mutation invalidates `media.viewerTracking(user.id, mediaId)`
 *     + `media.detail(mediaId)` (DB triggers bump the denormalized
 *     tracking/favorites counts) + `user.shelves(user.id)` (hierarchical
 *     key — covers the per-mediaType variants). All variables therefore
 *     carry `mediaId`, even byId mutations.
 *   - High-frequency mutations (track, status, rate, favorite) are
 *     OPTIMISTIC on the viewerTracking row: `onMutate` cancels in-flight
 *     fetches for the key, snapshots, writes the merged next row;
 *     `onError` rolls back; `onSettled` invalidates either way.
 *   - review + remove are invalidate-only (low-frequency; a spinner is
 *     fine, and remove-then-restore flicker on failure looks worse than
 *     a pending state).
 *
 * Optimistic rows for UNTRACKED items are synthesized with
 * `id: OPTIMISTIC_ID` and local timestamps. UI MUST NOT feed that id
 * into a byId mutation — the real id arrives when the settle-invalidate
 * refetch lands. (`useTrackMediaMutation` and the lazy variants of
 * rate/review/favorite only need `mediaId`, so this is only a concern
 * if the UI caches `userMediaId` across renders.)
 *
 * Conventions (same as ./media.ts and ./auth.ts): hooks get the user
 * via `useAuth()` and throw "Not signed in." when absent; throw raw
 * Supabase errors (TanStack surfaces them via `mutation.error`); keys
 * come from ./keys.ts, never inline.
 */

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { Tables, TablesInsert } from "@intertaind/supabase";
import {
  favoriteActivity,
  isValidDbRating,
  rateActivity,
  removeActivity,
  resolveTrackActivity,
  reviewActivity,
  statusChangedActivity,
  type TrackingStatus,
  type TrackSnapshot,
} from "@intertaind/types";
import { useAuth } from "@/components/auth-provider";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

type UserMediaRow = Tables<"user_media">;
type ViewerTrackingKey = ReturnType<typeof queryKeys.media.viewerTracking>;

/**
 * Sentinel `id` on rows synthesized by an optimistic update for a
 * previously untracked item. Never send this id to a byId mutation —
 * the row doesn't exist in Postgres yet (or exists under a real uuid).
 */
export const OPTIMISTIC_ID = "optimistic";

/**
 * Write-boundary rating guard (see file header). `null` = "clear my
 * rating" and is always allowed; `undefined` = "not touching rating".
 */
function assertValidRating(rating: number | null | undefined): void {
  if (rating != null && !isValidDbRating(rating)) {
    throw new Error(
      `Invalid rating ${rating}: user_media.rating is a 1-10 integer (DB scale). ` +
        "Convert star input with starsToRating() first."
    );
  }
}

/**
 * The invalidation set shared by every tracking mutation:
 * the viewer's row, the media detail (denormalized counts moved), and
 * the user's shelves (hierarchical — includes per-mediaType keys).
 */
function invalidateTrackingCaches(
  queryClient: QueryClient,
  userId: string,
  mediaId: string
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.media.viewerTracking(userId, mediaId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.media.detail(mediaId),
  });
  // All of the viewer's user-scoped data (prefix match): shelves + media counts
  // AND the activity / reviews feeds — the "You" tab (`user.activityPage`), the
  // profile Overview preview, and the full lists. A tracking write can change
  // any of them, and may have just logged activity.
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.user.all, userId],
  });
  // Feeds that surface this user's activity to OTHERS (the Friends feed).
  void queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
}

/**
 * Cancel in-flight fetches for the viewer's row and snapshot the cache.
 * `undefined` means the key had NO cache entry (query never fetched) —
 * distinct from `null`, which is a fetched "not tracking" result.
 */
async function snapshotViewerTracking(
  queryClient: QueryClient,
  key: ViewerTrackingKey
): Promise<UserMediaRow | null | undefined> {
  await queryClient.cancelQueries({ queryKey: key });
  return queryClient.getQueryData<UserMediaRow | null>(key);
}

/** Restore the pre-mutation cache state after a failed optimistic write. */
function rollbackViewerTracking(
  queryClient: QueryClient,
  key: ViewerTrackingKey,
  previous: UserMediaRow | null | undefined
): void {
  if (previous === undefined) {
    // No entry existed pre-mutation; remove the synthesized one rather
    // than writing back a fabricated `null`. Safe: an entry that was
    // never fetched has no mounted observer to flash empty.
    queryClient.removeQueries({ queryKey: key });
  } else {
    queryClient.setQueryData(key, previous);
  }
}

/**
 * A plausible `user_media` row for optimistic display of a first-time
 * track. Column defaults mirror the DB: status "want", nothing rated /
 * reviewed / favorited. See OPTIMISTIC_ID for the id caveat.
 */
function synthesizeOptimisticRow(
  userId: string,
  mediaId: string,
  nowIso: string
): UserMediaRow {
  return {
    id: OPTIMISTIC_ID,
    user_id: userId,
    media_id: mediaId,
    status: "want",
    rating: null,
    review: null,
    is_favorite: false,
    progress: null,
    started_at: null,
    completed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Shared write path for rate/review: patch the viewer's row byId when
 * the id is known, otherwise look it up by (user_id, media_id); when no
 * row exists, lazy-create `{ status: "want", ...patch }` (see the
 * lazy-create note in the file header). Returns the row's media_id —
 * byId callers get the same row-existence guarantee web has (`.single()`
 * errors when the update matched nothing).
 *
 * The lazy-create insert catches Postgres 23505 (unique violation on
 * (user_id, media_id)) and retries as an update: two lazy-create
 * mutations can race on an untracked item — e.g. rate it, then
 * favorite/review before the rate settles. Both read "no row", both
 * insert, one loses the unique constraint. The loser's intent is still
 * valid, so it re-looks-up the row the winner created and applies the
 * patch it would have applied had the first read seen that row.
 */
async function patchOrLazyCreate(
  userId: string,
  mediaId: string,
  userMediaId: string | undefined,
  patch: { rating?: number | null; review?: string }
): Promise<string> {
  const findByMedia = async (): Promise<string | undefined> => {
    const { data, error } = await supabase
      .from("user_media")
      .select("id")
      .eq("user_id", userId)
      .eq("media_id", mediaId)
      .maybeSingle();
    if (error) throw error;
    return data?.id;
  };

  const patchById = async (targetId: string): Promise<string> => {
    const { data, error } = await supabase
      .from("user_media")
      .update(patch)
      .eq("id", targetId)
      .eq("user_id", userId)
      .select("media_id")
      .single();
    if (error) throw error;
    return data.media_id;
  };

  const targetId = userMediaId ?? (await findByMedia());
  if (targetId) return patchById(targetId);

  // Lazy-create an untracked item as COMPLETED (not "want"): rating or
  // reviewing something implies you've consumed it, so the detail page
  // highlights the watched / played / read icon rather than the Watchlist
  // bookmark. (An already-tracked row keeps its status — that's the
  // `patchById` path above.)
  const payload: TablesInsert<"user_media"> = {
    user_id: userId,
    media_id: mediaId,
    status: "completed",
    completed_at: new Date().toISOString(),
    ...patch,
  };
  const { data, error } = await supabase
    .from("user_media")
    .insert(payload)
    .select("media_id")
    .single();
  if (!error) return data.media_id;

  // 23505: a concurrent lazy-create won the race (see doc above) —
  // complete as an update on the row it created.
  if (error.code === "23505") {
    const racedId = await findByMedia();
    if (racedId) return patchById(racedId);
  }
  throw error;
}

export type TrackMediaVars = {
  mediaId: string;
  status: TrackingStatus;
  /** 1–10 DB scale (or null to clear). NOT stars — see file header. */
  rating?: number | null;
  review?: string;
  is_favorite?: boolean;
  progress?: TablesInsert<"user_media">["progress"];
  /** ISO timestamp override; defaults from `status` (see hook doc). */
  started_at?: string | null;
  completed_at?: string | null;
};

/**
 * Add-or-update the viewer's tracking row for a media item. Mirrors
 * web `trackMedia` (minus activity logging).
 *
 * Upsert on (user_id, media_id). Verified semantics (details in the
 * file header): optional fields are included in the payload ONLY when
 * passed, and PostgREST's merge-duplicates updates ONLY payload
 * columns — so `mutate({ mediaId, status: "completed" })` on an
 * already-rated row preserves the rating. `started_at`/`completed_at`
 * are always sent (web parity): explicit value if provided, else `now`
 * when the new status is in_progress/completed respectively, else
 * `null` — i.e. re-tracking recomputes both timestamps.
 *
 * `review` is normalized `review || null` (empty string → null), like
 * web `trackMedia` — note this differs from `useReviewMediaMutation`,
 * which stores the string verbatim (web `reviewMedia` parity).
 *
 * Optimistic on the viewerTracking row (synthesized when untracked).
 * Resolves to the `user_media` row id.
 */
export function useTrackMediaMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TrackMediaVars): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      assertValidRating(vars.rating);

      // Read the row as it was so the shared decision can tell an add from a
      // status change / newly-set rating|review (mirrors web's trackMedia).
      const { data: prior } = await supabase
        .from("user_media")
        .select("status, rating, review, is_favorite, progress")
        .eq("user_id", user.id)
        .eq("media_id", vars.mediaId)
        .maybeSingle();

      const payload: TablesInsert<"user_media"> = {
        user_id: user.id,
        media_id: vars.mediaId,
        status: vars.status,
        ...(vars.rating !== undefined ? { rating: vars.rating } : {}),
        ...(vars.review !== undefined ? { review: vars.review || null } : {}),
        ...(vars.is_favorite !== undefined
          ? { is_favorite: vars.is_favorite }
          : {}),
        ...(vars.progress !== undefined ? { progress: vars.progress } : {}),
        started_at:
          vars.started_at ??
          (vars.status === "in_progress" ? new Date().toISOString() : null),
        completed_at:
          vars.completed_at ??
          (vars.status === "completed" ? new Date().toISOString() : null),
      };

      const { data, error } = await supabase
        .from("user_media")
        .upsert(payload, { onConflict: "user_id,media_id" })
        .select("id")
        .single();
      if (error) throw error;

      const priorSnap: TrackSnapshot | null = prior
        ? {
            status: prior.status,
            rating: prior.rating,
            review: prior.review,
            is_favorite: prior.is_favorite ?? false,
            progress: (prior.progress ?? null) as Record<string, unknown> | null,
          }
        : null;
      await logActivity(
        user.id,
        vars.mediaId,
        resolveTrackActivity({
          prior: priorSnap,
          status: vars.status,
          rating: vars.rating,
          review: vars.review,
          is_favorite: vars.is_favorite,
          progress: (vars.progress ?? null) as Record<string, unknown> | null,
        }),
      );

      return data.id;
    },
    onMutate: async (vars) => {
      if (!user) return undefined;
      // Reject before the cache write so invalid input never renders,
      // not even transiently. (mutationFn re-checks at the true write
      // boundary; onMutate throwing also aborts the mutation.)
      assertValidRating(vars.rating);
      const key = queryKeys.media.viewerTracking(user.id, vars.mediaId);
      const previous = await snapshotViewerTracking(queryClient, key);
      const now = new Date().toISOString();
      const base =
        previous ?? synthesizeOptimisticRow(user.id, vars.mediaId, now);
      // Same merge rules as the upsert payload: optional fields only
      // when passed; timestamps always recomputed. (Typed local rather
      // than an inline literal: TS 6 rejects fresh literals against
      // setQueryData's `Updater<NoInfer<...>>` parameter.)
      const next: UserMediaRow = {
        ...base,
        status: vars.status,
        ...(vars.rating !== undefined ? { rating: vars.rating } : {}),
        ...(vars.review !== undefined ? { review: vars.review || null } : {}),
        ...(vars.is_favorite !== undefined
          ? { is_favorite: vars.is_favorite }
          : {}),
        ...(vars.progress !== undefined ? { progress: vars.progress } : {}),
        started_at:
          vars.started_at ?? (vars.status === "in_progress" ? now : null),
        completed_at:
          vars.completed_at ?? (vars.status === "completed" ? now : null),
        updated_at: now,
      };
      queryClient.setQueryData<UserMediaRow | null>(key, next);
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (!user || !context) return;
      rollbackViewerTracking(
        queryClient,
        queryKeys.media.viewerTracking(user.id, vars.mediaId),
        context.previous
      );
    },
    onSettled: (_data, _error, vars) => {
      if (!user) return;
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type UpdateStatusVars = {
  userMediaId: string;
  /** For cache invalidation + the optimistic write — not sent to the DB. */
  mediaId: string;
  status: TrackingStatus;
};

/**
 * Change the status of an EXISTING tracking row by id. Mirrors web
 * `updateTrackingStatus` (minus activity logging): sets `completed_at`
 * to now when moving to "completed" and `started_at` to now when
 * moving to "in_progress" — and, unlike `useTrackMediaMutation`,
 * leaves both timestamps untouched otherwise (web parity; the two
 * actions genuinely differ here).
 *
 * Optimistic when the viewer's row is cached; a byId update on an
 * uncached row has nothing to merge into, so it just invalidates.
 * Resolves to the row's media_id.
 *
 * NOTE: the detail screen's tracking panel deliberately does NOT call
 * this hook — panel status changes go through `useTrackMediaMutation`
 * (web parity: web's panel calls `trackMedia`, never
 * `updateTrackingStatus`). This hook is for byId flows that already
 * hold a real row id (e.g. shelf rows).
 */
export function useUpdateStatusMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UpdateStatusVars): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      const { data, error } = await supabase
        .from("user_media")
        .update({
          status: vars.status,
          ...(vars.status === "completed"
            ? { completed_at: new Date().toISOString() }
            : {}),
          ...(vars.status === "in_progress"
            ? { started_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", vars.userMediaId)
        .eq("user_id", user.id)
        .select("media_id")
        .single();
      if (error) throw error;
      await logActivity(
        user.id,
        data.media_id,
        statusChangedActivity(vars.status),
      );
      return data.media_id;
    },
    onMutate: async (vars) => {
      if (!user) return undefined;
      const key = queryKeys.media.viewerTracking(user.id, vars.mediaId);
      const previous = await snapshotViewerTracking(queryClient, key);
      // No cached row → no optimistic write below, so return NO
      // context: onError's `!context` guard must skip the rollback,
      // because "rolling back" a write that never happened would
      // removeQueries/overwrite an entry a CONCURRENT mutation may
      // have written after this snapshot.
      if (!previous) return undefined;
      const now = new Date().toISOString();
      const next: UserMediaRow = {
        ...previous,
        status: vars.status,
        ...(vars.status === "completed" ? { completed_at: now } : {}),
        ...(vars.status === "in_progress" ? { started_at: now } : {}),
        updated_at: now,
      };
      queryClient.setQueryData<UserMediaRow | null>(key, next);
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (!user || !context) return;
      rollbackViewerTracking(
        queryClient,
        queryKeys.media.viewerTracking(user.id, vars.mediaId),
        context.previous
      );
    },
    onSettled: (_data, _error, vars) => {
      if (!user) return;
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type RateMediaVars = {
  mediaId: string;
  /** 1–10 DB scale, or null to clear. NOT stars — see file header. */
  rating: number | null;
  /** Pass when tracked (web byId parity); omit to lazy-create "want". */
  userMediaId?: string;
};

/**
 * Rate a media item. With `userMediaId` this is web `rateMedia`
 * (update by id, minus activity logging); without it, the lazy-create
 * path documented in the file header. Optimistic. Resolves to the
 * row's media_id.
 */
export function useRateMediaMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RateMediaVars): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      assertValidRating(vars.rating);
      const mediaId = await patchOrLazyCreate(
        user.id,
        vars.mediaId,
        vars.userMediaId,
        { rating: vars.rating },
      );
      await logActivity(user.id, mediaId, rateActivity(vars.rating));
      return mediaId;
    },
    onMutate: async (vars) => {
      if (!user) return undefined;
      assertValidRating(vars.rating); // pre-cache guard, as in track
      const key = queryKeys.media.viewerTracking(user.id, vars.mediaId);
      const previous = await snapshotViewerTracking(queryClient, key);
      const now = new Date().toISOString();
      const base =
        previous ?? synthesizeOptimisticRow(user.id, vars.mediaId, now);
      const next: UserMediaRow = {
        ...base,
        rating: vars.rating,
        // Rating an UNTRACKED item lazy-creates it as completed (see
        // patchOrLazyCreate) — reflect that now so the detail page highlights
        // watched/played/read, not the Watchlist bookmark. An already-tracked
        // row keeps its status.
        ...(previous ? {} : { status: "completed", completed_at: now }),
        updated_at: now,
      };
      queryClient.setQueryData<UserMediaRow | null>(key, next);
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (!user || !context) return;
      rollbackViewerTracking(
        queryClient,
        queryKeys.media.viewerTracking(user.id, vars.mediaId),
        context.previous
      );
    },
    onSettled: (_data, _error, vars) => {
      if (!user) return;
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type ReviewMediaVars = {
  mediaId: string;
  review: string;
  /** Pass when tracked (web byId parity); omit to lazy-create "want". */
  userMediaId?: string;
};

/**
 * Save review text. With `userMediaId` this is web `reviewMedia`
 * (minus activity logging); without it, the lazy-create path from the
 * file header.
 *
 * Web parity quirk (verified): `reviewMedia` stores the string
 * VERBATIM — an empty string is stored as `""`, not normalized to
 * null. Only `trackMedia` does `review || null`. Mirrored exactly, on
 * both the update and lazy-create paths (web's lazy flow ends in
 * `reviewMedia`, so verbatim there too).
 *
 * Invalidate-only (low-frequency; see file header). Resolves to the
 * row's media_id.
 */
export function useReviewMediaMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ReviewMediaVars): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      const mediaId = await patchOrLazyCreate(
        user.id,
        vars.mediaId,
        vars.userMediaId,
        { review: vars.review },
      );
      // Skip logging an empty review (nothing to show in the feed).
      await logActivity(
        user.id,
        mediaId,
        vars.review.trim() ? reviewActivity(vars.review) : null,
      );
      return mediaId;
    },
    onSuccess: (_mediaIdFromDb, vars) => {
      if (!user) return;
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type ToggleFavoriteVars = {
  mediaId: string;
  /** Pass when tracked (web byId parity); omit to lazy-create "want". */
  userMediaId?: string;
};

/**
 * Flip the favorite flag. With `userMediaId` this is web
 * `toggleFavorite` (read current, write the inverse — minus activity
 * logging); without it, the lazy-create path: an existing row found by
 * (user_id, media_id) is flipped, an untracked item becomes
 * `{ status: "want", is_favorite: true }`.
 *
 * Optimistic: the cached row's flag flips immediately (an untracked
 * item synthesizes a favorited row). The server flip reads the DB
 * value, so if cache and DB disagree the settle-refetch reconciles to
 * the DB. Resolves to the NEW favorite value.
 *
 * Concurrency caveat (favorite × favorite): the flip is read-then-
 * write, so two toggles in flight at once BOTH read the same snapshot
 * and BOTH write its inverse — they converge on the same value, net
 * ONE flip for two taps (e.g. a quick double-toggle from favorited
 * ends unfavorited instead of round-tripping back to favorited). The
 * tracking panel's disabled-while-pending heart guards the SAME-
 * surface double-tap only; the moment a second surface can toggle the
 * same row (M3+ shelf rows), the cross-surface race is re-exposed — a
 * real fix needs an atomic server-side flip
 * (`is_favorite = NOT is_favorite`).
 */
export function useToggleFavoriteMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ToggleFavoriteVars): Promise<boolean> => {
      if (!user) throw new Error("Not signed in.");

      // Locate the row (byId when given, else by user+media) and read
      // the current flag in the same round trip.
      const readCurrent = async () => {
        let query = supabase
          .from("user_media")
          .select("id, is_favorite")
          .eq("user_id", user.id);
        query = vars.userMediaId
          ? query.eq("id", vars.userMediaId)
          : query.eq("media_id", vars.mediaId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data;
      };

      let current = await readCurrent();

      if (!current) {
        // byId callers asserted a row exists — mirror web's error.
        if (vars.userMediaId) throw new Error("Tracking not found");
        // Lazy-create: favoriting an untracked item.
        const payload: TablesInsert<"user_media"> = {
          user_id: user.id,
          media_id: vars.mediaId,
          status: "want",
          is_favorite: true,
        };
        const { error } = await supabase.from("user_media").insert(payload);
        if (!error) {
          await logActivity(user.id, vars.mediaId, favoriteActivity(true));
          return true;
        }
        // 23505: a concurrent lazy-create won the (user_id, media_id)
        // unique race — e.g. rate an untracked item, then favorite it
        // before the rate settles: both read "no row", both insert,
        // this one lost. The item IS tracked now, so re-read and fall
        // through to the flip we'd have done had the first read seen
        // the row.
        if (error.code !== "23505") throw error;
        current = await readCurrent();
        // Gone again (deleted between the conflict and the re-read) —
        // surface the original error; the settle-refetch reconciles.
        if (!current) throw error;
      }

      const newValue = !current.is_favorite;
      const { error } = await supabase
        .from("user_media")
        .update({ is_favorite: newValue })
        .eq("id", current.id)
        .eq("user_id", user.id);
      if (error) throw error;
      await logActivity(user.id, vars.mediaId, favoriteActivity(newValue));
      return newValue;
    },
    onMutate: async (vars) => {
      if (!user) return undefined;
      const key = queryKeys.media.viewerTracking(user.id, vars.mediaId);
      const previous = await snapshotViewerTracking(queryClient, key);
      const now = new Date().toISOString();
      const base =
        previous ?? synthesizeOptimisticRow(user.id, vars.mediaId, now);
      const next: UserMediaRow = {
        ...base,
        is_favorite: !base.is_favorite,
        updated_at: now,
      };
      queryClient.setQueryData<UserMediaRow | null>(key, next);
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (!user || !context) return;
      rollbackViewerTracking(
        queryClient,
        queryKeys.media.viewerTracking(user.id, vars.mediaId),
        context.previous
      );
    },
    onSettled: (_data, _error, vars) => {
      if (!user) return;
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type RemoveTrackingVars = {
  userMediaId: string;
  /** For cache invalidation — not sent to the DB. */
  mediaId: string;
};

/**
 * Delete the viewer's tracking row. Mirrors web `removeTracking`
 * (minus activity logging and its pre-read, which existed only to
 * record the previous status in the activity row).
 *
 * `.select("id")` on the delete forces Postgres to return the deleted
 * rows — an RLS-blocked delete reports success with 0 rows, which
 * would otherwise be indistinguishable from a real delete (web parity,
 * including the thrown message).
 *
 * Invalidate-only (see file header): the row vanishing then snapping
 * back on failure would look worse than a brief pending state.
 */
export function useRemoveTrackingMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RemoveTrackingVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const { data: deleted, error } = await supabase
        .from("user_media")
        .delete()
        .eq("id", vars.userMediaId)
        .eq("user_id", user.id)
        .select("id, status");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error(
          "Failed to remove tracking: nothing was deleted (likely an RLS policy issue)."
        );
      }
      // Log `removed`, carrying the just-deleted row's status for the sentence.
      await logActivity(
        user.id,
        vars.mediaId,
        removeActivity(deleted[0].status),
      );
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      // The row is gone — reflect that immediately (cheap, non-optimistic:
      // we KNOW the delete succeeded), then let invalidation refetch.
      queryClient.setQueryData<UserMediaRow | null>(
        queryKeys.media.viewerTracking(user.id, vars.mediaId),
        null
      );
      invalidateTrackingCaches(queryClient, user.id, vars.mediaId);
    },
  });
}
