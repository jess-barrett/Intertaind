/**
 * TanStack Query mutations for `user_media.progress` edits that must
 * READ-MERGE-WRITE the JSONB blob rather than replace it wholesale.
 *
 * ## Why a separate file from tracking.ts
 *
 * `progress` is a single JSONB column written whole on every write, and
 * `useTrackMediaMutation` (./tracking.ts) sends the entire `progress`
 * payload — web parity, since web's modals merge client-side first. So
 * any flow that touches ONE progress key without going through a modal
 * would, via a blind write, wipe the sibling keys (setting
 * `current_page` would drop `custom_cover_url`, etc.). The fix — mirrored
 * from web's `updateBookPage` / `setCustomCover` / `setCustomBackdrop`
 * server actions — is to FRESH-READ the row's current `progress` from
 * the DB, merge the one change in, and UPDATE.
 *
 * **Always fresh-read from the DB, never merge from cache.** Merging from
 * a cached row risks starting from a stale value or from an
 * `OPTIMISTIC_ID` row synthesized by an in-flight `useTrackMediaMutation`
 * (which has no real DB row yet) — either would clobber concurrent
 * writes. The read here (`select("progress")…maybeSingle()`) is the
 * source of truth for the merge base.
 *
 * The merge itself is the responsibility of the pure builders in
 * `@intertaind/types` (progress.ts) — but page/cover/backdrop are
 * single-key edits that don't need a builder, so they merge inline
 * exactly as their web counterparts do (page: `Math.max(0, floor)`;
 * cover/backdrop: set-or-delete the key). The per-type LOG sheets
 * (Tasks 2.4-2.7) use `useTrackMediaMutation` with a builder-produced
 * merged `progress`.
 *
 * Cache: on success each mutation invalidates the viewer's tracking row
 * (`media.viewerTracking(userId, mediaId)`) and the media detail
 * (`media.detail(mediaId)` — a lazy-created backdrop row bumps the
 * denormalized tracking count). Invalidate-only (no optimistic write):
 * these are low-frequency, deliberate edits where a brief pending state
 * beats a fabricated-then-corrected blob.
 *
 * Conventions (same as ./tracking.ts and ./media.ts): the user comes
 * from `useAuth()` and mutations throw "Not signed in." when absent;
 * raw Supabase errors are thrown (TanStack surfaces them via
 * `mutation.error`); keys come from ./keys.ts, never inline.
 */

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { TablesInsert } from "@intertaind/supabase";
import type { ProgressRecord } from "@intertaind/types";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/**
 * The `user_media.progress` column type (`Json | null`). Sourced through
 * `TablesInsert` rather than importing `Json` directly — `Json` isn't on
 * the `@intertaind/supabase` public surface, and this mirrors how
 * ./tracking.ts refers to the same column. Our locally-merged
 * `ProgressRecord` is cast to this at the write boundary.
 */
type ProgressColumn = TablesInsert<"user_media">["progress"];

/**
 * Invalidate the viewer's tracking row + the media detail after a
 * progress write. Narrower than tracking.ts's set (no `user.shelves`):
 * a page/cover/backdrop edit changes neither shelf membership nor the
 * per-mediaType shelf buckets.
 */
function invalidateProgressCaches(
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
}

/**
 * Fresh-read the current `progress` for a tracking row BY ID (scoped to
 * the owner) — the merge base, deliberately from the DB, never the cache
 * (see file header). THROWS if the row is missing, mirroring web's
 * `.single()` in `updateBookPage`/`setCustomCover`: these callers always
 * hold a real tracking-row id, so a missing row means a stale id (e.g. the
 * row was removed on another device) — surfacing that beats a blind
 * zero-row UPDATE that silently "succeeds". `{}` is returned only for a
 * row that exists but has no progress yet.
 */
async function readProgressById(
  userMediaId: string,
  userId: string
): Promise<ProgressRecord> {
  const { data, error } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Tracking row not found.");
  return (data.progress as ProgressRecord | null) ?? {};
}

export type UpdateBookPageVars = {
  userMediaId: string;
  /** For cache invalidation — not sent to the DB. */
  mediaId: string;
  /** New current page. Coerced to a non-negative integer, like web. */
  currentPage: number;
};

/**
 * Set `progress.current_page` on a book's tracking row — SILENTLY: no
 * status change, no timestamp change. Mirrors web `updateBookPage`
 * exactly, including `Math.max(0, Math.floor(currentPage))` so a
 * negative or fractional page can't be persisted.
 *
 * Fresh-reads the row's `progress` by id, merges the one key, updates.
 * Every other progress key (`sub_shelf`, `total_pages`, `is_reread`,
 * `custom_cover_url`, …) is preserved.
 */
export function useUpdateBookPageMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UpdateBookPageVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const progress = await readProgressById(vars.userMediaId, user.id);
      progress.current_page = Math.max(0, Math.floor(vars.currentPage));
      const { error } = await supabase
        .from("user_media")
        .update({ progress: progress as ProgressColumn })
        .eq("id", vars.userMediaId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      invalidateProgressCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type SetCustomCoverVars = {
  userMediaId: string;
  /** For cache invalidation — not sent to the DB. */
  mediaId: string;
  /** New cover URL, or null to clear (falls back to the shared cover). */
  coverUrl: string | null;
};

/**
 * Set or clear `progress.custom_cover_url` on a book's tracking row.
 * Mirrors web `setCustomCover`: a URL sets the key, `null` DELETES it
 * (so the shared `media_items.cover_image_url` takes over) rather than
 * writing an explicit null.
 *
 * Fresh-reads by id, merges, updates. Preserves all other progress keys
 * (notably `sub_shelf`/`current_page`).
 */
export function useSetCustomCoverMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SetCustomCoverVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const progress = await readProgressById(vars.userMediaId, user.id);
      if (vars.coverUrl) {
        progress.custom_cover_url = vars.coverUrl;
      } else {
        delete progress.custom_cover_url;
      }
      const { error } = await supabase
        .from("user_media")
        .update({ progress: progress as ProgressColumn })
        .eq("id", vars.userMediaId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      invalidateProgressCaches(queryClient, user.id, vars.mediaId);
    },
  });
}

export type SetCustomBackdropVars = {
  mediaId: string;
  /** New backdrop URL, or null to clear (falls back to the shared one). */
  backdropUrl: string | null;
};

/**
 * Set or clear `progress.custom_backdrop_url` for a non-book media item.
 * Mirrors web `setCustomBackdrop`, including its lazy-create: keyed by
 * (user_id, media_id) rather than a tracking-row id, so a viewer can
 * customize a backdrop on a title they haven't tracked yet — if no row
 * exists, one is created with `status: "want"` and the initial progress
 * (`{ custom_backdrop_url }` when setting, `{}` when clearing) so the
 * override has somewhere to live.
 *
 * When a row exists, fresh-reads its `progress`, merges (URL sets the
 * key, `null` deletes it), and updates — preserving every other key.
 *
 * Concurrency: the lazy-create insert can race a concurrent lazy-create
 * on the same (user_id, media_id) unique constraint. On 23505 the loser
 * re-reads the row the winner created and completes as a merge-update —
 * mirroring `patchOrLazyCreate`'s retry in ./tracking.ts, so a backdrop
 * save can't spuriously throw when it races a first-time track.
 */
export function useSetCustomBackdropMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SetCustomBackdropVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const userId = user.id;

      // Merge-update the row's progress by its id; null backdrop deletes
      // the key. Shared by the found-existing path and the 23505 retry.
      const mergeIntoRow = async (
        rowId: string,
        rowProgress: ProgressRecord | null
      ): Promise<void> => {
        const progress = rowProgress ?? {};
        if (vars.backdropUrl) {
          progress.custom_backdrop_url = vars.backdropUrl;
        } else {
          delete progress.custom_backdrop_url;
        }
        const { error } = await supabase
          .from("user_media")
          .update({ progress: progress as ProgressColumn })
          .eq("id", rowId)
          .eq("user_id", userId);
        if (error) throw error;
      };

      // Fresh-read the (user, media) row — id + progress in one trip.
      const readRow = async () => {
        const { data, error } = await supabase
          .from("user_media")
          .select("id, progress")
          .eq("user_id", userId)
          .eq("media_id", vars.mediaId)
          .maybeSingle();
        if (error) throw error;
        return data;
      };

      const existing = await readRow();
      if (existing) {
        await mergeIntoRow(
          existing.id,
          existing.progress as ProgressRecord | null
        );
        return;
      }

      // Lazy-create a wishlist row so the override has a place to live
      // (web parity — a quiet side effect, no activity log).
      const initialProgress = vars.backdropUrl
        ? { custom_backdrop_url: vars.backdropUrl }
        : {};
      const payload: TablesInsert<"user_media"> = {
        user_id: userId,
        media_id: vars.mediaId,
        status: "want",
        progress: initialProgress as ProgressColumn,
      };
      const { error } = await supabase.from("user_media").insert(payload);
      if (!error) return;

      // 23505: a concurrent lazy-create won the (user_id, media_id) race
      // — re-read the row it created and merge into it instead of
      // throwing (mirrors patchOrLazyCreate in ./tracking.ts).
      if (error.code === "23505") {
        const raced = await readRow();
        if (raced) {
          await mergeIntoRow(raced.id, raced.progress as ProgressRecord | null);
          return;
        }
      }
      throw error;
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      invalidateProgressCaches(queryClient, user.id, vars.mediaId);
    },
  });
}
