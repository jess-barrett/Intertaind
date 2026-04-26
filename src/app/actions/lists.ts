"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  LIST_TYPES_REQUIRING_SOURCE,
  type ListType,
  type ListVisibility,
  type MediaType,
} from "@/lib/types";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

export interface CreateListInput {
  title: string;
  description?: string;
  list_type: ListType;
  source_media_id?: string | null;
  media_types?: MediaType[];
  tags?: string[];
  visibility?: ListVisibility;
  initial_items?: { media_id: string; reason?: string }[];
}

export interface UpdateListInput {
  title?: string;
  description?: string | null;
  list_type?: ListType;
  source_media_id?: string | null;
  media_types?: MediaType[];
  tags?: string[];
  visibility?: ListVisibility;
}

/**
 * Trim and validate a list's tags. We allow free-text tags but cap the
 * count and length so a typo'd 5kb tag string doesn't break the GIN
 * index lookups on the discovery page.
 */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 10);
}

function validateInput(input: CreateListInput | UpdateListInput): void {
  if ("title" in input && input.title !== undefined) {
    if (!input.title.trim()) throw new Error("Title is required");
    if (input.title.length > 200) throw new Error("Title is too long");
  }
  if (
    "list_type" in input &&
    input.list_type &&
    LIST_TYPES_REQUIRING_SOURCE.includes(input.list_type) &&
    "source_media_id" in input &&
    !input.source_media_id
  ) {
    throw new Error(
      `${input.list_type} lists require a source media item`
    );
  }
}

export async function createList(input: CreateListInput): Promise<string> {
  const { supabase, user } = await getAuthUser();
  validateInput(input);

  const { data: list, error } = await supabase
    .from("lists")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      list_type: input.list_type,
      source_media_id: input.source_media_id ?? null,
      media_types: input.media_types ?? [],
      tags: normalizeTags(input.tags),
      visibility: input.visibility ?? "public",
    })
    .select("id")
    .single();

  if (error || !list) {
    throw new Error(`Failed to create list: ${error?.message ?? "unknown"}`);
  }

  // Add initial items, if any. Position is the array index — caller can
  // reorder afterward. Errors here surface so the user sees what went
  // wrong (typical cause: RLS blocking the insert because the lists row
  // hasn't committed yet, or an invalid media_id).
  if (input.initial_items && input.initial_items.length > 0) {
    const rows = input.initial_items.map((item, i) => ({
      list_id: list.id,
      media_id: item.media_id,
      position: i,
      reason: item.reason?.trim() || null,
    }));
    const { error: itemsError } = await supabase
      .from("list_items")
      .insert(rows);
    if (itemsError) {
      throw new Error(
        `List created but adding items failed: ${itemsError.message}`
      );
    }
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: input.source_media_id ?? null,
    activity_type: "created_list",
    metadata: { list_id: list.id, title: input.title.trim() },
  });

  // Invalidate the discovery page so the new list is visible on the
  // next render (without this, Next's router cache can serve a stale
  // /lists payload from before this list existed).
  revalidatePath("/lists");

  return list.id;
}

export async function updateList(
  listId: string,
  input: UpdateListInput
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  validateInput(input);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  if (input.list_type !== undefined) updates.list_type = input.list_type;
  if (input.source_media_id !== undefined) {
    updates.source_media_id = input.source_media_id;
  }
  if (input.media_types !== undefined) {
    updates.media_types = input.media_types;
  }
  if (input.tags !== undefined) updates.tags = normalizeTags(input.tags);
  if (input.visibility !== undefined) updates.visibility = input.visibility;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("lists")
    .update(updates)
    .eq("id", listId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to update list: ${error.message}`);
}

export async function deleteList(listId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const { error } = await supabase
    .from("lists")
    .delete()
    .eq("id", listId)
    .eq("user_id", user.id);
  if (error) throw new Error(`Failed to delete list: ${error.message}`);
}

export async function addItemsToList(
  listId: string,
  items: { media_id: string; reason?: string }[]
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  if (items.length === 0) return;

  // Confirm ownership and grab the next position. RLS would also block
  // unauthorized writes, but we want a clean error message.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", user.id)
    .single();
  if (!list) throw new Error("List not found or not owned by you");

  const { data: existing } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);
  const startPos = (existing?.[0]?.position ?? -1) + 1;

  const rows = items.map((item, i) => ({
    list_id: listId,
    media_id: item.media_id,
    position: startPos + i,
    reason: item.reason?.trim() || null,
  }));
  const { error } = await supabase.from("list_items").insert(rows);
  if (error) throw new Error(`Failed to add items: ${error.message}`);
}

export async function removeItemFromList(listItemId: string): Promise<void> {
  const { supabase } = await getAuthUser();
  // RLS gates this — only the list owner can delete the item.
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("id", listItemId);
  if (error) throw new Error(`Failed to remove item: ${error.message}`);
}

export async function reorderListItems(
  listId: string,
  orderedItemIds: string[]
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  // Sanity check ownership — RLS would block but a clean error helps.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", user.id)
    .single();
  if (!list) throw new Error("List not found or not owned by you");

  // Update positions one at a time. Postgres doesn't have a clean
  // "update many with different values" without a CASE statement; for
  // typical list sizes (<50 items) this is fine.
  for (let i = 0; i < orderedItemIds.length; i++) {
    await supabase
      .from("list_items")
      .update({ position: i })
      .eq("id", orderedItemIds[i])
      .eq("list_id", listId);
  }
}

export async function updateListItemReason(
  listItemId: string,
  reason: string | null
): Promise<void> {
  const { supabase } = await getAuthUser();
  const { error } = await supabase
    .from("list_items")
    .update({ reason: reason?.trim() || null })
    .eq("id", listItemId);
  if (error) throw new Error(`Failed to update note: ${error.message}`);
}

/**
 * Toggle the viewer's like on a list. Returns the new state (true if
 * now liked). Skipped silently when the list is private and not owned
 * by the viewer (RLS would block the write anyway).
 */
export async function toggleListLike(listId: string): Promise<boolean> {
  const { supabase, user } = await getAuthUser();

  const { data: existing } = await supabase
    .from("list_likes")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("list_id", listId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("list_likes")
      .delete()
      .eq("user_id", user.id)
      .eq("list_id", listId);
    if (error) throw new Error(`Failed to unlike: ${error.message}`);
    return false;
  }

  const { error } = await supabase
    .from("list_likes")
    .insert({ user_id: user.id, list_id: listId });
  if (error) throw new Error(`Failed to like: ${error.message}`);

  // Look up the list to populate the activity row's media linkage and
  // an activity-card title (if needed by the feed renderer).
  const { data: list } = await supabase
    .from("lists")
    .select("title, source_media_id")
    .eq("id", listId)
    .single();

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: list?.source_media_id ?? null,
    activity_type: "liked_list",
    metadata: { list_id: listId, title: list?.title ?? "" },
  });

  return true;
}

/**
 * Save = bookmark to revisit later. Distinct from like (thumbs-up) so a
 * user can both endorse a list publicly AND keep it in their reading
 * queue privately. Returns the new state (true if now saved).
 */
export async function toggleListSave(listId: string): Promise<boolean> {
  const { supabase, user } = await getAuthUser();

  const { data: existing } = await supabase
    .from("list_saves")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("list_id", listId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("list_saves")
      .delete()
      .eq("user_id", user.id)
      .eq("list_id", listId);
    if (error) throw new Error(`Failed to unsave: ${error.message}`);
    return false;
  }

  const { error } = await supabase
    .from("list_saves")
    .insert({ user_id: user.id, list_id: listId });
  if (error) throw new Error(`Failed to save: ${error.message}`);

  const { data: list } = await supabase
    .from("lists")
    .select("title, source_media_id")
    .eq("id", listId)
    .single();

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: list?.source_media_id ?? null,
    activity_type: "saved_list",
    metadata: { list_id: listId, title: list?.title ?? "" },
  });

  return true;
}
