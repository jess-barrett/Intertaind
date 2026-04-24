"use server";

import { createClient } from "@/lib/supabase/server";
import type { MediaType, MediaItem } from "@/lib/types";
import { TOP_4_SHELF_NAMES } from "@/lib/types";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

/** Get or create the top-picks shelf for a media type */
async function ensureTopShelf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mediaType: MediaType
): Promise<string> {
  const shelfName = TOP_4_SHELF_NAMES[mediaType];

  const { data: existing } = await supabase
    .from("shelves")
    .select("id")
    .eq("user_id", userId)
    .eq("name", shelfName)
    .limit(1)
    .single();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("shelves")
    .insert({
      user_id: userId,
      name: shelfName,
      description: null,
      is_public: true,
      position: 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create shelf: ${error.message}`);
  return created.id;
}

/** Add a media item to a user's top picks for a given type */
export async function addTopPick(
  mediaType: MediaType,
  mediaId: string
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const shelfId = await ensureTopShelf(supabase, user.id, mediaType);

  // Check current count
  const { count } = await supabase
    .from("shelf_items")
    .select("id", { count: "exact", head: true })
    .eq("shelf_id", shelfId);

  if ((count ?? 0) >= 4) {
    throw new Error("Top picks shelf is full (max 4)");
  }

  // Check if already on shelf
  const { data: existing } = await supabase
    .from("shelf_items")
    .select("id")
    .eq("shelf_id", shelfId)
    .eq("media_id", mediaId)
    .limit(1)
    .single();

  if (existing) return; // Already added

  const { error } = await supabase.from("shelf_items").insert({
    shelf_id: shelfId,
    media_id: mediaId,
    position: (count ?? 0) + 1,
  });

  if (error) throw new Error(`Failed to add top pick: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: mediaId,
    activity_type: "added_to_top",
    metadata: { media_type: mediaType },
  });
}

/** Remove a media item from a user's top picks */
export async function removeTopPick(
  mediaType: MediaType,
  mediaId: string
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const shelfName = TOP_4_SHELF_NAMES[mediaType];

  const { data: shelf } = await supabase
    .from("shelves")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", shelfName)
    .limit(1)
    .single();

  if (!shelf) return;

  const { error } = await supabase
    .from("shelf_items")
    .delete()
    .eq("shelf_id", shelf.id)
    .eq("media_id", mediaId);
  if (error) throw new Error(`Failed to remove top pick: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: mediaId,
    activity_type: "removed_from_top",
    metadata: { media_type: mediaType },
  });
}

/**
 * Reorder the user's top picks for a media type. Accepts the media IDs in
 * their new display order and rewrites the shelf_items `position` column.
 * Only the owner can reorder — enforced by the user_id check on the shelf.
 */
export async function reorderTopPicks(
  mediaType: MediaType,
  mediaIds: string[]
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const shelfName = TOP_4_SHELF_NAMES[mediaType];

  const { data: shelf } = await supabase
    .from("shelves")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", shelfName)
    .limit(1)
    .single();

  if (!shelf) return;

  // Batch the updates in parallel — small N (max 4) makes this trivial.
  await Promise.all(
    mediaIds.map((mediaId, idx) =>
      supabase
        .from("shelf_items")
        .update({ position: idx + 1 })
        .eq("shelf_id", shelf.id)
        .eq("media_id", mediaId)
    )
  );
}

/** Fetch the user's tracked media for a given type (for the picker modal) */
export async function getUserLibrary(
  mediaType: MediaType
): Promise<MediaItem[]> {
  const { supabase, user } = await getAuthUser();

  const { data } = await supabase
    .from("user_media")
    .select("media_items!inner(*)")
    .eq("user_id", user.id)
    .eq("media_items.media_type", mediaType)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    (data as { media_items: MediaItem }[] | null)?.map((r) => r.media_items) ??
    []
  );
}
