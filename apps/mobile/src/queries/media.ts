/**
 * TanStack Query hooks for media_items reads.
 *
 * One file per resource. Each hook composes:
 *   1. A typed Supabase query (using `Tables<>` from `@intertaind/supabase`)
 *   2. A key from `queryKeys` (never inline arrays)
 *   3. `useQuery` / `useMutation` from TanStack
 *
 * Hooks return TanStack's QueryResult so callers get `data`, `isPending`,
 * `error`, `refetch`, etc. without us re-inventing them.
 *
 * Pattern conventions (also documented in apps/mobile/AGENTS.md):
 *   - Hook name: `use<Resource><View>` (`useTrendingMedia`,
 *     `useMediaDetail`, `useUserShelves`).
 *   - Keep `select` columns explicit. Don't `select("*")` — denormalize
 *     only what the caller actually renders. Saves bandwidth on cold
 *     loads and lets us audit what each screen pulls.
 *   - Throw on Supabase errors — TanStack surfaces them via `error`,
 *     which the calling component can turn into a UI treatment.
 */

import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/**
 * Shape pulled for trending lists. Pick<> from the generated row type
 * documents — at the call site — exactly which columns this query
 * reads. If the shelf list later wants `release_date`, add it here AND
 * to the `.select()` string below.
 */
export type TrendingMediaItem = Pick<
  Tables<"media_items">,
  "id" | "title" | "cover_image_url" | "media_type" | "avg_rating"
>;

/**
 * Top-tracked media across every media type, descending by global
 * tracking_count. Caps at 20 — the home screen needs a hero feed, not
 * a full leaderboard.
 *
 * RLS allows anon reads on `media_items` (public catalog), so this
 * works pre-auth. Will move to a personalized feed once we have
 * follow-graph data; the hook signature stays the same.
 */
export function useTrendingMedia() {
  return useQuery({
    queryKey: queryKeys.media.trending(),
    queryFn: async (): Promise<TrendingMediaItem[]> => {
      const { data, error } = await supabase
        .from("media_items")
        .select("id, title, cover_image_url, media_type, avg_rating")
        .order("tracking_count", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Shape pulled for the media detail screen. Everything the read-only
 * detail view renders: hero art, title block, description, aggregate
 * rating, denormalized community counts, and series metadata.
 */
export type MediaDetailItem = Pick<
  Tables<"media_items">,
  | "id"
  | "media_type"
  | "title"
  | "description"
  | "cover_image_url"
  | "backdrop_url"
  | "release_date"
  | "metadata"
  | "external_ids"
  | "avg_rating"
  | "rating_count"
  | "tracking_count"
  | "completed_count"
  | "in_progress_count"
  | "favorites_count"
  | "lists_count"
  | "series_id"
  | "series_name"
  | "series_position"
  | "series_status"
>;

/**
 * One media item by id, for the detail screen.
 *
 * RLS allows anon reads on `media_items` (public catalog), so this
 * works pre-auth. `.single()` throws on zero rows — an unknown id
 * surfaces through TanStack's `error`, which the screen renders with
 * a retry affordance.
 */
export function useMediaDetail(mediaId: string) {
  return useQuery({
    queryKey: queryKeys.media.detail(mediaId),
    queryFn: async (): Promise<MediaDetailItem> => {
      const { data, error } = await supabase
        .from("media_items")
        .select(
          "id, media_type, title, description, cover_image_url, backdrop_url, release_date, metadata, external_ids, avg_rating, rating_count, tracking_count, completed_count, in_progress_count, favorites_count, lists_count, series_id, series_name, series_position, series_status"
        )
        .eq("id", mediaId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * The signed-in viewer's own `user_media` row for one media item, or
 * null when they aren't tracking it. `select("*")` is deliberate here
 * (unlike catalog reads): the row IS the viewer's tracking state and
 * M2's mutations will write back every column, so the full shape is
 * what callers need.
 *
 * Disabled while signed out — `user_media` is RLS'd to the owner, so
 * an anon query would only ever return nothing. Keyed separately from
 * `media.detail` so tracking mutations can invalidate this row without
 * refetching the media item.
 */
export function useViewerTracking(mediaId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.media.viewerTracking(mediaId),
    enabled: !!user,
    queryFn: async (): Promise<Tables<"user_media"> | null> => {
      const { data, error } = await supabase
        .from("user_media")
        .select("*")
        .eq("user_id", user!.id)
        .eq("media_id", mediaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
