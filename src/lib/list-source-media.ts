import type { SupabaseClient } from "@supabase/supabase-js";
import type { List, MediaItem, MediaType } from "@/lib/types";

/**
 * Bulk-fetch source media (only the `media_type` column) for any list
 * in the input that has a `source_media_id`. Returns a map keyed by
 * list id so callers can pass `sourceMap[list.id]` straight into a
 * list card without per-item lookups.
 *
 * Single round-trip — used by every listing page that renders cards
 * (homepage, /lists, /lists/browse, /u/.../lists) so source-anchored
 * lists can show "[source icon] ⇄ [list icons]" without an N+1.
 */
export async function fetchListSourceMediaMap(
  supabase: SupabaseClient,
  lists: Pick<List, "id" | "source_media_id">[]
): Promise<Record<string, Pick<MediaItem, "media_type">>> {
  const ids = Array.from(
    new Set(
      lists
        .map((l) => l.source_media_id)
        .filter((id): id is string => !!id)
    )
  );
  if (ids.length === 0) return {};

  const { data } = await supabase
    .from("media_items")
    .select("id, media_type")
    .in("id", ids);

  const byMediaId = new Map<string, MediaType>();
  for (const row of (data as { id: string; media_type: MediaType }[] | null) ?? []) {
    byMediaId.set(row.id, row.media_type);
  }

  const out: Record<string, Pick<MediaItem, "media_type">> = {};
  for (const list of lists) {
    if (!list.source_media_id) continue;
    const mt = byMediaId.get(list.source_media_id);
    if (mt) out[list.id] = { media_type: mt };
  }
  return out;
}
