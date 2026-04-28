"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  Recommendation,
  RecommendationWithSource,
  RecommendationWithTarget,
} from "@/lib/types";

const MAX_NOTE_LENGTH = 280;

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

/**
 * Create a new "if you liked X, try Y" recommendation. The DB enforces
 *   - source != target (CHECK constraint), and
 *   - one rec per (user, source, target) tuple (UNIQUE),
 * so we map those Postgres errors back to friendly messages here.
 *
 * Also writes an activity_log row so followers see the rec in their
 * feed without us needing a separate notifications loop.
 */
export async function createRecommendation(
  sourceMediaId: string,
  recommendedMediaId: string,
  note?: string
): Promise<Recommendation> {
  const { supabase, user } = await getAuthUser();
  if (sourceMediaId === recommendedMediaId) {
    throw new Error("Can't recommend a media as a pair with itself");
  }
  const trimmedNote = note?.trim() ?? "";
  if (trimmedNote.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note must be ${MAX_NOTE_LENGTH} characters or fewer`);
  }

  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      user_id: user.id,
      source_media_id: sourceMediaId,
      recommended_media_id: recommendedMediaId,
      note: trimmedNote.length > 0 ? trimmedNote : null,
    })
    .select("*")
    .single();
  if (error || !data) {
    // 23505 is the unique-violation SQLSTATE — surfaces when the user
    // already recommended this exact pairing.
    if (error?.code === "23505") {
      throw new Error("You've already recommended this pairing");
    }
    throw new Error(`Failed to post recommendation: ${error?.message ?? "unknown"}`);
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    // `media_id` on activity_log is the "primary" media for the event.
    // For a rec we use the *target* — that's what people will click
    // through to in the activity feed ("X recommends [target] for fans
    // of [source]"). The source goes in metadata.
    media_id: recommendedMediaId,
    activity_type: "recommended",
    metadata: {
      source_media_id: sourceMediaId,
      recommended_media_id: recommendedMediaId,
      has_note: trimmedNote.length > 0,
    },
  });

  return data as Recommendation;
}

export async function deleteRecommendation(id: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  // RLS already restricts DELETE to user_id = auth.uid(); we add the
  // explicit user_id filter so a malformed id can never silently match
  // someone else's rec under a future RLS regression.
  const { error } = await supabase
    .from("recommendations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(`Failed to delete recommendation: ${error.message}`);
}

/**
 * Recs WHERE source = mediaId. Use case: "Pairs with this" section on
 * a media detail page — the target media is the interesting side, so
 * we hydrate `recommended_media` + the recommender profile.
 *
 * Single round trip via PostgREST embedding. RLS handles privacy.
 */
export async function fetchRecommendationsForSource(
  sourceMediaId: string,
  limit = 20,
  offset = 0
): Promise<{ items: RecommendationWithTarget[]; hasMore: boolean }> {
  const supabase = await createClient();
  // Fetch limit+1 so we can flag hasMore without a separate count(*).
  const { data } = await supabase
    .from("recommendations")
    .select(
      "*, recommended_media:media_items!recommendations_recommended_media_id_fkey(*), profiles!recommendations_user_id_fkey(*)"
    )
    .eq("source_media_id", sourceMediaId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  const rows = (data as RecommendationWithTarget[] | null) ?? [];
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * Recs WHERE target = mediaId. Use case: "Recommended for fans of"
 * inverse section on a media detail page — when fans of OTHER things
 * have ended up recommending THIS media, the source side is what's
 * interesting.
 */
export async function fetchRecommendationsForTarget(
  recommendedMediaId: string,
  limit = 20,
  offset = 0
): Promise<{ items: RecommendationWithSource[]; hasMore: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select(
      "*, source_media:media_items!recommendations_source_media_id_fkey(*), profiles!recommendations_user_id_fkey(*)"
    )
    .eq("recommended_media_id", recommendedMediaId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  const rows = (data as RecommendationWithSource[] | null) ?? [];
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * All recs authored by a specific user. Powers the "Recommended"
 * sub-tab on /u/[username]/lists. Hydrates BOTH sides of the pair so
 * the card can render `[source] → [target]`.
 */
export async function fetchUserRecommendations(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{
  items: (Recommendation & {
    source_media: import("@/lib/types").MediaItem;
    recommended_media: import("@/lib/types").MediaItem;
  })[];
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select(
      "*, source_media:media_items!recommendations_source_media_id_fkey(*), recommended_media:media_items!recommendations_recommended_media_id_fkey(*)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  type Hydrated = Recommendation & {
    source_media: import("@/lib/types").MediaItem;
    recommended_media: import("@/lib/types").MediaItem;
  };
  const rows = (data as Hydrated[] | null) ?? [];
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
