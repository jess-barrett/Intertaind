import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, BookOpenCheck, Film, Tv, Gamepad2, Eye, Heart, List } from "lucide-react";
import type { MediaItem, MediaType, UserMedia } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import MediaDetailClient from "./media-detail-client";
import CoverImage from "@/components/cover-image";

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
      const devs = metadata.developers as string[] | undefined;
      return devs?.length ? `Developed by ${devs.join(", ")}` : null;
    }
  }
}

function getSecondaryDetails(
  mediaType: MediaType,
  metadata: Record<string, unknown> | null
): string[] {
  if (!metadata) return [];
  const details: string[] = [];
  if (mediaType === "movie" && metadata.runtime)
    details.push(`${metadata.runtime} min`);
  if (mediaType === "book" && metadata.page_count)
    details.push(`${metadata.page_count} pages`);
  if (mediaType === "book" && metadata.publisher)
    details.push(String(metadata.publisher));
  if (mediaType === "tv_show" && metadata.seasons)
    details.push(`${metadata.seasons} seasons`);
  if (mediaType === "video_game") {
    const platforms = metadata.platforms as string[] | undefined;
    if (platforms?.length) details.push(platforms.join(", "));
  }
  const genres = metadata.genres as string[] | undefined;
  if (genres?.length) details.push(genres.join(", "));
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
  const metadata = media.metadata as Record<string, unknown> | null;

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

  const [completedCountRes, inProgressCountRes, favoriteCountRes, listCountRes] = await Promise.all([
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
  ]);

  const stats = {
    completed: completedCountRes.count ?? 0,
    inProgress: inProgressCountRes.count ?? 0,
    favorites: favoriteCountRes.count ?? 0,
    lists: listCountRes.count ?? 0,
  };

  const attribution = getAttribution(media.media_type, metadata);
  const secondaryDetails = getSecondaryDetails(media.media_type, metadata);
  const totalSeasons =
    (metadata?.seasons as number) ?? (metadata?.number_of_seasons as number) ?? 1;
  const seasonEpisodes =
    (metadata?.season_episodes as Record<string, number> | undefined) ?? null;

  // User-specific cover override (set via "Change cover")
  const customCoverUrl =
    (userMedia?.progress as Record<string, unknown> | null)?.custom_cover_url as
      | string
      | undefined;
  const displayCoverUrl = customCoverUrl ?? media.cover_image_url;

  // Extract author name from metadata for cover search (books only)
  const authors = (metadata?.authors as string[] | undefined) ?? [];
  const firstAuthor = authors[0];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Left: Cover + Stats */}
        <div className="w-full shrink-0 md:w-56">
          <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-overlay aspect-2/3">
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
                  icon={Tv}
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
                {new Date(media.release_date).getFullYear()}
              </span>
            )}
          </div>

          {/* Attribution + details + description | Actions sidebar */}
          <div className="mt-1 flex flex-col gap-6 md:flex-row">
            <div className="min-w-0 flex-1">
              {/* Attribution */}
              {attribution && (
                <p className="text-sm text-text-secondary">{attribution}</p>
              )}

              {/* Secondary details */}
              {secondaryDetails.length > 0 && (
                <p className="mt-2 text-xs text-text-muted">
                  {secondaryDetails.join(" · ")}
                </p>
              )}

              {/* Description */}
              {media.description && (
                <p className="mt-4 text-base leading-relaxed text-text-secondary">
                  {media.description}
                </p>
              )}
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
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
