import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, BookOpenCheck, Film, Tv, TvMinimalPlay, Gamepad2, Eye, Heart, List, CalendarClock } from "lucide-react";
import type { MediaItem, MediaType, UserMedia } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { tmdbImageUrl } from "@/lib/api/tmdb";
import MediaDetailClient from "./media-detail-client";
import { MediaCastSection } from "@/components/media/media-info-sections";
import MediaInfoTabs from "@/components/media/media-info-tabs";
import AboutTheAuthor from "@/components/media/about-the-author";
import RatingsHistogram from "@/components/media/ratings-histogram";
import SeriesGraph from "@/components/media/series-graph";
import CoverImage from "@/components/cover-image";
import BackButton from "@/components/back-button";
import RecommendButton from "@/components/recommendations/recommend-button";
import MediaRecommendationsSection from "@/components/recommendations/media-recommendations-section";
import { ensureMediaItemEnriched } from "@/app/actions/media";
import { yearFromDateString } from "@/lib/time";
import {
  fetchRecommendationsForSource,
  fetchRecommendationsForTarget,
} from "@/app/actions/recommendations";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

function getAttribution(
  mediaType: MediaType,
  metadata: Record<string, unknown> | null
): string | null {
  if (!metadata) return null;
  switch (mediaType) {
    case "movie": {
      const director = metadata.director as string | undefined;
      return director ? `Directed by ${director}` : null;
    }
    case "tv_show": {
      const creator = metadata.creator as string | undefined;
      return creator ? `Created by ${creator}` : null;
    }
    case "book": {
      const authors = metadata.authors as string[] | undefined;
      return authors?.length ? `by ${authors.join(", ")}` : null;
    }
    case "video_game": {
      // Developers may be the legacy `string[]` shape or the new
      // `{id,name}[]` — accept either so the byline renders before
      // `ensureMediaItemEnriched` migrates the row to the linked shape.
      const raw = metadata.developers as
        | (string | { id?: number; name: string })[]
        | undefined;
      const names =
        raw?.map((d) => (typeof d === "string" ? d : d.name)) ?? [];
      return names.length ? `Developed by ${names.join(", ")}` : null;
    }
  }
}

function getSecondaryDetails(
  mediaType: MediaType,
  metadata: Record<string, unknown> | null,
  /** Position within the book's series. Inserted between page count
      and publisher when present so users can tell at a glance whether
      this is e.g. Book 1 or Book 5 of a series. */
  seriesPosition?: number | null
): string[] {
  if (!metadata) return [];
  const details: string[] = [];
  if (mediaType === "movie" && metadata.runtime)
    details.push(`${metadata.runtime} min`);
  if (mediaType === "book" && metadata.page_count)
    details.push(`${metadata.page_count} pages`);
  if (mediaType === "book" && seriesPosition != null)
    details.push(`Book ${seriesPosition}`);
  if (mediaType === "book" && metadata.publisher)
    details.push(String(metadata.publisher));
  if (mediaType === "tv_show" && metadata.seasons)
    details.push(`${metadata.seasons} seasons`);
  // Note: video game platforms + genres render in their own tabs below,
  // not here. Other media types still show genres inline.
  if (mediaType !== "video_game") {
    const genres = metadata.genres as string[] | undefined;
    if (genres?.length) details.push(genres.join(", "));
  }
  return details;
}

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("media_items")
    .select("*")
    .eq("id", id)
    .single();

  if (!item) notFound();

  const media = item as MediaItem;
  const config = MEDIA_TYPE_CONFIG[media.media_type];
  const Icon = MEDIA_ICONS[media.media_type];

  // Lazy-refresh stale metadata in the background — fire-and-forget via
  // `after()` so the page render doesn't block on TMDb / IGDB / OL /
  // Google Books. The current row's metadata renders immediately; the
  // freshened blob shows up on the next visit.
  //
  // Trade-off: a brand-new row that hasn't been enriched yet will paint
  // with whatever fields the upsert flow seeded (which is usually
  // complete — `upsertMediaItem` runs the full enrichment inline). The
  // lazy path here is for rows that pre-date a schema bump.
  const metadata = media.metadata as Record<string, unknown> | null;
  // Pre-build the supabase client OUTSIDE `after()` — cookies() can't
  // be called inside an after() callback in Next.js 16, and our
  // `createClient()` reads the cookie store for auth. The pre-built
  // client uses the request's cookies but the actual reads/writes
  // execute later, after the response has been sent.
  const enrichClient = supabase;
  after(async () => {
    try {
      await ensureMediaItemEnriched(media.id, enrichClient);
    } catch {
      // Background work — never fail the request if enrichment errors.
    }
  });

  // Auth + user tracking
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userMedia: UserMedia | null = null;
  if (user) {
    const { data } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .eq("media_id", id)
      .limit(1)
      .single();
    userMedia = data as UserMedia | null;
  }

  // For games: "played" means anyone tracking it except wishlisted (status != "want")
  // For other types: "completed" = status="completed"
  const isGame = media.media_type === "video_game";

  const [
    completedCountRes,
    inProgressCountRes,
    favoriteCountRes,
    listCountRes,
    ratingRowsRes,
  ] = await Promise.all([
    isGame
      ? supabase
          .from("user_media")
          .select("id", { count: "exact", head: true })
          .eq("media_id", id)
          .neq("status", "want")
      : supabase
          .from("user_media")
          .select("id", { count: "exact", head: true })
          .eq("media_id", id)
          .eq("status", "completed"),
    supabase
      .from("user_media")
      .select("id", { count: "exact", head: true })
      .eq("media_id", id)
      .eq("status", "in_progress"),
    supabase
      .from("user_media")
      .select("id", { count: "exact", head: true })
      .eq("media_id", id)
      .eq("is_favorite", true),
    supabase
      .from("list_items")
      .select("id", { count: "exact", head: true })
      .eq("media_id", id),
    // Raw rating values for the histogram. Rating is stored 1–10 (each
    // step = 0.5 stars). Group + count happens in JS — fine while user
    // counts are small. Swap to a SQL aggregate / materialized view if
    // a single title ever pulls thousands of rows.
    supabase
      .from("user_media")
      .select("rating")
      .eq("media_id", id)
      .not("rating", "is", null),
  ]);

  const stats = {
    completed: completedCountRes.count ?? 0,
    inProgress: inProgressCountRes.count ?? 0,
    favorites: favoriteCountRes.count ?? 0,
    lists: listCountRes.count ?? 0,
  };

  // Top-5 recommendations in each direction. Both queries hit narrow
  // single-column indexes (recommendations_source_idx + _target_idx),
  // so this is two cheap reads regardless of total community volume.
  const [pairsWithRes, recommendedForRes] = await Promise.all([
    fetchRecommendationsForSource(id, 5, 0),
    fetchRecommendationsForTarget(id, 5, 0),
  ]);

  // Series siblings — only relevant for books that have been tagged
  // with a series via the enrichment helper. Single indexed query
  // (covered by media_items_series_idx); skipped entirely for media
  // outside the books category or untagged books.
  type SeriesSibling = {
    id: string;
    title: string;
    series_position: number | null;
    release_date: string | null;
    avg_rating: number | string | null;
    rating_count: number | null;
    metadata: {
      gb_average_rating?: number | null;
      gb_ratings_count?: number | null;
    } | null;
  };
  let seriesBooks: SeriesSibling[] = [];
  let nextBook: { id: string; title: string } | null = null;
  // The position to display in the secondary-details line ("Book N").
  // Derived from the graph's ordering rule (explicit position when all
  // siblings have one, else release_date sort) so the number matches
  // what the graph plots — even when stored `series_position` is null
  // because Wikidata / GB / OL didn't have the data.
  let effectiveSeriesPosition: number | null = null;
  if (media.media_type === "book" && media.series_id) {
    const { data } = await supabase
      .from("media_items")
      .select(
        "id, title, series_position, release_date, avg_rating, rating_count, metadata"
      )
      .eq("series_id", media.series_id)
      .order("series_position", { ascending: true, nullsFirst: false });
    seriesBooks = (data as SeriesSibling[]) ?? [];

    if (seriesBooks.length > 1) {
      const allHaveExplicit = seriesBooks.every(
        (b) => b.series_position != null
      );
      const sorted = allHaveExplicit
        ? [...seriesBooks].sort(
            (a, b) => (a.series_position ?? 0) - (b.series_position ?? 0)
          )
        : [...seriesBooks].sort((a, b) =>
            (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999")
          );
      const currentIdx = sorted.findIndex((b) => b.id === media.id);
      if (currentIdx >= 0) {
        // Use the explicit position if every sibling has one, else
        // the 1-based index in the sorted-by-release-date list.
        effectiveSeriesPosition = allHaveExplicit
          ? sorted[currentIdx].series_position
          : currentIdx + 1;
        // Next book — the sibling immediately after the current one.
        if (currentIdx < sorted.length - 1) {
          const next = sorted[currentIdx + 1];
          nextBook = { id: next.id, title: next.title };
        }
      }
    } else if (seriesBooks.length === 1 && media.series_position != null) {
      // Single-known book with an explicit position from upstream.
      effectiveSeriesPosition = media.series_position;
    }
  }

  // Build the 10-bucket rating histogram (1..10 → 0.5..5.0 stars).
  const ratingValues =
    ((ratingRowsRes.data as { rating: number | null }[] | null) ?? [])
      .map((r) => r.rating)
      .filter((r): r is number => r != null && r >= 1 && r <= 10);
  const ratingBuckets = new Array(10).fill(0) as number[];
  for (const r of ratingValues) ratingBuckets[r - 1]++;
  const ratingTotal = ratingValues.length;
  const ratingAverage =
    ratingTotal > 0
      ? ratingValues.reduce((a, b) => a + b, 0) / ratingTotal / 2
      : null;

  const attribution = getAttribution(media.media_type, metadata);
  const secondaryDetails = getSecondaryDetails(
    media.media_type,
    metadata,
    effectiveSeriesPosition
  );
  const totalSeasons =
    (metadata?.seasons as number) ?? (metadata?.number_of_seasons as number) ?? 1;
  const seasonEpisodes =
    (metadata?.season_episodes as Record<string, number> | undefined) ?? null;

  // User-specific cover override (set via "Change cover")
  const customCoverUrl =
    (userMedia?.progress as Record<string, unknown> | null)?.custom_cover_url as
      | string
      | undefined;

  // For TV shows, swap to a season poster only when there's something
  // *current* worth highlighting:
  //   1. An announced upcoming season (use its poster)
  //   2. A season that aired in the last 60 days (use its poster)
  // Otherwise stick with the show-level poster — long-ended shows keep
  // their canonical artwork.
  let highlightedSeasonPoster: string | null = null;
  if (media.media_type === "tv_show") {
    const RECENTLY_RELEASED_DAYS = 60;
    const upcomingSeasons =
      (metadata?.upcoming_seasons as
        | { season_number: number; poster_path: string | null; air_date: string | null }[]
        | undefined) ?? [];
    const airedSeasons =
      (metadata?.season_details as
        | { season_number: number; poster_path: string | null; air_date: string | null }[]
        | undefined) ?? [];

    // Priority 1: upcoming season with a poster, soonest first.
    const upcomingWithPoster = [...upcomingSeasons]
      .filter((s) => s.poster_path && s.air_date)
      .sort((a, b) => (a.air_date! < b.air_date! ? -1 : 1))[0];

    if (upcomingWithPoster?.poster_path) {
      highlightedSeasonPoster = tmdbImageUrl(
        upcomingWithPoster.poster_path,
        "w500"
      );
    } else {
      // Priority 2: most recently aired season if it landed within the
      // recency window.
      const mostRecentAired = [...airedSeasons]
        .filter((s) => s.poster_path && s.air_date)
        .sort((a, b) => (a.air_date! < b.air_date! ? 1 : -1))[0];

      if (mostRecentAired?.air_date && mostRecentAired.poster_path) {
        const daysSince =
          (Date.now() - new Date(mostRecentAired.air_date).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSince < RECENTLY_RELEASED_DAYS) {
          highlightedSeasonPoster = tmdbImageUrl(
            mostRecentAired.poster_path,
            "w500"
          );
        }
      }
    }
  }

  const displayCoverUrl =
    customCoverUrl ?? highlightedSeasonPoster ?? media.cover_image_url;

  // Extract author name from metadata for cover search (books only)
  const authors = (metadata?.authors as string[] | undefined) ?? [];
  const firstAuthor = authors[0];

  const userBackdropUrl = (userMedia?.progress as Record<string, unknown> | null)
    ?.custom_backdrop_url as string | undefined;
  const backdropUrl = userBackdropUrl ?? media.backdrop_url;

  return (
    <>
      {backdropUrl && (
        // Constrain to max-w-7xl (slightly wider than the nav's max-w-6xl
        // content) so the backdrop frames the nav logo + profile dropdown
        // rather than stretching edge-to-edge. Anchored below the nav —
        // the nav stays fully opaque over the page background instead of
        // blurring the backdrop through it.
        <div className="mx-auto w-full max-w-7xl px-4">
          <div className="relative h-96 w-full overflow-hidden md:h-128 lg:h-160">
            <img
              src={backdropUrl}
              alt=""
              aria-hidden
              className="h-full w-full object-cover"
            />
            {/* Bottom-to-top vertical fade into the page background. Only
                the lower half carries a gradient — the top stays fully
                uncovered so the image shows at its real brightness. */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-background from-20% to-transparent to-65%" />
            {/* Soft horizontal fades on the left and right edges. Wider +
                with a mid-opacity stop so the transition is feathered
                rather than a visible band where the image cuts off. */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-48 bg-linear-to-r from-background via-(--background)/70 to-transparent md:w-56 lg:w-64" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-48 bg-linear-to-l from-background via-(--background)/70 to-transparent md:w-56 lg:w-64" />
          </div>
        </div>
      )}
      <div
        className={`mx-auto w-full max-w-5xl px-4 ${
          backdropUrl ? "-mt-40 md:-mt-48 pb-8" : "py-8"
        } relative`}
      >
        <div className="mb-4">
          <BackButton />
        </div>
        <div className="flex flex-col gap-8 md:flex-row">
        {/* Left: Cover + Stats */}
        <div className="w-full shrink-0 md:w-56">
          <div className="overflow-hidden rounded-sm border border-surface-border bg-surface-overlay aspect-2/3">
            <CoverImage
              src={displayCoverUrl}
              alt={media.title}
              className="h-full w-full object-cover"
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Icon size={48} className={`${config.color} opacity-40`} />
                </div>
              }
            />
          </div>

          {/* Stats beneath cover — genre-specific icons */}
          <div className="mt-3 flex flex-wrap items-center justify-around gap-y-1 text-xs text-text-muted">
            {media.media_type === "movie" && (
              <Stat icon={Eye} count={stats.completed} label="Watched" />
            )}
            {media.media_type === "tv_show" && (
              <>
                <Stat icon={Eye} count={stats.completed} label="Watched" />
                <Stat
                  icon={TvMinimalPlay}
                  count={stats.inProgress}
                  label="Currently watching"
                  iconClassName="-translate-y-px"
                />
              </>
            )}
            {media.media_type === "book" && (
              <>
                <Stat icon={BookOpenCheck} count={stats.completed} label="Read" />
                <Stat icon={BookOpen} count={stats.inProgress} label="Currently reading" />
              </>
            )}
            {media.media_type === "video_game" && (
              <Stat icon={Gamepad2} count={stats.completed} label="Played" />
            )}
            <Stat icon={List} count={stats.lists} label="In lists" />
            <Stat icon={Heart} count={stats.favorites} label="Loved" />
          </div>

          {/* Series ratings graph — sits below the stats so it doesn't
              break the cover→stats visual rhythm. Only renders for
              books in a known series with at least 2 rated siblings. */}
          {media.media_type === "book" && media.series_id && (
            <SeriesGraph
              books={seriesBooks}
              currentId={media.id}
              seriesName={media.series_name}
              seriesStatus={media.series_status}
              nextBook={nextBook}
            />
          )}
        </div>

        {/* Right of cover: Title block + content row */}
        <div className="min-w-0 flex-1">
          {/* Title + Year — full width */}
          <div className="flex items-baseline gap-3">
            <h1 className="text-4xl font-bold text-text-primary">
              {media.title}
            </h1>
            {media.release_date && (
              <span className="text-lg text-text-muted">
                {yearFromDateString(media.release_date)}
              </span>
            )}
          </div>

          {/* Attribution — full-width, sits below the title block. */}
          {attribution && (
            <p className="mt-1 text-sm text-text-secondary">{attribution}</p>
          )}

          {/* Secondary details — also full-width above the inner row, so
              the sidebar lines up with the tagline below. */}
          {secondaryDetails.length > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              {secondaryDetails.join(" · ")}
            </p>
          )}

          {/* Tagline + description + cast + tabs | Actions sidebar */}
          <div className="mt-4 flex flex-col gap-6 md:flex-row">
            <div className="min-w-0 flex-1">
              {/* Tagline — TMDb-sourced for movies and shows. Small caps
                  above the description, matching the Letterboxd treatment. */}
              {typeof metadata?.tagline === "string" &&
                (metadata.tagline as string).trim().length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {metadata.tagline as string}
                  </p>
                )}

              {/* Description */}
              {media.description && (
                <p className="mt-3 text-base leading-relaxed text-text-secondary">
                  {media.description}
                </p>
              )}

              {/* Upcoming-season callout (TV only) — sits between the
                  description and the cast row. */}
              {media.media_type === "tv_show" && (
                <UpcomingSeasonsCallout
                  upcoming={
                    (metadata?.upcoming_seasons as
                      | {
                          season_number: number;
                          name: string;
                          air_date: string | null;
                          episode_count: number;
                        }[]
                      | undefined) ?? []
                  }
                />
              )}

              {/* Cast slider — inside the description column so it
                  inherits that column's width. */}
              <MediaCastSection
                mediaType={media.media_type}
                metadata={metadata}
              />

              {/* Books: pull author bio + photo from Open Library. We
                  only show the primary author — multi-author books would
                  clutter the column. */}
              {media.media_type === "book" &&
                (() => {
                  const authors = metadata?.authors as string[] | undefined;
                  const primary = authors?.[0];
                  return primary ? <AboutTheAuthor name={primary} /> : null;
                })()}

              {/* Tabbed crew / details / releases / alternative titles —
                  same width as the cast slider. */}
              <MediaInfoTabs
                mediaType={media.media_type}
                metadata={metadata}
              />

              {/* Community recommendations — two-direction toggle. The
                  totals come from denormalized columns on media_items
                  (`recommendations_count` / `recommended_for_count`) so
                  no extra aggregate query is needed. */}
              <MediaRecommendationsSection
                mediaId={media.id}
                pairsWith={pairsWithRes.items}
                pairsWithTotal={media.recommendations_count ?? 0}
                recommendedFor={recommendedForRes.items}
                recommendedForTotal={media.recommended_for_count ?? 0}
              />
            </div>

            {/* Actions sidebar */}
            <div className="w-full shrink-0 md:w-48">
              <MediaDetailClient
                mediaId={media.id}
                mediaType={media.media_type}
                mediaTitle={media.title}
                totalSeasons={totalSeasons}
                seasonEpisodes={seasonEpisodes}
                userMedia={userMedia}
                isLoggedIn={!!user}
                defaultCoverUrl={media.cover_image_url}
                currentCoverUrl={displayCoverUrl}
                authorName={firstAuthor}
                totalPagesDefault={
                  (media.metadata?.page_count as number | undefined) ?? null
                }
                defaultBackdropUrl={media.backdrop_url}
                currentBackdropUrl={backdropUrl}
              />

              {/* Recommend pairing — opens a modal that lets the viewer
                  post an "if you liked THIS, try X" recommendation. */}
              <div className="mt-3">
                <RecommendButton
                  source={{
                    id: media.id,
                    title: media.title,
                    cover_image_url: media.cover_image_url,
                    media_type: media.media_type,
                  }}
                  isLoggedIn={!!user}
                />
              </div>

              {/* Ratings histogram — sits beneath the action stack. Hides
                  itself when there are no ratings yet. */}
              <RatingsHistogram
                buckets={ratingBuckets}
                total={ratingTotal}
                average={ratingAverage}
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  count,
  label,
  iconClassName,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  iconClassName?: string;
}) {
  return (
    <span className="group relative flex items-center gap-1">
      <Icon size={12} className={iconClassName} />
      {count.toLocaleString()}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

function UpcomingSeasonsCallout({
  upcoming,
}: {
  upcoming: {
    season_number: number;
    name: string;
    air_date: string | null;
    episode_count: number;
  }[];
}) {
  if (upcoming.length === 0) return null;
  // Show the soonest. Multiple upcoming seasons would be rare; if it
  // happens we list them stacked.
  return (
    <div className="mt-3 space-y-1.5">
      {upcoming.map((s) => (
        <div
          key={s.season_number}
          className="flex items-center gap-2 rounded-sm border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-light"
        >
          <CalendarClock size={14} className="shrink-0" />
          <span>
            <span className="font-medium">Season {s.season_number}</span>{" "}
            {s.air_date ? (
              <>
                premieres{" "}
                {new Date(s.air_date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </>
            ) : (
              "coming soon"
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
