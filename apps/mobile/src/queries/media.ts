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
