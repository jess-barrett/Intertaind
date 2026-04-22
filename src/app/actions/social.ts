"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FollowState, Notification, Profile } from "@/lib/types";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

/**
 * Follow a user. If the target is public, creates a follow row directly.
 * If the target is private, creates a follow_request row instead.
 * Returns the new state so the client can update its button.
 */
export async function followUser(
  targetId: string
): Promise<"following" | "requested"> {
  const { supabase, user } = await getAuthUser();
  if (targetId === user.id) throw new Error("Can't follow yourself.");

  const { data: target, error: readErr } = await supabase
    .from("profiles")
    .select("id, is_private")
    .eq("id", targetId)
    .single();
  if (readErr || !target) throw new Error("User not found.");

  if (target.is_private) {
    const { error } = await supabase
      .from("follow_requests")
      .insert({ requester_id: user.id, target_id: targetId });
    if (error) throw new Error(`Failed to request: ${error.message}`);
    return "requested";
  }

  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, following_id: targetId });
  if (error) throw new Error(`Failed to follow: ${error.message}`);
  return "following";
}

export async function unfollowUser(targetId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetId);
  if (error) throw new Error(`Failed to unfollow: ${error.message}`);
}

export async function cancelFollowRequest(targetId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const { error } = await supabase
    .from("follow_requests")
    .delete()
    .eq("requester_id", user.id)
    .eq("target_id", targetId);
  if (error) throw new Error(`Failed to cancel: ${error.message}`);
}

/**
 * Accept an incoming follow request. Backed by a SECURITY DEFINER RPC so
 * the accept can insert a follows row where follower_id = requester
 * (which the follows_insert_self policy would otherwise reject).
 */
export async function acceptFollowRequest(requesterId: string): Promise<void> {
  const { supabase } = await getAuthUser();
  const { error } = await supabase.rpc("accept_follow_request", {
    p_requester_id: requesterId,
  });
  if (error) throw new Error(`Failed to accept: ${error.message}`);
}

export async function denyFollowRequest(requesterId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const { error } = await supabase
    .from("follow_requests")
    .delete()
    .eq("requester_id", requesterId)
    .eq("target_id", user.id);
  if (error) throw new Error(`Failed to deny: ${error.message}`);
}

/**
 * Block a user and wipe any existing follows / follow_requests in both
 * directions. Backed by a SECURITY DEFINER RPC so we can delete the
 * "other direction" follow row that the follower-owns-their-row policy
 * would otherwise forbid.
 */
export async function blockUser(targetId: string): Promise<void> {
  const { supabase } = await getAuthUser();
  const { error } = await supabase.rpc("block_user", {
    p_target_id: targetId,
  });
  if (error) throw new Error(`Failed to block: ${error.message}`);
}

export async function unblockUser(targetId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId);
  if (error) throw new Error(`Failed to unblock: ${error.message}`);
}

export type UserSearchHit = Pick<
  Profile,
  "id" | "username" | "display_name" | "avatar_url" | "is_private"
>;

/**
 * Search users by username or display name. RLS filters out blocked users
 * automatically so nothing extra is needed here.
 */
export async function searchUsers(query: string): Promise<UserSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const escaped = q.replace(/[%_]/g, "\\$&");
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_private")
    .or(`username.ilike.${escaped}%,display_name.ilike.%${escaped}%`)
    .limit(10);
  return (data as UserSearchHit[]) ?? [];
}

/**
 * Compute the current viewer's relationship to the target user. Used by the
 * follow button to render the right label/action on first paint.
 */
export async function getFollowState(targetId: string): Promise<FollowState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "none";
  if (user.id === targetId) return "self";

  // Cheapest first: blocks (only blocker row is visible to them)
  const { data: blocked } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId)
    .maybeSingle();
  if (blocked) return "blocked_by_me";

  const { data: follow } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetId)
    .maybeSingle();
  if (follow) return "following";

  const { data: req } = await supabase
    .from("follow_requests")
    .select("target_id")
    .eq("requester_id", user.id)
    .eq("target_id", targetId)
    .maybeSingle();
  if (req) return "requested";

  return "none";
}

export type NotificationWithActor = Notification & {
  actor: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
};

/** Last N notifications for the current user. */
export async function getNotifications(
  limit = 15
): Promise<{ items: NotificationWithActor[]; unreadCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unreadCount: 0 };

  const { data } = await supabase
    .from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  const items = (data as NotificationWithActor[]) ?? [];

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return { items, unreadCount: count ?? 0 };
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const { supabase, user } = await getAuthUser();
  const now = new Date().toISOString();
  let query = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }
  await query;
}

/**
 * List users followed by or following the given user. Public for use on
 * the /followers and /following pages.
 */
export async function listFollowers(
  userId: string,
  offset = 0,
  limit = 50
): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("follows")
    .select("profiles!follows_follower_id_fkey(*)")
    .eq("following_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (
    ((data as { profiles: Profile }[] | null) ?? [])
      .map((row) => row.profiles)
      .filter(Boolean)
  );
}

export async function listFollowing(
  userId: string,
  offset = 0,
  limit = 50
): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("follows")
    .select("profiles!follows_following_id_fkey(*)")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (
    ((data as { profiles: Profile }[] | null) ?? [])
      .map((row) => row.profiles)
      .filter(Boolean)
  );
}

/** Helper so callers can drop this in when they know which path to revalidate. */
export async function revalidateProfile(username: string) {
  revalidatePath(`/u/${username}`);
}
