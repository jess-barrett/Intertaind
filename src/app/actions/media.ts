"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult, TrackingStatus } from "@/lib/types";
import { getMovieDetails, getTVDetails } from "@/lib/api/tmdb";
import { findCanonicalBookEdition } from "@/lib/api/google-books";
import { normalizeGoogleBook } from "@/lib/api/normalize";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

async function enrichTMDBMetadata(
  mediaType: string,
  externalIds: Record<string, string | number>,
  existingMetadata: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const tmdbId = externalIds.tmdb_id as number | undefined;
  if (!tmdbId) return null;

  if (mediaType === "movie") {
    try {
      const details = await getMovieDetails(tmdbId);
      const director = details.credits?.crew.find((c) => c.job === "Director")?.name ?? null;
      return {
        ...existingMetadata,
        director,
        runtime: details.runtime,
        genres: details.genres.map((g) => g.name),
      };
    } catch {
      return null;
    }
  }

  if (mediaType === "tv_show") {
    try {
      const details = await getTVDetails(tmdbId);
      // Count only aired seasons (exclude specials and unaired seasons with 0 episodes)
      const aired = details.seasons
        ? details.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0)
        : [];
      const realSeasons = aired.length || details.number_of_seasons;
      // Per-season episode counts: { "1": 9, "2": 10 }
      const seasonEpisodes: Record<string, number> = {};
      for (const s of aired) {
        seasonEpisodes[String(s.season_number)] = s.episode_count;
      }
      return {
        ...existingMetadata,
        creator: details.created_by.map((c) => c.name).join(", ") || null,
        seasons: realSeasons,
        number_of_seasons: realSeasons,
        number_of_episodes: details.number_of_episodes,
        season_episodes: seasonEpisodes,
        genres: details.genres.map((g) => g.name),
        status: details.status,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function upsertMediaItem(
  result: SearchResult
): Promise<string> {
  const { supabase } = await getAuthUser();

  // For books, upgrade to the canonical English edition before any DB work.
  // Google's pool for broad searches (e.g. "Mistborn") may only surface
  // inferior editions; a targeted title+author query reliably finds the
  // canonical one, giving us consistent data regardless of how the user
  // discovered the book.
  if (result.media_type === "book") {
    const authors = (result.metadata as Record<string, unknown> | null)
      ?.authors as string[] | undefined;
    const firstAuthor = authors?.[0];
    if (firstAuthor) {
      const canonical = await findCanonicalBookEdition(result.title, firstAuthor);
      // Always re-normalize from the canonical-query volume. Even when the ID
      // matches the input, this fetch carries fresh accessInfo which
      // bookCoverUrl uses to pick the right zoom level.
      if (canonical) {
        result = normalizeGoogleBook(canonical);
      }
    }
  }

  // Check if media already exists by external_ids
  const externalKey = Object.keys(result.external_ids)[0];
  const externalValue = result.external_ids[externalKey];

  const { data: existing } = await supabase
    .from("media_items")
    .select("id, metadata, cover_image_url")
    .contains("external_ids", { [externalKey]: externalValue })
    .limit(1)
    .single();

  if (existing) {
    // Re-enrich if metadata is missing key fields (director, genres, etc.)
    const meta = existing.metadata as Record<string, unknown> | null;
    const needsEnrichment =
      (result.media_type === "movie" && !meta?.director) ||
      (result.media_type === "tv_show" && (!meta?.creator || !meta?.season_episodes));

    const updates: Record<string, unknown> = {};

    if (needsEnrichment) {
      const enriched = await enrichTMDBMetadata(result.media_type, result.external_ids, meta ?? {});
      if (enriched) {
        updates.metadata = enriched;
      }
    }

    // Backfill cover if it's missing (e.g., was cleared by migration)
    if (!existing.cover_image_url && result.cover_image_url) {
      updates.cover_image_url = result.cover_image_url;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("media_items").update(updates).eq("id", existing.id);
    }

    return existing.id;
  }

  // Enrich TMDB items with full details before inserting
  const enrichedMetadata =
    (await enrichTMDBMetadata(result.media_type, result.external_ids, result.metadata ?? {})) ??
    result.metadata ??
    {};

  // Insert new media item
  const { data: inserted, error } = await supabase
    .from("media_items")
    .insert({
      media_type: result.media_type,
      title: result.title,
      description: result.description,
      cover_image_url: result.cover_image_url,
      release_date: result.release_date,
      metadata: enrichedMetadata,
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
  status: TrackingStatus,
  options?: {
    rating?: number | null;
    review?: string;
    is_favorite?: boolean;
    progress?: Record<string, unknown>;
    started_at?: string | null;
    completed_at?: string | null;
  }
): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("user_media")
    .upsert(
      {
        user_id: user.id,
        media_id: mediaId,
        status,
        ...(options?.rating !== undefined ? { rating: options.rating } : {}),
        ...(options?.review !== undefined ? { review: options.review || null } : {}),
        ...(options?.is_favorite !== undefined ? { is_favorite: options.is_favorite } : {}),
        ...(options?.progress !== undefined ? { progress: options.progress } : {}),
        started_at: options?.started_at ?? (status === "in_progress" ? new Date().toISOString() : null),
        completed_at: options?.completed_at ?? (status === "completed" ? new Date().toISOString() : null),
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
  rating: number | null
): Promise<void> {
  if (rating !== null && (rating < 1 || rating > 10))
    throw new Error("Rating must be 1-10");

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

/**
 * Set a custom cover for a user's tracked item. Stored in progress JSONB
 * so it's per-user. Pass null to clear the override.
 */
export async function setCustomCover(
  userMediaId: string,
  coverUrl: string | null
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Read current progress to merge
  const { data: current } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  const progress = (current?.progress as Record<string, unknown> | null) ?? {};
  if (coverUrl) {
    progress.custom_cover_url = coverUrl;
  } else {
    delete progress.custom_cover_url;
  }

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to save cover: ${error.message}`);
}
