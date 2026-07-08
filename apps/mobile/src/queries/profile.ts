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
import { type MediaType, TOP_4_SHELF_NAMES } from "@intertaind/types";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";
import { HOME_MEDIA_COLS, type HomeMediaItem } from "./home";
import type { ShelfSection } from "@/components/profile/shelf-config";

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

/**
 * The profile's Top-4 favorites, per media type — the curated `__top5_<type>`
 * shelves the Overview renders as small poster grids. Returns the full 4-key
 * map (empty arrays where a type has no favorites) so the caller can render or
 * skip each type without a `?.` dance.
 */
export type ProfileTopFours = Record<MediaType, HomeMediaItem[]>;

/** Shape of one embedded shelf_items → media_items row (the card fields). */
type TopFourItemRow = {
  shelf_id: string;
  position: number;
  media_items: HomeMediaItem | null;
};

/** An all-empty Top-4 map — the no-shelves short-circuit + per-type default. */
function emptyTopFours(): ProfileTopFours {
  return { movie: [], tv_show: [], book: [], video_game: [] };
}

/**
 * The profile's Top-4 favorites per media type — the four curated
 * `__top5_<type>` shelves (`TOP_4_SHELF_NAMES`), NOT `user_media.is_favorite`.
 * Mirrors web's `/u/[username]/page.tsx` two-step read:
 *
 *   1. `shelves` — the (up to four) curated shelves this user owns, matched by
 *      the reserved `__top5_<type>` names. No shelves → return the all-empty
 *      map, skipping the second round trip.
 *   2. `shelf_items` — the items across those shelf ids, position-ordered, each
 *      embedding the `media_items` card fields. Cast `as unknown as` because
 *      the embed is an explicit column subset (same pattern as home.ts).
 *
 * Then invert `TOP_4_SHELF_NAMES` (shelf name → MediaType), group items by
 * their shelf's type, drop rows whose media embed is null, and cap 4 per type.
 * The `.limit(20)` on the items read matches web (4 shelves × ~5 headroom).
 *
 * Profile-owner-scoped: `enabled: !!userId`, keyed by `topFours(userId)`.
 */
export function useProfileTopFours(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user.topFours(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileTopFours> => {
      // (1) The curated shelves this user owns (by reserved name).
      const { data: shelves, error: shelvesError } = await supabase
        .from("shelves")
        .select("id, name")
        .eq("user_id", userId!)
        .in("name", Object.values(TOP_4_SHELF_NAMES));
      if (shelvesError) throw shelvesError;

      const result = emptyTopFours();
      if (!shelves || shelves.length === 0) return result;

      // Shelf id → its MediaType (invert TOP_4_SHELF_NAMES: name → type).
      const nameToType = new Map<string, MediaType>(
        (Object.entries(TOP_4_SHELF_NAMES) as [MediaType, string][]).map(
          ([type, name]) => [name, type],
        ),
      );
      const shelfIdToType = new Map<string, MediaType>();
      for (const shelf of shelves) {
        const type = nameToType.get(shelf.name);
        if (type) shelfIdToType.set(shelf.id, type);
      }

      // (2) The items across those shelves, position-ordered.
      const shelfIds = shelves.map((s) => s.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from("shelf_items")
        .select(`shelf_id, position, media_items(${HOME_MEDIA_COLS})`)
        .in("shelf_id", shelfIds)
        .order("position", { ascending: true })
        .limit(20);
      if (itemsError) throw itemsError;

      // Group by the shelf's type, drop null media, cap 4 per type.
      for (const row of (itemsData ?? []) as unknown as TopFourItemRow[]) {
        const type = shelfIdToType.get(row.shelf_id);
        if (!type || !row.media_items) continue;
        if (result[type].length >= 4) continue;
        result[type].push(row.media_items);
      }
      return result;
    },
  });
}

/**
 * One `activity_log` row for the Overview's Recent activity / Recent reviews
 * lists — the id/type/metadata/timestamp plus the embedded media (title +
 * cover + type) so a row renders its thumbnail and `formatActivity` sentence
 * without a second lookup. Mirrors web's `ActivityWithMedia` shape and the
 * `listUserActivity` / `listUserRecentReviews` selects.
 */
export type ProfileActivityRow = Pick<
  Tables<"activity_log">,
  "id" | "user_id" | "media_id" | "activity_type" | "metadata" | "created_at"
> & {
  media: Pick<
    Tables<"media_items">,
    "id" | "title" | "cover_image_url" | "media_type"
  > | null;
};

/** The column list + embedded media for a ProfileActivityRow (web parity). */
const ACTIVITY_COLS =
  "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)";

/**
 * The profile's most-recent activity — the Overview "Recent activity" preview
 * (default 3). Mirrors web's `listUserActivity`: all activity types, newest
 * first, embedding the media card fields. `as unknown as` cast because the
 * media embed is an explicit column subset. RLS scopes visibility to what the
 * viewer may see (public profiles / owner). `enabled: !!userId`, keyed by
 * `recentActivity(userId)`.
 */
export function useProfileRecentActivity(
  userId: string | undefined,
  limit = 3,
) {
  return useQuery({
    queryKey: queryKeys.user.recentActivity(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileActivityRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select(ACTIVITY_COLS)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileActivityRow[];
    },
  });
}

/**
 * The profile's most-recent REVIEWS — the Overview "Recent reviews" preview
 * (default 3). Same read as `useProfileRecentActivity` with an added
 * `.eq("activity_type", "reviewed")` filter (mirrors web's
 * `listUserRecentReviews`). Keyed separately (`recentReviews(userId)`) so the
 * two Overview sections cache independently.
 */
export function useProfileRecentReviews(
  userId: string | undefined,
  limit = 3,
) {
  return useQuery({
    queryKey: queryKeys.user.recentReviews(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileActivityRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select(ACTIVITY_COLS)
        .eq("user_id", userId!)
        .eq("activity_type", "reviewed")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileActivityRow[];
    },
  });
}

/**
 * One row of a profile's Shelves-tab section: the media card fields PLUS the
 * SHELF OWNER's own tracking (`rating` / `is_favorite`) carried off their
 * `user_media` row. The owner's rating/heart is what a shelf card shows by
 * default — this is "their" shelf — so we embed it here rather than looking it
 * up per card. (A non-owner VIEWER's own overlay, when browsing someone else's
 * shelf, comes separately via `useViewerTrackingMap` in the component.)
 */
export type ProfileShelfItem = HomeMediaItem & {
  /** The shelf OWNER's rating (DB scale 1–10) for this title, or null. */
  rating: Tables<"user_media">["rating"];
  /** Whether the shelf OWNER favorited this title. */
  is_favorite: Tables<"user_media">["is_favorite"];
};

/** Shape of one embedded row from the user_media → media_items shelf join. */
type ShelfJoinRow = Pick<Tables<"user_media">, "rating" | "is_favorite"> & {
  media_items: HomeMediaItem | null;
};

/** Rows per shelf section (pagination deferred — one generous page for v1). */
const SHELF_LIMIT = 60;

/**
 * One status section of a profile's shelf — a media type + a `ShelfSection`
 * (from SHELF_CONFIG) → the owner's tracked titles in that section, embedding
 * each item's card fields AND the owner's own rating/is_favorite. Mirrors web's
 * per-type shelf reads:
 *
 *   `user_media` joined `media_items!inner` (drops a tracking row whose media
 *   item is missing — never a half-populated card), filtered to the profile
 *   owner + this `media_type`, then the section's ONE filter:
 *     - `section.status`    → `.eq("status", …)`         (movie/tv/book + game wishlist)
 *     - `section.subStatus` → `.eq("progress->>sub_status", …)` (game play-states)
 *   newest-touched first (`updated_at` desc), capped at SHELF_LIMIT (pagination
 *   is deferred — see docs/plans/2026-07-08-mobile-profile.md).
 *
 * `as unknown as` cast because the media embed is an explicit column subset (so
 * it doesn't match the fully-inferred embed shape — same pattern as home.ts).
 *
 * Gated on `enabled: !!userId` (the profile must be resolved first); keyed by
 * `queryKeys.user.shelf(userId, mediaType, section.key)` so each type+section
 * caches independently and a switch refetches cleanly. RLS scopes the read to
 * what the viewer may see (public profiles / owner).
 */
export function useProfileShelf(
  userId: string | undefined,
  mediaType: MediaType,
  section: ShelfSection,
) {
  return useQuery({
    queryKey: queryKeys.user.shelf(userId ?? "anon", mediaType, section.key),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileShelfItem[]> => {
      let query = supabase
        .from("user_media")
        .select(`rating, is_favorite, media_items!inner(${HOME_MEDIA_COLS})`)
        .eq("user_id", userId!)
        .eq("media_items.media_type", mediaType);

      // Exactly one filter directive per section (discriminated in the config):
      // a top-level status, or the progress JSONB sub_status path.
      if (section.status !== undefined) {
        query = query.eq("status", section.status);
      } else {
        query = query.eq("progress->>sub_status", section.subStatus);
      }

      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(SHELF_LIMIT);
      if (error) throw error;

      const rows = (data ?? []) as unknown as ShelfJoinRow[];
      return rows
        .filter((row): row is ShelfJoinRow & { media_items: HomeMediaItem } =>
          row.media_items != null,
        )
        .map((row) => ({
          ...row.media_items,
          rating: row.rating,
          is_favorite: row.is_favorite,
        }));
    },
  });
}
