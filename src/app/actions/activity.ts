"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActivityWithMedia } from "@/lib/types";

/**
 * Fetch the most recent activity rows for a user, joined with media info so
 * the UI can render a cover thumbnail and title without an extra query.
 * RLS already hides rows from private profiles (unless viewer is a follower
 * / the owner) and from blocked users.
 */
export async function listUserActivity(
  userId: string,
  limit = 50,
  offset = 0
): Promise<ActivityWithMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select(
      "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as ActivityWithMedia[] | null) ?? [];
}

/**
 * Fetch the signed-in viewer's own activity for a single media item.
 * Used by the "Show your activity" page on the media detail. Null-returns
 * when the viewer isn't signed in.
 */
export async function listMyActivityForMedia(
  mediaId: string,
  limit = 50
): Promise<ActivityWithMedia[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("activity_log")
    .select(
      "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)"
    )
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ActivityWithMedia[] | null) ?? [];
}

/**
 * Fetch the user's most recent "reviewed" activity rows — used to populate
 * the Recent Reviews section on the profile overview. Reuses the activity
 * log so the existing ActivityItem renderer (cover + stars + review text)
 * applies without duplication.
 */
export async function listUserRecentReviews(
  userId: string,
  limit = 3
): Promise<ActivityWithMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select(
      "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)"
    )
    .eq("user_id", userId)
    .eq("activity_type", "reviewed")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ActivityWithMedia[] | null) ?? [];
}

/**
 * Paginated variant: returns the page + an exact total count in a single
 * round-trip. The count lets the UI render numbered page links (first, last,
 * window around current). Backed by the (user_id, created_at DESC) index
 * from migration 013.
 */
export async function listUserActivityPage(
  userId: string,
  limit: number,
  offset: number
): Promise<{ items: ActivityWithMedia[]; total: number }> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("activity_log")
    .select(
      "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return {
    items: (data as ActivityWithMedia[] | null) ?? [],
    total: count ?? 0,
  };
}

/** Paginated review list — activity_log filtered to activity_type=reviewed. */
export async function listUserReviewsPage(
  userId: string,
  limit: number,
  offset: number
): Promise<{ items: ActivityWithMedia[]; total: number }> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("activity_log")
    .select(
      "id, user_id, media_id, activity_type, metadata, created_at, media:media_items(id, title, cover_image_url, media_type)",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .eq("activity_type", "reviewed")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return {
    items: (data as ActivityWithMedia[] | null) ?? [],
    total: count ?? 0,
  };
}
