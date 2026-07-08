/**
 * TanStack Query hooks for the personalized HOME screen — the read side of
 * the discovery feed that replaces the placeholder Trending tab.
 *
 * Sections (each self-hides when its hook returns []):
 *   Continue (your in-progress) → Recommended for you → Popular
 *   Movies/Shows/Books/Games → Popular Lists.
 *
 * Conventions mirror the sibling query files (./media.ts, ./recommendations.ts,
 * ./tracking.ts):
 *   - `Pick<Tables<...>>` return types document, at the call site, exactly
 *     which columns each read pulls — never `select("*")`.
 *   - Throw on Supabase errors; TanStack surfaces them via `error`.
 *   - User-scoped hooks gate on `enabled: !!user` and key by `user.id`
 *     (with an "anon" placeholder that never fetches while signed out).
 *   - Keys come from ./keys.ts, never inline.
 *
 * All reads are anon/authed Supabase over RLS-public catalog data — no Edge
 * Function, no server secret (per apps/mobile/AGENTS.md's deferred-Edge-
 * Functions note).
 *
 * Web parity: the popular-media / popular-lists shapes mirror
 * apps/web/src/app/page.tsx; the batched viewer read mirrors
 * apps/web/src/lib/viewer-tracking.ts.
 */

import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";
import type { Profile } from "@intertaind/types";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/**
 * The card-facing subset every home rail renders: identity, media type (for
 * the type badge), title, cover art, release date (for the card's year), and
 * the community avg_rating (already on the 0–5 display scale — migration 025 —
 * so no ÷2; the card's viewer-rating override comes from
 * `useViewerTrackingMap`). The return shape of the media-rail hooks
 * (`usePopularMedia`, `useContinueTracking` (extended), `useRecommendedForYou`)
 * so a card component takes one row shape regardless of which rail produced it.
 */
export type HomeMediaItem = Pick<
  Tables<"media_items">,
  "id" | "media_type" | "title" | "cover_image_url" | "release_date" | "avg_rating"
>;

/**
 * The four home rails that map to a single `media_type`. The catalog enum has
 * a fifth value (`board_game`), but the home screen only surfaces these four —
 * so this is a narrower literal union than `Enums<"media_type">` on purpose.
 */
export type PopularMediaType = "movie" | "tv_show" | "book" | "video_game";

/** Column list for a HomeMediaItem, shared by every read that returns one
 *  (home rails here + the profile favorites/shelves reads in ./profile.ts). */
export const HOME_MEDIA_COLS =
  "id, media_type, title, cover_image_url, release_date, avg_rating";

/** Cards per media rail (Continue + the four Popular rails). */
const RAIL_LIMIT = 12;
/** Recs pulled before per-media dedup (web reads 20 for rec lists). */
const RECS_LIMIT = 20;
/** Public lists surfaced in the Popular Lists rail (web reads 4; task: 6). */
const POPULAR_LISTS_LIMIT = 6;
/** Cover thumbnails previewed per list card (web's LIST_PREVIEW_COUNT). */
const LIST_PREVIEW_COUNT = 5;

/**
 * Top-tracked catalog for ONE media type — a "Popular Movies/Shows/Books/
 * Games" rail. Mirrors web page.tsx's four `tracking_count`-ordered reads
 * (web pulls `*` + limit 8; we pull the card subset + limit 12).
 *
 * Anon: RLS allows anon reads on `media_items` (public catalog), so no user
 * in the key and it works pre-auth.
 */
export function usePopularMedia(mediaType: PopularMediaType) {
  return useQuery({
    queryKey: queryKeys.media.popular(mediaType),
    queryFn: async (): Promise<HomeMediaItem[]> => {
      const { data, error } = await supabase
        .from("media_items")
        .select(HOME_MEDIA_COLS)
        // `tracking_count` is nullable (the aggregate trigger COALESCEs to 0
        // only on write, so a never-touched row stays NULL). Postgres sorts
        // NULLs FIRST on a DESC order, which would float untracked rows to the
        // TOP of a "Popular" rail — so pin NULLs last. The composite index
        // idx_media_items_type_tracking(media_type, tracking_count DESC) still
        // serves this shape.
        .eq("media_type", mediaType)
        .order("tracking_count", { ascending: false, nullsFirst: false })
        .limit(RAIL_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * One Continue row: the embedded `media_items` card fields PLUS the viewer's
 * own tracking state (rating/is_favorite/progress) carried over from the
 * `user_media` row, so the card renders the viewer's rating/heart and (later)
 * a progress affordance without a second lookup.
 */
export type ContinueItem = HomeMediaItem & {
  rating: Tables<"user_media">["rating"];
  is_favorite: Tables<"user_media">["is_favorite"];
  progress: Tables<"user_media">["progress"];
};

/** Shape of one embedded row from the user_media → media_items join. */
type ContinueJoinRow = Pick<
  Tables<"user_media">,
  "rating" | "is_favorite" | "progress"
> & {
  media_items: HomeMediaItem;
};

/**
 * The viewer's in-progress titles for the home "Continue" row — their
 * `user_media` rows at status `in_progress`, most-recently-updated first,
 * joined to the media card fields. Returns the embedded media rows flattened
 * with the viewer's rating/is_favorite/progress.
 *
 * `media_items!inner` so a tracking row whose media item is missing drops out
 * (never a half-populated card). RLS scopes `user_media` to the owner, so this
 * is gated `enabled: !!user`.
 *
 * Keyed by `user.continue(userId)`, which is nested under the `shelves(userId)`
 * prefix — so the tracking mutations' existing `user.shelves` invalidation
 * (tracking.ts `invalidateTrackingCaches`) refreshes this row too when the
 * viewer starts/finishes/updates a title. See keys.ts for the rationale.
 */
export function useContinueTracking() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.continue(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<ContinueItem[]> => {
      const { data, error } = await supabase
        .from("user_media")
        .select(
          `rating, is_favorite, progress, media_items!inner(${HOME_MEDIA_COLS})`
        )
        .eq("user_id", user!.id)
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(RAIL_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContinueJoinRow[];
      return rows.map((row) => ({
        ...row.media_items,
        rating: row.rating,
        is_favorite: row.is_favorite,
        progress: row.progress,
      }));
    },
  });
}

/** Shape of one embedded rec row: the recommended-side media card fields. */
type RecommendedJoinRow = {
  recommended_media: HomeMediaItem;
};

/**
 * Cross-media "Recommended for you" — titles the community paired with what
 * the viewer has engaged with. Two steps in one queryFn:
 *
 *   1. Read the viewer's tracked media ids (`user_media` where status is
 *      completed/in_progress OR the item is favorited). No engagement → []
 *      (the section self-hides), no second round trip.
 *   2. Read `recommendations` whose `source_media_id` is in that set,
 *      embedding the RECOMMENDED-side media via
 *      `recommended_media:media_items!recommendations_recommended_media_id_fkey`
 *      (same FK-hint alias as ./recommendations.ts), newest first. Dedup the
 *      recommended media by id (the same title can be recommended off several
 *      of the viewer's sources) and return the recommended `HomeMediaItem[]`.
 *
 * The `recommendations` read is `as unknown as` cast for the same reason as
 * ./recommendations.ts (the media embed is an explicit column subset, so it
 * doesn't match the full inferred embed shape).
 *
 * Per-viewer (derived from their tracking), so `enabled: !!user` and keyed by
 * `user.recommendedForYou(userId)`. Not covered by the tracking mutations'
 * `user.shelves` invalidation — recs shift slowly and a 5-min stale window is
 * fine; a dedicated invalidation can be added when the recommend picker lands.
 */
export function useRecommendedForYou() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.recommendedForYou(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<HomeMediaItem[]> => {
      // (1) The viewer's engaged-with media ids.
      const { data: tracked, error: trackedError } = await supabase
        .from("user_media")
        .select("media_id")
        .eq("user_id", user!.id)
        .or("status.in.(completed,in_progress),is_favorite.eq.true");
      if (trackedError) throw trackedError;

      const sourceIds = [...new Set((tracked ?? []).map((r) => r.media_id))];
      if (sourceIds.length === 0) return [];

      // (2) Recs seeded from those ids; keep only the recommended side.
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          `recommended_media:media_items!recommendations_recommended_media_id_fkey(${HOME_MEDIA_COLS})`
        )
        .in("source_media_id", sourceIds)
        .order("created_at", { ascending: false })
        .limit(RECS_LIMIT);
      if (error) throw error;

      const rows = (data ?? []) as unknown as RecommendedJoinRow[];
      // Dedup by media id, preserving newest-first order.
      const seen = new Set<string>();
      const out: HomeMediaItem[] = [];
      for (const row of rows) {
        const media = row.recommended_media;
        if (!media || seen.has(media.id)) continue;
        seen.add(media.id);
        out.push(media);
      }
      return out;
    },
  });
}

/** Author subset a list card renders (same shape as ./recommendations.ts). */
export type PopularListAuthor = Pick<
  Profile,
  "id" | "username" | "display_name" | "avatar_url"
>;

/** Card subset for one public list — what the Popular Lists rail renders. */
export type PopularListSummary = Pick<
  Tables<"lists">,
  "id" | "title" | "description" | "item_count" | "like_count"
>;

/** One entry in the Popular Lists rail: the list, its author, cover previews. */
export type PopularListCard = {
  list: PopularListSummary;
  author: PopularListAuthor;
  /** Up to LIST_PREVIEW_COUNT cover urls, position-ordered (nulls dropped). */
  covers: string[];
};

/** Shape of the first read: list card fields + the embedded author. */
type PopularListRow = PopularListSummary & {
  profiles: PopularListAuthor;
};

/** Shape of the second read: a list_items → media_items cover join row. */
type ListCoverRow = {
  list_id: string;
  media_items: Pick<Tables<"media_items">, "id" | "cover_image_url"> | null;
};

/**
 * Public lists for the home "Popular Lists" rail. Mirrors web page.tsx:
 *
 *   1. `lists` where visibility = 'public', ordered by like_count desc,
 *      embedding the author `profiles!lists_user_id_fkey(...)`. (`lists.user_id`
 *      FKs `profiles`, so this embed IS inferable — no cast needed, unlike the
 *      recommendations author embed whose user_id FKs auth.users.)
 *   2. A single batched read of up to LIST_PREVIEW_COUNT cover previews per
 *      list from `list_items` joined to `media_items(id, cover_image_url)`,
 *      `.in("list_id", ids).order("position")` — the same "order by position
 *      globally, cap the response, take the first N per list client-side"
 *      trick web uses.
 *
 * Anon: RLS scopes reads to public lists, so no user in the key and it works
 * pre-auth. Returns [] when there are no public lists (the section self-hides).
 */
export function usePopularLists() {
  return useQuery({
    queryKey: queryKeys.lists.popular(),
    queryFn: async (): Promise<PopularListCard[]> => {
      const { data: listsData, error: listsError } = await supabase
        .from("lists")
        .select(
          "id, title, description, item_count, like_count, profiles!lists_user_id_fkey(id, username, display_name, avatar_url)"
        )
        .eq("visibility", "public")
        .order("like_count", { ascending: false })
        .limit(POPULAR_LISTS_LIMIT);
      if (listsError) throw listsError;

      const lists = (listsData ?? []) as unknown as PopularListRow[];
      if (lists.length === 0) return [];

      // Batched cover previews: order by position globally so each list
      // contributes its earliest items; cap the response (2× headroom so a
      // list whose earliest items lack covers still fills its N).
      const listIds = lists.map((l) => l.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from("list_items")
        .select("list_id, media_items(id, cover_image_url)")
        .in("list_id", listIds)
        .order("position", { ascending: true })
        .limit(POPULAR_LISTS_LIMIT * LIST_PREVIEW_COUNT * 2);
      if (itemsError) throw itemsError;

      const coversByList = new Map<string, string[]>();
      for (const row of (itemsData ?? []) as unknown as ListCoverRow[]) {
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

/** Per-media viewer state a home card overlays (rating stars, favorite heart). */
export type ViewerTrackingState = {
  status: Tables<"user_media">["status"];
  rating: number | null;
  is_favorite: boolean;
};

/**
 * The viewer's tracking rows for an arbitrary set of media ids, as a
 * `Map<media_id, { status, rating, is_favorite }>` — the per-card viewer
 * override (rating/heart) for every home rail in ONE round trip. Mirrors
 * web's `fetchViewerTracking` (apps/web/src/lib/viewer-tracking.ts).
 *
 * `enabled: !!user && mediaIds.length > 0` — nothing to fetch signed out or
 * with an empty set. Keyed by `user.trackingMap(userId, mediaIds)`, which
 * folds the id set into a stable sorted signature so the same ids (in any
 * order, across renders) hit one cache entry, but a changed set refetches.
 *
 * `is_favorite` is normalized to a boolean (the column is nullable); `status`
 * and `rating` pass through. Ids the viewer isn't tracking are simply absent
 * from the map — the card falls back to community state.
 */
export function useViewerTrackingMap(mediaIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.trackingMap(user?.id ?? "anon", mediaIds),
    enabled: !!user && mediaIds.length > 0,
    queryFn: async (): Promise<Map<string, ViewerTrackingState>> => {
      const { data, error } = await supabase
        .from("user_media")
        .select("media_id, status, rating, is_favorite")
        .eq("user_id", user!.id)
        .in("media_id", mediaIds);
      if (error) throw error;
      const map = new Map<string, ViewerTrackingState>();
      for (const row of data ?? []) {
        map.set(row.media_id, {
          status: row.status,
          rating: row.rating,
          is_favorite: row.is_favorite ?? false,
        });
      }
      return map;
    },
  });
}
