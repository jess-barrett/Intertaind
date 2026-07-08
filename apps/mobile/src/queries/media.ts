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

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";
import type { SearchResult } from "@intertaind/types";
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
 * rating + distribution histogram, denormalized community counts, and
 * series metadata.
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
  | "rating_distribution"
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
          "id, media_type, title, description, cover_image_url, backdrop_url, release_date, metadata, external_ids, avg_rating, rating_count, rating_distribution, tracking_count, completed_count, in_progress_count, favorites_count, lists_count, series_id, series_name, series_position, series_status"
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
 *
 * The key includes the user id so one user's cached row can never be
 * served to another after an account switch. Signed out, the "anon"
 * placeholder keeps the key stable but never fetches (`enabled: !!user`
 * gates the queryFn), so every fetched entry is keyed by a real
 * user.id.
 */
export function useViewerTracking(mediaId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.media.viewerTracking(user?.id ?? "anon", mediaId),
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

/**
 * Shape pulled for one entry in a series graph. Only what M4's series
 * graph plots: identity, order, release date, aggregate rating (already
 * on the 0–5 display scale — migration 025 — so no ÷2), and cover art.
 */
export type SeriesSibling = Pick<
  Tables<"media_items">,
  | "id"
  | "title"
  | "series_position"
  | "release_date"
  | "avg_rating"
  | "rating_count"
  | "cover_image_url"
>;

/**
 * Every media item sharing a `series_id` — the sibling set the books
 * series graph (M4) plots. Ordered by `series_position` ascending with
 * nulls last — this matches web's DB `.order()` clause only.
 *
 * TODO(M4): web ALSO re-sorts client-side (apps/web `getSeriesSiblings`):
 * if every sibling has a `series_position` it keeps position order,
 * otherwise it falls back to sorting by `release_date`. That
 * position-vs-release-date fallback (and next-in-series derivation) is
 * presentation logic the M4 series-graph consumer must apply on top of
 * these raw rows — this hook deliberately returns them unmassaged.
 *
 * RLS allows anon reads on `media_items` (public catalog), so this
 * works pre-auth. Disabled until there's a `seriesId` — a media item
 * outside a series has none, and there's nothing to fetch.
 */
export function useSeriesSiblings(seriesId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.media.bySeries(seriesId ?? ""),
    enabled: !!seriesId,
    queryFn: async (): Promise<SeriesSibling[]> => {
      const { data, error } = await supabase
        .from("media_items")
        .select(
          "id, title, series_position, release_date, avg_rating, rating_count, cover_image_url"
        )
        .eq("series_id", seriesId!)
        .order("series_position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Discriminated input to `useMediaUpsertMutation`, matching the Edge
 * Function's two body shapes:
 *
 *   - `{ mediaType, tmdbId }` — the filmography card's tap-to-enrich. TMDB
 *     movie/tv only; the function re-enriches from TMDB.
 *   - `{ searchResult }` — the recommend picker's pick. Any of the four media
 *     types (book/game have no tmdb_id, so they can only come this way). The
 *     function dedups by any external id and, for movie/tv, routes through the
 *     same full TMDB enrichment.
 *
 * A union (not two optional fields) so callers can't send a half-filled body
 * and TS narrows the invoke payload for us.
 */
export type MediaUpsertInput =
  | { mediaType: "movie" | "tv"; tmdbId: number }
  | { searchResult: SearchResult };

/**
 * Mobile analogue of web's upsert-on-click (web's `MediaCardLink` +
 * `upsertMediaItem`): turns an uncataloged title into a `media_items` id via
 * the `media-upsert` Edge Function, so the filmography card can navigate to
 * `/media/[id]` on first tap AND the recommend picker can pin a picked
 * `SearchResult` (of any type) to a recommendations FK.
 *
 * `media-upsert` holds the server-side external-API secrets (the anon JWT is
 * forwarded automatically by `functions.invoke`, mirroring `usePerson`'s
 * `person` invoke); it get-or-creates the catalog row and returns `{ id }`.
 * Throws on a transport/function error or a missing id so the caller can keep
 * the "enriching…" state off and not navigate nowhere.
 *
 * No cache invalidation: the row it creates isn't in any list this app has
 * cached, and the destination media-detail screen fetches its own fresh copy.
 */
export function useMediaUpsertMutation() {
  return useMutation({
    mutationFn: async (input: MediaUpsertInput): Promise<string> => {
      const body =
        "searchResult" in input
          ? { searchResult: input.searchResult }
          : { media_type: input.mediaType, tmdb_id: input.tmdbId };
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        "media-upsert",
        { body }
      );
      if (error) throw error;
      if (!data?.id) throw new Error("media-upsert returned no id.");
      return data.id;
    },
  });
}
