/**
 * logActivity — insert an `activity_log` row from a shared `ActivityDraft`
 * (or no-op when null). The single mobile write path for activity, used by the
 * tracking mutations (queries/tracking.ts) and the recommendation mutation
 * (queries/recommendations.ts). The "what to log" decision lives in the shared
 * `@intertaind/types` activity module — this only performs the insert.
 *
 * Fire-and-forget: activity is secondary, so a logging failure is warned, never
 * thrown — it must not fail the primary write.
 */
import type { TablesInsert } from "@intertaind/supabase";
import type { ActivityDraft } from "@intertaind/types";

import { supabase } from "@/lib/supabase";

export async function logActivity(
  userId: string,
  mediaId: string | null,
  draft: ActivityDraft | null,
): Promise<void> {
  if (!draft) return;
  const { error } = await supabase.from("activity_log").insert({
    user_id: userId,
    media_id: mediaId,
    activity_type: draft.activity_type,
    metadata: draft.metadata as TablesInsert<"activity_log">["metadata"],
  });
  if (error) {
    console.warn(`activity_log insert failed: ${error.message}`);
  }
}
