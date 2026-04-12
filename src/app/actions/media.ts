"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult, TrackingStatus } from "@/lib/types";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

export async function upsertMediaItem(
  result: SearchResult
): Promise<string> {
  const supabase = await createClient();

  // Check if media already exists by external_ids
  const externalKey = Object.keys(result.external_ids)[0];
  const externalValue = result.external_ids[externalKey];

  const { data: existing } = await supabase
    .from("media_items")
    .select("id")
    .contains("external_ids", { [externalKey]: externalValue })
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Insert new media item
  const { data: inserted, error } = await supabase
    .from("media_items")
    .insert({
      media_type: result.media_type,
      title: result.title,
      description: result.description,
      cover_image_url: result.cover_image_url,
      release_date: result.release_date,
      metadata: result.metadata,
      external_ids: result.external_ids,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to insert media: ${error.message}`);
  return inserted.id;
}

export async function quickAddMedia(
  result: SearchResult
): Promise<{ mediaId: string; userMediaId: string }> {
  const { supabase, user } = await getAuthUser();

  const mediaId = await upsertMediaItem(result);

  // Check if user already tracks this item
  const { data: existing } = await supabase
    .from("user_media")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .limit(1)
    .single();

  if (existing) return { mediaId, userMediaId: existing.id };

  // Create user_media row
  const { data: userMedia, error } = await supabase
    .from("user_media")
    .insert({
      user_id: user.id,
      media_id: mediaId,
      status: "want" as TrackingStatus,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to track media: ${error.message}`);

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: mediaId,
    activity_type: "added_to_shelf",
    metadata: { status: "want" },
  });

  return { mediaId, userMediaId: userMedia.id };
}

export async function trackMedia(
  mediaId: string,
  status: TrackingStatus
): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("user_media")
    .upsert(
      {
        user_id: user.id,
        media_id: mediaId,
        status,
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
        ...(status === "in_progress" ? { started_at: new Date().toISOString() } : {}),
      },
      { onConflict: "user_id,media_id" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Failed to track media: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: mediaId,
    activity_type: status === "completed" ? "completed" : "added_to_shelf",
    metadata: { status },
  });

  return data.id;
}

export async function updateTrackingStatus(
  userMediaId: string,
  status: TrackingStatus
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      ...(status === "in_progress" ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to update status: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: data.media_id,
    activity_type: status === "completed" ? "completed" : "added_to_shelf",
    metadata: { status },
  });
}

export async function rateMedia(
  userMediaId: string,
  rating: number
): Promise<void> {
  if (rating < 1 || rating > 10) throw new Error("Rating must be 1-10");

  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({ rating })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to rate: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: data.media_id,
    activity_type: "rated",
    metadata: { rating },
  });
}

export async function toggleFavorite(userMediaId: string): Promise<boolean> {
  const { supabase, user } = await getAuthUser();

  // Get current state
  const { data: current } = await supabase
    .from("user_media")
    .select("is_favorite")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  if (!current) throw new Error("Tracking not found");

  const newValue = !current.is_favorite;

  const { error } = await supabase
    .from("user_media")
    .update({ is_favorite: newValue })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to toggle favorite: ${error.message}`);
  return newValue;
}

export async function reviewMedia(
  userMediaId: string,
  review: string
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({ review })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to save review: ${error.message}`);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    media_id: data.media_id,
    activity_type: "reviewed",
    metadata: { review_length: review.length },
  });
}

export async function removeTracking(userMediaId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase
    .from("user_media")
    .delete()
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to remove tracking: ${error.message}`);
}
