/**
 * Activity FEED queries for the Activity tab (distinct from the per-profile
 * activity in ./profile.ts). Two scopes:
 *   - Friends: activity from the people the viewer follows (actor profile
 *     embedded, so the row can show WHO did it).
 *   - You: the viewer's own activity — reuse `useProfileActivityPage(user.id)`
 *     from ./profile.ts (no actor needed), so it's not re-implemented here.
 *
 * Both read `activity_log` under its RLS (public/followed/own + block-aware),
 * newest-first, paginated via `useInfiniteQuery`.
 *
 * Scale note (v1): the Friends feed fetches the viewer's following-ids then
 * `.in("user_id", ids)`. Fine for now; a power user following thousands wants a
 * server-side feed (an RPC or a fan-out feed table) instead — a documented
 * follow-up, not this pass.
 *
 * Activity WRITES are still deferred to the (upcoming) DB trigger — until it
 * lands, these feeds populate only from web-sourced activity, so a sparse feed
 * for a mobile-only user is EXPECTED (same note as ActivityListScreen).
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Tables } from "@intertaind/supabase";

import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";
import type { ProfileActivityRow } from "./profile";

/** Page size for the paginated feeds. */
const FEED_PAGE_SIZE = 20;

/** A feed row — a `ProfileActivityRow` plus the ACTOR profile (who did it). */
export type ActivityFeedRow = ProfileActivityRow & {
  actor: Pick<
    Tables<"profiles">,
    "id" | "username" | "display_name" | "avatar_url"
  > | null;
};

/** Feed select: the activity row + its media + the actor profile. The actor is
 *  embedded via the `activity_log_user_id_fkey` → profiles relationship. */
const FEED_COLS =
  "id, user_id, media_id, activity_type, metadata, created_at, " +
  "media:media_items(id, title, cover_image_url, media_type), " +
  "actor:profiles!activity_log_user_id_fkey(id, username, display_name, avatar_url)";

/**
 * The ids the viewer follows — the filter for the Friends feed. Small query
 * (your following list); returned as a plain string[] for `.in()`.
 */
export function useFollowingIds(userId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.user.following(userId ?? "anon"), "ids"] as const,
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId!);
      if (error) throw error;
      return (data ?? []).map((row) => row.following_id);
    },
  });
}

/**
 * The Friends activity feed — `activity_log` for the users in `followingIds`,
 * newest first, paginated. Disabled until `followingIds` resolves; an empty
 * following list yields an empty feed (the caller shows a "follow people"
 * empty state).
 */
export function useFriendsActivityFeed(
  userId: string | undefined,
  followingIds: string[] | undefined,
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.activity.feed(), "friends", userId ?? "anon"] as const,
    enabled: !!userId && Array.isArray(followingIds),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ActivityFeedRow[]> => {
      const ids = followingIds ?? [];
      if (ids.length === 0) return [];
      const from = pageParam * FEED_PAGE_SIZE;
      const to = from + FEED_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("activity_log")
        .select(FEED_COLS)
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityFeedRow[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FEED_PAGE_SIZE ? undefined : allPages.length,
  });
}
