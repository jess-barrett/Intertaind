/**
 * TanStack Query hook for cross-source media search — the mobile analogue
 * of web's `/api/search` route. Web hits its Node API route (which holds
 * the TMDB / Google Books / OpenLibrary / IGDB secrets); mobile CAN'T ship
 * those secrets, so it calls the `media-search` Edge Function, which holds
 * them server-side and returns a unified, normalized `SearchResult[]`
 * (`supabase/functions/media-search/index.ts` + `_shared/search.ts`).
 *
 * The recommend picker (`components/media/media-search-picker.tsx`) is the
 * first consumer: the user searches for a title to pair with the source
 * media of a cross-media recommendation.
 *
 * Contract mirrors the Edge Function:
 *   invoke("media-search", { body: { q, type } }) → { results: SearchResult[] }
 * `type` is the request-friendly alias set the function accepts
 * (all|movie|tv|book|game); the function maps `tv`→`tv_show`, `game`→
 * `video_game` internally. A short/empty query returns `{ results: [] }`
 * (not an error), matching the function's own < 2-char short-circuit — but
 * we ALSO gate the query with `enabled` so we don't invoke at all until the
 * (debounced) query is long enough.
 *
 * The CALLER debounces the query string before passing it in, so each
 * distinct settled query is cached under its own key and re-typing a prior
 * query is served from cache within staleTime.
 */

import { useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@intertaind/types";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/** The request-friendly type scopes the `media-search` function accepts. */
export type MediaSearchType = "all" | "movie" | "tv" | "book" | "game";

/** Min query length before we invoke — matches the function's short-circuit. */
const MIN_QUERY_LENGTH = 2;

/**
 * Cross-source media search. Returns `SearchResult[]` (empty until the
 * query clears the min length). Disabled — never invokes — while the
 * trimmed query is shorter than 2 chars, so an empty/short field shows the
 * caller's "keep typing" prompt without a wasted round trip.
 *
 * `staleTime: 5 min` (matches the app-wide default in providers.tsx, stated
 * here explicitly): a settled search rarely changes minute-to-minute, so
 * re-typing a query within the window is served from cache.
 */
export function useMediaSearch(query: string, type: MediaSearchType = "all") {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search.media(trimmed, type),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase.functions.invoke<{
        results: SearchResult[];
      }>("media-search", { body: { q: trimmed, type } });
      if (error) throw error;
      return data?.results ?? [];
    },
  });
}
