/**
 * TanStack Query hooks for the USER PROFILE experience — the read side of the
 * shared `ProfileView` (the viewer's own `(profile)` tab AND anyone else's
 * `u/[username]` route). Mirrors web's `/u/[username]` reads, all as
 * anon/authed Supabase-JS over RLS — no Edge Function, no server secret.
 *
 * Conventions mirror the sibling query files (./home.ts, ./recommendations.ts):
 *   - `Pick<Tables<...>>` explicit selects document, at the call site, exactly
 *     which columns each read pulls — never `select("*")`.
 *   - Throw on Supabase errors so TanStack surfaces them via `error` — with
 *     ONE documented exception: `useProfile` maps PostgREST's "no rows" code
 *     (PGRST116) to `null` so a missing/RLS-hidden (private) profile renders an
 *     empty state instead of a thrown error.
 *   - `enabled` gates the round trip; keys come from ./keys.ts, never inline.
 *
 * RLS note (deferral, per docs/plans/2026-07-08-mobile-profile.md): the
 * `profiles` policies expose public profiles OR the owner (migrations 004/007/
 * 008). A private, non-owned profile therefore returns no row here → `null` →
 * the caller renders the "This profile is private" empty state. The
 * "followers-see-private" + block-aware reads are NOT DB-enforced (reverted in
 * 008, only in web server-code); v1 does NOT attempt follower-peek or block
 * filtering.
 */

import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";
import type { MediaType } from "@intertaind/types";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/**
 * The profile-header-facing subset of a `profiles` row — identity, the bio,
 * the denormalized follower/following counts, the privacy flag (gates the
 * private empty state), and `created_at` (a future "member since"). Narrower
 * than `@intertaind/types`' `Profile` on purpose: only what the header renders,
 * and structurally a subset so it still satisfies `Profile` where needed.
 */
export type ProfileRow = Pick<
  Tables<"profiles">,
  | "id"
  | "username"
  | "display_name"
  | "avatar_url"
  | "bio"
  | "is_private"
  | "followers_count"
  | "following_count"
  | "created_at"
>;

/** Column list for a ProfileRow, shared by the by-id and by-username reads. */
const PROFILE_COLS =
  "id, username, display_name, avatar_url, bio, is_private, followers_count, following_count, created_at";

/** PostgREST's "no rows returned from .single()" code — mapped to `null`. */
const NO_ROWS = "PGRST116";

/**
 * Resolve ONE `profiles` row by EITHER `userId` (the `(profile)` tab, which has
 * the viewer's id from `useAuth`) OR `username` (the `u/[username]` route). The
 * caller passes exactly one; the hook picks the matching `.eq(...)` + query key.
 *
 * `.single()` returns the row or a PostgREST error. A missing row — genuinely
 * absent, OR hidden by RLS because it's a private profile the viewer can't see
 * — surfaces as PGRST116; we map that to `null` (NOT a throw) so the caller can
 * render a "not found" / "private" empty state. Any OTHER error throws.
 *
 * `enabled: !!(userId || username)` — nothing to resolve until one identifier
 * is present (e.g. the tab before `useAuth` settles). The public profile row is
 * RLS-scoped (public or owner), so no viewer id in the key: it's shared across
 * viewers and works pre-auth.
 */
export function useProfile({
  userId,
  username,
}: {
  userId?: string;
  username?: string;
}) {
  return useQuery({
    queryKey: userId
      ? queryKeys.user.profile(userId)
      : queryKeys.user.byUsername(username ?? ""),
    enabled: !!(userId || username),
    queryFn: async (): Promise<ProfileRow | null> => {
      let query = supabase.from("profiles").select(PROFILE_COLS);
      query = userId
        ? query.eq("id", userId)
        : query.eq("username", username!);
      const { data, error } = await query.single();
      if (error) {
        // No row — missing profile, or a private one RLS hides from this
        // viewer. Return null so the caller shows an empty state, not a throw.
        if (error.code === NO_ROWS) return null;
        throw error;
      }
      return data;
    },
  });
}

/** The four per-media-type engagement counts a profile header shows. */
export type ProfileMediaCounts = Record<MediaType, number>;

/** The four types + whether that type excludes `want` (backlog) rows. */
const COUNT_TYPES: { type: MediaType; excludeWant: boolean }[] = [
  // movie/tv_show/video_game exclude the backlog ('want'): the header count is
  // "engaged with", not "in the watchlist/wishlist" (web parity).
  { type: "movie", excludeWant: true },
  { type: "tv_show", excludeWant: true },
  // Books count ALL tracked rows including 'want' (TBR) — web counts the whole
  // shelf for books, so no `neq` here.
  { type: "book", excludeWant: false },
  { type: "video_game", excludeWant: true },
];

/**
 * The four per-media-type engagement counts for a profile header (movie /
 * tv_show / book / video_game). Four parallel head-only COUNT reads (no rows
 * transferred — `{ count: "exact", head: true }`), each joining `user_media`
 * to `media_items` via `!inner` and filtering to that type. Mirrors web's
 * per-type count reads: exclude `want` (backlog) for movie/tv/game; count all
 * statuses for books.
 *
 * `enabled: !!userId`; keyed by the PROFILE owner's id (the counts belong to
 * the profile being viewed, identical for every viewer under RLS).
 */
export function useProfileMediaCounts(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user.mediaCounts(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileMediaCounts> => {
      const results = await Promise.all(
        COUNT_TYPES.map(async ({ type, excludeWant }) => {
          let query = supabase
            .from("user_media")
            .select("id, media_items!inner(media_type)", {
              count: "exact",
              head: true,
            })
            .eq("user_id", userId!)
            .eq("media_items.media_type", type);
          if (excludeWant) query = query.neq("status", "want");
          const { count, error } = await query;
          if (error) throw error;
          return [type, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(results) as ProfileMediaCounts;
    },
  });
}
