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

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";
import { type MediaType, TOP_4_SHELF_NAMES } from "@intertaind/types";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { trackingErrorMessage } from "@/lib/tracking-errors";
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

/**
 * One authored cross-media pairing ("intertain") on a profile's Recs tab — the
 * row id, the author's `note` + `created_at`, and BOTH paired `media_items`
 * sides ("if you liked SOURCE, try RECOMMENDED"). Unlike the media-detail
 * recommendations reads (./recommendations.ts), which render ONE side (the
 * page's media is the implicit other), the profile Recs tab shows BOTH sides —
 * the viewer hasn't picked a side, so the full pairing reads at a glance.
 * Mirrors web's `fetchUserRecommendations` (apps/web/src/app/actions/
 * recommendations.ts) + `ProfileRecommendationCard`'s `source → target` layout.
 */
export type ProfileRecommendation = {
  id: string;
  note: string | null;
  created_at: string | null;
  /** The "if you liked …" side — null if the embedded media is missing. */
  source: HomeMediaItem | null;
  /** The "…try …" side — null if the embedded media is missing. */
  recommended: HomeMediaItem | null;
};

/** Shape of one embedded recommendations row (both media sides). */
type ProfileRecommendationRow = {
  id: string;
  note: string | null;
  created_at: string | null;
  source: HomeMediaItem | null;
  recommended: HomeMediaItem | null;
};

/** Pairings pulled for the Recs tab (web parity: `fetchUserRecommendations`). */
const RECS_LIMIT = 50;

/**
 * A profile's AUTHORED cross-media pairings — the Recs tab. Every "if you liked
 * SOURCE, try RECOMMENDED" the profile owner has posted, newest first, both
 * paired `media_items` sides embedded so a card renders the full pairing.
 * Mirrors web's `fetchUserRecommendations`:
 *
 *   `recommendations` filtered to `user_id`, ordered `created_at` desc, capped
 *   at 50, embedding BOTH media sides via FK hints — `source:` off
 *   `recommendations_source_media_id_fkey` and `recommended:` off
 *   `recommendations_recommended_media_id_fkey` (the SAME FK-hint aliases +
 *   `as unknown as` cast pattern as ./recommendations.ts; the media embeds are
 *   explicit column subsets so the query builder can't infer their shape).
 *   Web selects `source_media` / `recommended_media` to match its
 *   `RecommendationWith…` types; here the return shape is our own, so the
 *   aliases read as the plain `source` / `recommended` the card consumes.
 *
 * A row whose EITHER media side is null (a media item RLS-hides or that was
 * removed) is dropped — a pairing card needs both posters. RLS scopes reads to
 * public authors (or the owner), so this anon-authed read is safe pre-auth.
 *
 * Profile-owner-scoped: `enabled: !!userId`, keyed by
 * `queryKeys.user.recommendations(userId)`.
 */
export function useProfileRecommendations(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user.recommendations(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRecommendation[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          `id, note, created_at, source:media_items!recommendations_source_media_id_fkey(${HOME_MEDIA_COLS}), recommended:media_items!recommendations_recommended_media_id_fkey(${HOME_MEDIA_COLS})`,
        )
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(RECS_LIMIT);
      if (error) throw error;

      // Cast: both media embeds are explicit column subsets (same pattern as
      // ./recommendations.ts + home.ts). Drop rows missing either side — a
      // pairing card needs both posters.
      const rows = (data ?? []) as unknown as ProfileRecommendationRow[];
      return rows.filter(
        (row): row is ProfileRecommendation =>
          row.source != null && row.recommended != null,
      );
    },
  });
}

/**
 * Author subset a profile list card renders (same shape as home.ts's
 * `PopularListAuthor`; redeclared locally so profile.ts doesn't take a type
 * dependency on the home rail — the two reads happen to render the same author
 * fields, not because one is derived from the other).
 */
export type ProfileListAuthor = Pick<
  Tables<"profiles">,
  "id" | "username" | "display_name" | "avatar_url"
>;

/** Card-facing subset of a `lists` row — what a profile list card renders. */
export type ProfileListSummary = Pick<
  Tables<"lists">,
  | "id"
  | "title"
  | "description"
  | "item_count"
  | "like_count"
  | "saves_count"
  | "visibility"
>;

/** One entry on the profile Lists tab: the list, its author, cover previews. */
export type ProfileListCard = {
  list: ProfileListSummary;
  author: ProfileListAuthor;
  /** Up to LIST_PREVIEW_COUNT cover urls, position-ordered (nulls dropped). */
  covers: string[];
};

/** Shape of the first read: list card fields + the embedded author. */
type ProfileListRow = ProfileListSummary & {
  profiles: ProfileListAuthor;
};

/** Shape of the second read: a list_items → media_items cover join row. */
type ProfileListCoverRow = {
  list_id: string;
  media_items: Pick<Tables<"media_items">, "id" | "cover_image_url"> | null;
};

/** Created lists pulled for the Lists tab (web parity: `fetchLists` limit 50). */
const LISTS_LIMIT = 50;
/** Cover thumbnails previewed per list card (mirrors home.ts's rail). */
const LIST_PREVIEW_COUNT = 5;

/**
 * A profile's CREATED lists — the Lists tab (v1: created only). Mirrors web's
 * `apps/web/src/app/u/[username]/lists/page.tsx` `fetchLists("mine")` + the
 * batched cover-preview read, and follows the same two-step shape as home.ts's
 * `usePopularLists` (the profile read is that rail filtered by `user_id` instead
 * of visibility + like_count):
 *
 *   1. `lists` where `user_id = userId`, newest-touched first (`updated_at`
 *      desc), limit 50, embedding the author `profiles!lists_user_id_fkey(...)`.
 *      (`lists.user_id` FKs `profiles`, so the embed is inferable — the
 *      `as unknown as` cast is only needed because the select is an explicit
 *      column subset.) No lists → skip the second round trip.
 *   2. A single batched read of up to LIST_PREVIEW_COUNT cover previews per list
 *      from `list_items` joined to `media_items(id, cover_image_url)`,
 *      `.in("list_id", ids).order("position")` — the same "order by position
 *      globally, cap the response (2× headroom), take the first N per list
 *      client-side" trick as home.ts.
 *
 * `isOwner` gates ONLY the visibility filter, not the key. The OWNER sees ALL
 * their lists (public / unlisted / friends_unlisted / private); a NON-OWNER
 * sees ONLY `public` ones (web parity — `unlisted` lists are reachable by
 * direct link but are NOT listed on the profile, and RLS would otherwise let
 * `unlisted` through). Since RLS already scopes the read per-viewer, keying on
 * `userId` alone is correct (no viewer id needed).
 *
 * Deferred (per docs/plans/2026-07-08-mobile-profile.md): the Saved (liked)
 * lists sub-tab (`list_saves`); `friends_unlisted` handling beyond what RLS
 * enforces. Non-navigable in v1 (no mobile list-detail route yet).
 *
 * Profile-owner-scoped: `enabled: !!userId`, keyed by
 * `queryKeys.user.lists(userId)`.
 */
export function useProfileLists(
  userId: string | undefined,
  isOwner: boolean,
) {
  return useQuery({
    queryKey: queryKeys.user.lists(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileListCard[]> => {
      // (1) The user's created lists + author. Non-owner: PUBLIC only (web
      // parity — `unlisted` lists aren't listed on the profile even though RLS
      // would allow reading them). Owner: all of their own lists.
      let listsQuery = supabase
        .from("lists")
        .select(
          "id, title, description, item_count, like_count, saves_count, visibility, profiles!lists_user_id_fkey(id, username, display_name, avatar_url)",
        )
        .eq("user_id", userId!);
      if (!isOwner) listsQuery = listsQuery.eq("visibility", "public");
      const { data: listsData, error: listsError } = await listsQuery
        .order("updated_at", { ascending: false })
        .limit(LISTS_LIMIT);
      if (listsError) throw listsError;

      const lists = (listsData ?? []) as unknown as ProfileListRow[];
      if (lists.length === 0) return [];

      // (2) Batched cover previews: order by position globally so each list
      // contributes its earliest items; cap the response (2× headroom so a
      // list whose earliest items lack covers still fills its N).
      const listIds = lists.map((l) => l.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from("list_items")
        .select("list_id, media_items(id, cover_image_url)")
        .in("list_id", listIds)
        .order("position", { ascending: true })
        .limit(listIds.length * LIST_PREVIEW_COUNT * 2);
      if (itemsError) throw itemsError;

      const coversByList = new Map<string, string[]>();
      for (const row of (itemsData ?? []) as unknown as ProfileListCoverRow[]) {
        const cover = row.media_items?.cover_image_url;
        if (!cover) continue;
        const arr = coversByList.get(row.list_id) ?? [];
        if (arr.length >= LIST_PREVIEW_COUNT) continue;
        arr.push(cover);
        coversByList.set(row.list_id, arr);
      }

      return lists.map((row) => {
        const { profiles, ...list } = row;
        return {
          list,
          author: profiles,
          covers: coversByList.get(list.id) ?? [],
        };
      });
    },
  });
}

// ─── Social graph (M6a): follow state + mutations + follower/following lists ─
//
// All social reads/writes go through the `follows` / `follow_requests` tables
// (migrations 007/008) under their RLS:
//   - `follows_insert_self`   — WITH CHECK (follower_id = auth.uid())
//   - `follows_delete_self`   — USING (follower_id = auth.uid())
//   - `follow_requests_insert_self`   — WITH CHECK (requester_id = auth.uid())
//   - `follow_requests_delete_involved` — USING (requester_id = auth.uid()
//                                                 OR target_id = auth.uid())
//   - `follows_select_involved` — the viewer sees a follow row when they're
//     either party OR either party's profile is public.
// A DB trigger (`handle_follows_change`) maintains the DENORMALIZED
// `profiles.followers_count` / `following_count` and inserts the recipient's
// `notifications` row on INSERT/DELETE — so after a follow/unfollow we
// INVALIDATE the affected `profile` / `byUsername` query to refetch the fresh
// counts rather than hand-mutating them (never trust a client-side count when a
// trigger owns it).
//
// Deferred (per docs/plans/2026-07-08-mobile-profile.md): blocks / block-aware
// filtering; the private-profile follower-visibility gate (NOT DB-enforced —
// reverted in 008, web-server-only); per-row follow buttons in the lists.

/** The viewer's relationship to a target profile — the Follow button's state. */
export type FollowState = "self" | "none" | "following" | "requested";

/**
 * The viewer's relationship to `targetUserId` (`useAuth`-scoped) — what the
 * header Follow button renders. `"self"` when the viewer IS the target (no
 * button); otherwise a two-step read under `follows_select_involved` /
 * `follow_requests_select_involved`:
 *
 *   1. `follows` for (follower_id = viewer, following_id = target) →
 *      `"following"` when a row exists.
 *   2. else `follow_requests` for (requester_id = viewer, target_id = target) →
 *      `"requested"` (a pending request against a PRIVATE target).
 *   3. else `"none"`.
 *
 * Both are `.maybeSingle()` reads on the composite PK — 0-or-1 row, never a
 * throw on "no row". `enabled: !!user && !!targetUserId`; keyed by BOTH ids
 * (`followState(viewer, target)`) — it's inherently a per-viewer, per-target
 * fact. The `"self"` case still runs the query (cheaply short-circuiting in the
 * queryFn) so the key stays stable across a target switch.
 */
export function useFollowState(targetUserId: string | undefined) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery({
    queryKey: queryKeys.user.followState(viewerId ?? "anon", targetUserId ?? ""),
    enabled: !!viewerId && !!targetUserId,
    queryFn: async (): Promise<FollowState> => {
      if (viewerId === targetUserId) return "self";

      const { data: follow, error: followError } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", viewerId!)
        .eq("following_id", targetUserId!)
        .maybeSingle();
      if (followError) throw followError;
      if (follow) return "following";

      const { data: request, error: requestError } = await supabase
        .from("follow_requests")
        .select("requester_id")
        .eq("requester_id", viewerId!)
        .eq("target_id", targetUserId!)
        .maybeSingle();
      if (requestError) throw requestError;
      if (request) return "requested";

      return "none";
    },
  });
}

/**
 * Vars for the follow/unfollow mutations. `isPrivate` routes a FOLLOW to the
 * right table (public → `follows`; private → `follow_requests`); `username`,
 * when known (the header has it), lets the invalidation also refresh the
 * username-keyed profile query so the denormalized counts refetch there too.
 */
export type FollowVars = {
  /** The profile being followed/unfollowed. */
  targetUserId: string;
  /** PRIVATE target → a follow becomes a request (see `follows_insert_self`). */
  isPrivate: boolean;
  /** The target's username, when the caller knows it — invalidates byUsername. */
  username?: string;
};

/**
 * Invalidate every query a follow-graph change (in either direction) touches:
 *   - the viewer's follow-STATE against this target (none↔following↔requested);
 *   - the target's `profile(target)` + `byUsername(username)` (the DB trigger
 *     bumped the DENORMALIZED followers_count — refetch, don't hand-mutate);
 *   - the target's `followers(target)` list (a new/removed follower);
 *   - the viewer's own `following(viewer)` list (they gained/lost a followee).
 * (A pending follow_request changes no count, so its invalidation set is a
 * subset — but re-running the whole set is harmless and keeps the call sites
 * uniform.)
 */
function invalidateFollowCaches(
  queryClient: QueryClient,
  viewerId: string,
  vars: FollowVars,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.user.followState(viewerId, vars.targetUserId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.user.profile(vars.targetUserId),
  });
  if (vars.username) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.user.byUsername(vars.username),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.user.followers(vars.targetUserId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.user.following(viewerId),
  });
}

/**
 * Follow a profile. PUBLIC target → INSERT `follows` (follower_id = viewer,
 * following_id = target) under `follows_insert_self`; the trigger bumps the
 * counts + notifies. PRIVATE target → INSERT `follow_requests` (requester_id =
 * viewer, target_id = target) under `follow_requests_insert_self`; its trigger
 * notifies the target (no count change until they accept — acceptance is a
 * later milestone). Errors surface as friendly copy via `trackingErrorMessage`
 * (never a raw PostgREST error). Invalidate-only on success (see file header).
 */
export function useFollowMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: FollowVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      if (vars.isPrivate) {
        const { error } = await supabase
          .from("follow_requests")
          .insert({ requester_id: user.id, target_id: vars.targetUserId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: vars.targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      invalidateFollowCaches(queryClient, user.id, vars);
    },
    onError: (error) => {
      // Map to friendly copy at the mutation boundary — a component reads
      // `mutation.error?.message` and renders it verbatim, so never leak the
      // raw PostgREST/network error.
      throw new Error(trackingErrorMessage(error, "your follow", "follow"));
    },
  });
}

/**
 * Unfollow a profile, OR cancel a pending follow request. DELETE from BOTH
 * `follows` (follower_id = viewer, following_id = target — `follows_delete_self`)
 * and `follow_requests` (requester_id = viewer, target_id = target —
 * `follow_requests_delete_involved`): exactly one has a row for a given state
 * (following vs requested), and deleting the absent one is a harmless 0-row
 * delete, so a single mutation covers "Following → tap to unfollow" AND
 * "Requested → tap to cancel" without the caller branching on state. The
 * `follows` delete fires the trigger that decrements the counts; invalidation
 * then refetches them. Friendly errors via `trackingErrorMessage`.
 */
export function useUnfollowMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: FollowVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const { error: followError } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", vars.targetUserId);
      if (followError) throw followError;
      const { error: requestError } = await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", user.id)
        .eq("target_id", vars.targetUserId);
      if (requestError) throw requestError;
    },
    onSuccess: (_data, vars) => {
      if (!user) return;
      invalidateFollowCaches(queryClient, user.id, vars);
    },
    onError: (error) => {
      throw new Error(trackingErrorMessage(error, "your follow", "follow"));
    },
  });
}

/**
 * The identity subset a Followers / Following row renders — avatar + name +
 * @handle, all the row needs to display and navigate to `/u/<username>`.
 */
export type FollowListUser = Pick<
  Tables<"profiles">,
  "id" | "username" | "display_name" | "avatar_url"
>;

/** Rows pulled per Followers / Following page (pagination deferred for v1). */
const FOLLOW_LIST_LIMIT = 50;

/** Shape of one embedded follows → profiles row (either FK direction). */
type FollowJoinRow = {
  created_at: string;
  profiles: FollowListUser | null;
};

/**
 * A profile's FOLLOWERS — the users following `userId`. Reads `follows` filtered
 * to `following_id = userId`, embedding the FOLLOWER's profile via the
 * `follows_follower_id_fkey` hint (the other end of the edge), newest edge
 * first, capped at 50. `as unknown as` cast because the embed is an explicit
 * column subset (same pattern as home.ts). Under `follows_select_involved`, an
 * anon/other viewer sees these rows when the profiles involved are public (RLS
 * scopes visibility). `enabled: !!userId`, keyed by `followers(userId)`.
 */
export function useFollowers(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user.followers(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<FollowListUser[]> => {
      const { data, error } = await supabase
        .from("follows")
        .select(
          "created_at, profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)",
        )
        .eq("following_id", userId!)
        .order("created_at", { ascending: false })
        .limit(FOLLOW_LIST_LIMIT);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as unknown as FollowJoinRow).profiles)
        .filter((p): p is FollowListUser => p != null);
    },
  });
}

/**
 * The users a profile is FOLLOWING — `follows` filtered to `follower_id =
 * userId`, embedding the FOLLOWED profile via `follows_following_id_fkey`,
 * newest edge first, capped at 50. Same cast/RLS notes as `useFollowers` (the
 * mirror-image read). `enabled: !!userId`, keyed by `following(userId)`.
 */
export function useFollowing(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.user.following(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<FollowListUser[]> => {
      const { data, error } = await supabase
        .from("follows")
        .select(
          "created_at, profiles!follows_following_id_fkey(id, username, display_name, avatar_url)",
        )
        .eq("follower_id", userId!)
        .order("created_at", { ascending: false })
        .limit(FOLLOW_LIST_LIMIT);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as unknown as FollowJoinRow).profiles)
        .filter((p): p is FollowListUser => p != null);
    },
  });
}
