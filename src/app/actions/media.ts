"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult, TrackingStatus } from "@/lib/types";
import {
  getMovieDetails,
  getTVDetails,
  fetchBestTMDBBackdrop,
} from "@/lib/api/tmdb";
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

// --- Phase 1 enrichment helpers ---

const KEY_CREW_JOBS = [
  "Director",
  "Screenplay",
  "Writer",
  "Story",
  "Director of Photography",
  "Original Music Composer",
  "Producer",
  "Executive Producer",
  "Editor",
];

interface RawCast {
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}
interface RawCrew {
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

function pickCast(cast: RawCast[]) {
  return [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    }));
}

function pickKeyCrew(crew: RawCrew[]) {
  // Group named-roles into rows of `{ job, names[] }` so we can render
  // "Director: Shawn Levy" or "Producer: A, B, C" without listing the
  // hundreds of "Visual Effects Artist" entries TMDb returns.
  const out: { job: string; names: string[] }[] = [];
  for (const job of KEY_CREW_JOBS) {
    const names = crew
      .filter((c) => c.job === job)
      .map((c) => c.name);
    const unique = Array.from(new Set(names));
    if (unique.length > 0) out.push({ job, names: unique.slice(0, 4) });
  }
  return out;
}

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "premiere",
  2: "theatrical_limited",
  3: "theatrical",
  4: "digital",
  5: "physical",
  6: "tv",
};

function pickReleaseDates(
  results:
    | {
        iso_3166_1: string;
        release_dates: { type: number; release_date: string }[];
      }[]
    | undefined,
  region = "US"
): Record<string, string> | null {
  if (!results?.length) return null;
  const target = results.find((r) => r.iso_3166_1 === region);
  if (!target) return null;
  const out: Record<string, string> = {};
  for (const rd of target.release_dates) {
    const label = RELEASE_TYPE_LABELS[rd.type];
    if (!label) continue;
    // Multiple release dates of the same type → keep the earliest.
    if (!out[label] || new Date(rd.release_date) < new Date(out[label])) {
      out[label] = rd.release_date;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pickAlternativeTitles(
  titles: { iso_3166_1: string; title: string; type: string }[] | undefined
) {
  if (!titles?.length) return [];
  // Drop empties, prefer up to 8 distinctive entries.
  return titles
    .filter((t) => t.title && t.title.trim().length > 0)
    .slice(0, 8)
    .map((t) => ({ country: t.iso_3166_1, title: t.title }));
}

function pickProductionCompanies(
  cos:
    | { id: number; name: string; logo_path: string | null }[]
    | undefined
) {
  return (cos ?? []).slice(0, 6).map((c) => ({
    id: c.id,
    name: c.name,
    logo_path: c.logo_path,
  }));
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
      const cast = pickCast(details.credits?.cast ?? []);
      const key_crew = pickKeyCrew(details.credits?.crew ?? []);
      const director =
        key_crew.find((r) => r.job === "Director")?.names[0] ?? null;
      return {
        ...existingMetadata,
        director,
        runtime: details.runtime,
        tagline: details.tagline || null,
        genres: details.genres.map((g) => g.name),
        // TMDb keywords double as themes — "post-apocalyptic", "robots",
        // "based on novel", etc.
        keywords:
          details.keywords?.keywords?.map((k) => k.name) ?? [],
        cast,
        key_crew,
        production_companies: pickProductionCompanies(
          details.production_companies
        ),
        production_countries: (details.production_countries ?? []).map((c) => ({
          code: c.iso_3166_1,
          name: c.name,
        })),
        spoken_languages: (details.spoken_languages ?? []).map(
          (l) => l.english_name
        ),
        release_dates: pickReleaseDates(details.release_dates?.results),
        alternative_titles: pickAlternativeTitles(
          details.alternative_titles?.titles
        ),
      };
    } catch {
      return null;
    }
  }

  if (mediaType === "tv_show") {
    try {
      const details = await getTVDetails(tmdbId);
      const today = new Date().toISOString().split("T")[0];
      const allSeasons = details.seasons ?? [];
      // Aired = real season number, has an air_date in the past, with at
      // least one episode listed. Anything else is either a "specials"
      // season (number 0), a placeholder (no air_date), or future content.
      const aired = allSeasons.filter(
        (s) =>
          s.season_number > 0 &&
          s.episode_count > 0 &&
          s.air_date !== null &&
          s.air_date <= today
      );
      // Upcoming = announced with a future air_date. We keep these out of
      // season counts and the log-modal pickers, then surface them as a
      // separate callout.
      const upcoming = allSeasons
        .filter(
          (s) =>
            s.season_number > 0 &&
            s.air_date !== null &&
            s.air_date > today
        )
        .sort((a, b) => (a.air_date! < b.air_date! ? -1 : 1))
        .map((s) => ({
          season_number: s.season_number,
          name: s.name,
          air_date: s.air_date,
          episode_count: s.episode_count,
          poster_path: s.poster_path,
        }));

      const realSeasons = aired.length;
      // Per-season episode counts: { "1": 9, "2": 10 }
      const seasonEpisodes: Record<string, number> = {};
      for (const s of aired) {
        seasonEpisodes[String(s.season_number)] = s.episode_count;
      }
      // Full per-season detail for the "Seasons" tab — poster, synopsis,
      // episode count, air date.
      const seasonDetails = aired.map((s) => ({
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count,
        air_date: s.air_date,
        poster_path: s.poster_path,
        overview: s.overview || null,
      }));
      return {
        ...existingMetadata,
        creator: details.created_by.map((c) => c.name).join(", ") || null,
        seasons: realSeasons,
        number_of_seasons: realSeasons,
        number_of_episodes: details.number_of_episodes,
        season_episodes: seasonEpisodes,
        season_details: seasonDetails,
        upcoming_seasons: upcoming,
        tagline: details.tagline || null,
        genres: details.genres.map((g) => g.name),
        // TV's keywords endpoint nests under `.results` instead of `.keywords`.
        keywords:
          details.keywords?.results?.map((k) => k.name) ?? [],
        status: details.status,
        cast: pickCast(details.credits?.cast ?? []),
        key_crew: pickKeyCrew(details.credits?.crew ?? []),
        // TV gets `networks` (the broadcaster) AND `production_companies`
        // (the studio that made it). Both render as separate sections.
        networks: pickProductionCompanies(details.networks),
        production_companies: pickProductionCompanies(
          details.production_companies
        ),
        production_countries: (details.production_countries ?? []).map((c) => ({
          code: c.iso_3166_1,
          name: c.name,
        })),
        spoken_languages: (details.spoken_languages ?? []).map(
          (l) => l.english_name
        ),
        // TV's alternative_titles uses `results` instead of `titles`.
        alternative_titles: pickAlternativeTitles(
          details.alternative_titles?.results
        ),
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Returns true when a row's stored metadata is missing fields that the
 * current enrichment pipeline produces. Shared between `upsertMediaItem`
 * (insert/track flow) and `ensureMediaItemEnriched` (detail-page lazy
 * refresh) so both paths use the same staleness criteria.
 */
function isMetadataStale(
  mediaType: string,
  meta: Record<string, unknown> | null
): boolean {
  // upcoming_seasons lacked poster_path before the schema bump — detect
  // older entries so they get re-fetched with the new field.
  const upcomingArr = meta?.upcoming_seasons as
    | Array<Record<string, unknown>>
    | undefined;
  const upcomingMissingPoster =
    Array.isArray(upcomingArr) &&
    upcomingArr.length > 0 &&
    !("poster_path" in upcomingArr[0]);

  if (mediaType === "movie") {
    return (
      !meta?.director ||
      meta?.tagline === undefined ||
      meta?.cast === undefined ||
      meta?.keywords === undefined
    );
  }
  if (mediaType === "tv_show") {
    return (
      !meta?.creator ||
      !meta?.season_episodes ||
      meta?.tagline === undefined ||
      meta?.cast === undefined ||
      meta?.upcoming_seasons === undefined ||
      meta?.season_details === undefined ||
      meta?.keywords === undefined ||
      upcomingMissingPoster
    );
  }
  return false;
}

/**
 * Lazy-refresh a media item's metadata if it's stale. Returns the
 * (possibly updated) metadata blob. Safe to call on every detail-page
 * load — the staleness check short-circuits when the row is current.
 *
 * Doesn't require auth — the row update relies on RLS allowing writes
 * to media_items (which is a globally-shared table). If RLS blocks the
 * update we silently return the original metadata.
 */
export async function ensureMediaItemEnriched(
  mediaId: string
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_items")
    .select("media_type, metadata, external_ids")
    .eq("id", mediaId)
    .single();
  if (!data) return null;

  const meta = (data.metadata as Record<string, unknown> | null) ?? null;
  if (!isMetadataStale(data.media_type, meta)) return meta;

  const externalIds =
    (data.external_ids as Record<string, string | number> | null) ?? null;
  if (!externalIds) return meta;

  try {
    const enriched = await enrichTMDBMetadata(
      data.media_type,
      externalIds,
      meta ?? {}
    );
    if (!enriched) return meta;
    await supabase
      .from("media_items")
      .update({ metadata: enriched })
      .eq("id", mediaId);
    return enriched;
  } catch {
    return meta;
  }
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
    .select("id, metadata, cover_image_url, backdrop_url")
    .contains("external_ids", { [externalKey]: externalValue })
    .limit(1)
    .single();

  if (existing) {
    // Re-enrich if metadata is missing key fields (director, genres, etc.)
    const meta = existing.metadata as Record<string, unknown> | null;
    const needsEnrichment = isMetadataStale(result.media_type, meta);

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

    // Backfill / upgrade backdrop. Rows inserted before migration 014 have
    // null here; earlier inserts used TMDb's w1280 size. Either way, when
    // we need to (re)populate we now rank TMDb's /images list to get the
    // highest-voted, text-free backdrop — much better than the default.
    const existingIsLowRes =
      typeof existing.backdrop_url === "string" &&
      existing.backdrop_url.includes("/t/p/w1280/");
    const needsBackdrop = !existing.backdrop_url || existingIsLowRes;
    if (needsBackdrop && result.backdrop_url) {
      const tmdbId = result.external_ids.tmdb_id as number | undefined;
      const isTMDB =
        (result.media_type === "movie" || result.media_type === "tv_show") &&
        tmdbId != null;
      updates.backdrop_url = isTMDB
        ? await fetchBestTMDBBackdrop(
            result.media_type as "movie" | "tv_show",
            tmdbId!,
            result.backdrop_url
          )
        : result.backdrop_url;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("media_items").update(updates).eq("id", existing.id);
    }

    return existing.id;
  }

  // Enrich TMDB items (metadata + best backdrop) in parallel before inserting.
  const tmdbId = result.external_ids.tmdb_id as number | undefined;
  const isTMDB =
    (result.media_type === "movie" || result.media_type === "tv_show") &&
    tmdbId != null;
  const [enrichedMetadataResult, bestBackdrop] = await Promise.all([
    enrichTMDBMetadata(
      result.media_type,
      result.external_ids,
      result.metadata ?? {}
    ),
    isTMDB
      ? fetchBestTMDBBackdrop(
          result.media_type as "movie" | "tv_show",
          tmdbId!,
          result.backdrop_url
        )
      : Promise.resolve(result.backdrop_url),
  ]);
  const enrichedMetadata = enrichedMetadataResult ?? result.metadata ?? {};

  // Insert new media item
  const { data: inserted, error } = await supabase
    .from("media_items")
    .insert({
      media_type: result.media_type,
      title: result.title,
      description: result.description,
      cover_image_url: result.cover_image_url,
      backdrop_url: bestBackdrop,
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
    /** Caller-supplied activity_type override (for TV episode/season logging). */
    activity_type_override?: string;
    /** Extra metadata fields merged into the activity row. */
    activity_metadata_extra?: Record<string, unknown>;
  }
): Promise<string> {
  const { supabase, user } = await getAuthUser();

  // Read the existing row first so we can tell a status-change action
  // apart from an add, and skip activity logging on pure metadata edits.
  const { data: prior } = await supabase
    .from("user_media")
    .select("status, progress, rating, review, is_favorite")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

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

  // Pick the activity_type by priority: explicit override > review > pure
  // status change (when the row already existed and the user isn't logging
  // a rating/review) > completed > added_to_shelf.
  const hasReview = !!(options?.review && options.review.trim().length > 0);
  const hasRatingChange = options?.rating !== undefined;
  const priorSubStatus = (prior?.progress as Record<string, unknown> | null)
    ?.sub_status;
  const newSubStatus = (options?.progress as Record<string, unknown> | undefined)
    ?.sub_status;
  const isStatusChange =
    !!prior &&
    !hasReview &&
    !hasRatingChange &&
    (prior.status !== status || priorSubStatus !== newSubStatus);
  const activityType =
    options?.activity_type_override ??
    (hasReview
      ? "reviewed"
      : isStatusChange
      ? "status_changed"
      : status === "completed"
      ? "completed"
      : "added_to_shelf");

  // Decide whether this trackMedia call deserves an activity row, or if it's
  // a silent metadata edit (just adjusting hours played, a date, or rewriting
  // an existing review). We only log on genuine "events":
  //   - first time tracking
  //   - status / sub_status changed
  //   - newly added or cleared rating
  //   - newly added review (not text edits to an existing review)
  //   - log-episode / log-season overrides are always discrete events
  const overrideAlwaysLogs =
    options?.activity_type_override === "logged_episode" ||
    options?.activity_type_override === "logged_season";
  const isFirstTime = !prior;
  const ratingNewlySet =
    !!prior && prior.rating == null && options?.rating != null;
  const ratingCleared =
    !!prior && prior.rating != null && options?.rating === null;
  const priorReviewText = typeof prior?.review === "string" ? prior.review.trim() : "";
  const reviewNewlyAdded = !!prior && priorReviewText.length === 0 && hasReview;

  const shouldLog =
    overrideAlwaysLogs ||
    isFirstTime ||
    isStatusChange ||
    ratingNewlySet ||
    ratingCleared ||
    reviewNewlyAdded;

  const metadata: Record<string, unknown> = {
    status,
    ...(options?.activity_metadata_extra ?? {}),
  };
  if (options?.rating != null) metadata.rating = options.rating;
  if (hasReview && options?.review) {
    metadata.review_length = options.review.length;
    metadata.review_text = options.review;
  }
  if (options?.is_favorite) metadata.is_favorite = true;
  // Game sub-status drives display labels like "as Playing" / "as Shelved".
  const subStatus = (options?.progress as Record<string, unknown> | undefined)
    ?.sub_status;
  if (subStatus) metadata.sub_status = subStatus;
  // For TV shows, capture the user's current position so activity rows like
  // "Added X as Currently Watching (S2 E5)" can render the season/episode.
  const currentSeason = (options?.progress as Record<string, unknown> | undefined)
    ?.current_season;
  const currentEpisode = (options?.progress as Record<string, unknown> | undefined)
    ?.current_episode;
  if (currentSeason != null) metadata.current_season = currentSeason;
  if (currentEpisode != null) metadata.current_episode = currentEpisode;
  // Game hours_played, surfaced on the activity card next to the title.
  const hoursPlayed = (options?.progress as Record<string, unknown> | undefined)
    ?.hours_played;
  if (typeof hoursPlayed === "number" && hoursPlayed > 0)
    metadata.hours_played = hoursPlayed;

  if (shouldLog) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      media_id: mediaId,
      activity_type: activityType,
      metadata,
    });
  }

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
    activity_type: "status_changed",
    metadata: { to_status: status },
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

  // Skip the activity log when the user is *clearing* their rating —
  // there's nothing meaningful to show in the feed for "unrated", and a
  // null-rating row would otherwise display as a 0-star "Rated X".
  if (rating !== null) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      media_id: data.media_id,
      activity_type: "rated",
      metadata: { rating },
    });
  }
}

export async function toggleFavorite(userMediaId: string): Promise<boolean> {
  const { supabase, user } = await getAuthUser();

  // Get current state + media_id for the activity log
  const { data: current } = await supabase
    .from("user_media")
    .select("is_favorite, media_id")
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

  // Only log the positive transition — unfavoriting is silent.
  if (newValue) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      media_id: current.media_id,
      activity_type: "favorited",
      metadata: {},
    });
  }

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
    metadata: { review_length: review.length, review_text: review },
  });
}

export async function removeTracking(userMediaId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Read the row first so we can record what status it had.
  const { data: existing } = await supabase
    .from("user_media")
    .select("media_id, status")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  // .select() forces Postgres to return the deleted rows so we can verify
  // the delete actually happened — RLS blocks return success-with-0-rows,
  // which would otherwise look identical to a real delete from the client.
  const { data: deleted, error } = await supabase
    .from("user_media")
    .delete()
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(`Failed to remove tracking: ${error.message}`);
  if (!deleted || deleted.length === 0) {
    throw new Error(
      "Failed to remove tracking: nothing was deleted (likely an RLS policy issue)."
    );
  }

  if (existing) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      media_id: existing.media_id,
      activity_type: "removed",
      metadata: { previous_status: existing.status },
    });
  }
}

/**
 * Update just the current_page on a book's tracking row. Used by the
 * inline progress bar on the Reading shelf. Intentionally lightweight —
 * no activity log entry, no status change — a page bump isn't newsworthy.
 */
export async function updateBookPage(
  userMediaId: string,
  currentPage: number
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { data: current } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  const progress = (current?.progress as Record<string, unknown> | null) ?? {};
  progress.current_page = Math.max(0, Math.floor(currentPage));

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to update page: ${error.message}`);
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

/**
 * Set a custom backdrop override for a user's tracked item. Persisted in
 * the user_media.progress JSONB so it's per-user. Pass null to clear and
 * fall back to the shared `media_items.backdrop_url` default.
 */
export async function setCustomBackdrop(
  userMediaId: string,
  backdropUrl: string | null
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { data: current } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  const progress = (current?.progress as Record<string, unknown> | null) ?? {};
  if (backdropUrl) {
    progress.custom_backdrop_url = backdropUrl;
  } else {
    delete progress.custom_backdrop_url;
  }

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to save backdrop: ${error.message}`);
}

/**
 * Return all available backdrop candidate URLs for a media item so the
 * "Change backdrop" picker can display them. Movies/TV pull from TMDb's
 * /images endpoint (ranked by our language + vote heuristic). Games pull
 * from IGDB's artworks + screenshots. Books have none.
 */
export async function listMediaBackdrops(
  mediaId: string
): Promise<string[]> {
  const { supabase } = await getAuthUser();

  const { data: media } = await supabase
    .from("media_items")
    .select("media_type, external_ids")
    .eq("id", mediaId)
    .single();
  if (!media) return [];

  const mediaType = media.media_type as string;
  const externalIds = (media.external_ids as Record<string, unknown> | null) ?? {};

  if (mediaType === "movie" || mediaType === "tv_show") {
    const tmdbId = externalIds.tmdb_id as number | undefined;
    if (!tmdbId) return [];
    try {
      const { getMovieImages, getTVImages, tmdbImageUrl } = await import(
        "@/lib/api/tmdb"
      );
      const res =
        mediaType === "movie"
          ? await getMovieImages(tmdbId)
          : await getTVImages(tmdbId);
      // Rank same way `pickBestTMDBBackdrop` does — language-neutral > en,
      // then by vote_average, then vote_count — so the picker presents
      // the best candidates first.
      const langScore = (lang: string | null): number => {
        if (lang === null) return 2;
        if (lang === "en") return 1;
        return 0;
      };
      const ranked = [...res.backdrops].sort((a, b) => {
        const l = langScore(b.iso_639_1) - langScore(a.iso_639_1);
        if (l !== 0) return l;
        if (b.vote_average !== a.vote_average)
          return b.vote_average - a.vote_average;
        return b.vote_count - a.vote_count;
      });
      return ranked
        .map((img) => tmdbImageUrl(img.file_path, "original"))
        .filter((u): u is string => !!u);
    } catch {
      return [];
    }
  }

  if (mediaType === "video_game") {
    const igdbId = externalIds.igdb_id as number | undefined;
    if (!igdbId) return [];
    try {
      const { getGameDetails, igdbImageUrl } = await import("@/lib/api/igdb");
      const game = await getGameDetails(igdbId);
      if (!game) return [];
      const artworkUrls =
        game.artworks?.map((a) => igdbImageUrl(a.image_id, "t_1080p")) ?? [];
      const screenshotUrls =
        game.screenshots?.map((s) => igdbImageUrl(s.image_id, "t_1080p")) ?? [];
      // Artworks first (curated key art), then screenshots (gameplay frames).
      return [...artworkUrls, ...screenshotUrls];
    } catch {
      return [];
    }
  }

  return [];
}
