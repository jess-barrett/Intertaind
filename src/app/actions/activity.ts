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
