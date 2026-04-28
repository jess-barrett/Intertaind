"use server";

import { createClient } from "@/lib/supabase/server";
import type { ListComment, Profile } from "@/lib/types";

const MAX_BODY_LENGTH = 4000;

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

export type ListCommentWithProfile = ListComment & { profiles: Profile };

/**
 * Post a new comment on a list. Returns the new row hydrated with the
 * author's profile so the caller can append to its local list without
 * a follow-up fetch.
 */
export async function createComment(
  listId: string,
  body: string
): Promise<ListCommentWithProfile> {
  const { supabase, user } = await getAuthUser();
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("Comment can't be empty");
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new Error(`Comment must be ${MAX_BODY_LENGTH} characters or fewer`);
  }

  const { data: inserted, error } = await supabase
    .from("list_comments")
    .insert({ list_id: listId, user_id: user.id, body: trimmed })
    .select("*")
    .single();
  if (error || !inserted) {
    throw new Error(`Failed to post comment: ${error?.message ?? "unknown"}`);
  }

  // Fetch the author's profile in a second query — there's no FK from
  // list_comments to profiles for PostgREST to embed through, and the
  // commenter is always the auth'd user so it's just one extra lookup.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    ...(inserted as ListComment),
    profiles: profile as Profile,
  };
}

export async function updateComment(
  commentId: string,
  body: string
): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("Comment can't be empty");
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new Error(`Comment must be ${MAX_BODY_LENGTH} characters or fewer`);
  }
  const { error } = await supabase
    .from("list_comments")
    .update({ body: trimmed })
    .eq("id", commentId)
    .eq("user_id", user.id);
  if (error) throw new Error(`Failed to update comment: ${error.message}`);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { supabase } = await getAuthUser();
  // RLS handles authorization (commenter or list owner). We don't
  // duplicate the check here.
  const { error } = await supabase
    .from("list_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw new Error(`Failed to delete comment: ${error.message}`);
}

// Private — `"use server"` files can only export async functions, so
// this is internal-only. Mirror the value as a TS constant on the
// client if a UI surface ever needs to reference it.
const COMMENTS_PAGE_SIZE = 20;

/**
 * Fetch one page of comments newest-first. Page 0 is the newest 20.
 * Returns `hasMore` so the client can hide its "older" button once
 * we hit the end of the thread.
 *
 * Each call does two queries (rows, then profiles batched by user_id),
 * keeping us off the n+1 path.
 */
export async function fetchCommentsPage(
  listId: string,
  page = 0
): Promise<{
  comments: ListCommentWithProfile[];
  hasMore: boolean;
  page: number;
}> {
  const supabase = await createClient();
  const offset = Math.max(0, page) * COMMENTS_PAGE_SIZE;
  // Fetch one extra so we can detect a "next page exists" without a
  // separate count(*) query.
  const { data: comments } = await supabase
    .from("list_comments")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: false })
    .range(offset, offset + COMMENTS_PAGE_SIZE);

  const rows = (comments as ListComment[] | null) ?? [];
  const hasMore = rows.length > COMMENTS_PAGE_SIZE;
  const trimmed = hasMore ? rows.slice(0, COMMENTS_PAGE_SIZE) : rows;
  if (trimmed.length === 0) {
    return { comments: [], hasMore: false, page };
  }

  const userIds = Array.from(new Set(trimmed.map((r) => r.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);

  const profileMap = new Map<string, Profile>();
  for (const p of (profiles as Profile[] | null) ?? []) {
    profileMap.set(p.id, p);
  }

  return {
    comments: trimmed.map((c) => ({
      ...c,
      profiles: (profileMap.get(c.user_id) ?? null) as Profile,
    })),
    hasMore,
    page,
  };
}
