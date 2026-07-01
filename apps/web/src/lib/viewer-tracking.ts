import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserMedia } from "@intertaind/types";

/**
 * Fetch the viewer's user_media rows for a set of media items. Used by
 * browse / landing / list pages so media cards can reflect the viewer's
 * own tracking state (watched, loved, star rating) in the hover slideout
 * — without this they'd always render as un-tracked.
 */
export async function fetchViewerTracking(
  supabase: SupabaseClient,
  userId: string | null,
  mediaIds: string[]
): Promise<Record<string, UserMedia>> {
  if (!userId || mediaIds.length === 0) return {};
  const { data } = await supabase
    .from("user_media")
    .select("*")
    .eq("user_id", userId)
    .in("media_id", mediaIds);
  const map: Record<string, UserMedia> = {};
  for (const row of (data as UserMedia[] | null) ?? []) {
    map[row.media_id] = row;
  }
  return map;
}
