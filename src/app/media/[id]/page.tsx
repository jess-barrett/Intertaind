import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Film, Tv, Gamepad2, Calendar, Star } from "lucide-react";
import type { MediaItem, MediaType, UserMedia, Profile } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import MediaDetailClient from "./media-detail-client";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  tv_show: Tv,
  video_game: Gamepad2,
};

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

  // Check if user is logged in and fetch their tracking
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

  // Fetch community reviews
  const { data: reviews } = await supabase
    .from("user_media")
    .select("*, profiles(*)")
    .eq("media_id", id)
    .not("review", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const typedReviews =
    (reviews as (UserMedia & { profiles: Profile })[]) ?? [];

  // Extract type-specific info
  const metaDetails: { label: string; value: string }[] = [];
  if (metadata) {
    if (media.media_type === "book") {
      const authors = metadata.authors as string[] | undefined;
      if (authors?.length) metaDetails.push({ label: "Author", value: authors.join(", ") });
      if (metadata.page_count) metaDetails.push({ label: "Pages", value: String(metadata.page_count) });
      if (metadata.publisher) metaDetails.push({ label: "Publisher", value: String(metadata.publisher) });
    }
    if (media.media_type === "movie") {
      if (metadata.director) metaDetails.push({ label: "Director", value: String(metadata.director) });
      if (metadata.runtime) metaDetails.push({ label: "Runtime", value: `${metadata.runtime} min` });
    }
    if (media.media_type === "tv_show") {
      if (metadata.creator) metaDetails.push({ label: "Creator", value: String(metadata.creator) });
      if (metadata.seasons) metaDetails.push({ label: "Seasons", value: String(metadata.seasons) });
    }
    if (media.media_type === "video_game") {
      const devs = metadata.developers as string[] | undefined;
      if (devs?.length) metaDetails.push({ label: "Developer", value: devs.join(", ") });
      const platforms = metadata.platforms as string[] | undefined;
      if (platforms?.length) metaDetails.push({ label: "Platforms", value: platforms.join(", ") });
    }
    const genres = metadata.genres as string[] | undefined;
    if (genres?.length) metaDetails.push({ label: "Genres", value: genres.join(", ") });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Cover */}
        <div className="w-full shrink-0 md:w-64">
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-overlay aspect-2/3">
            {media.cover_image_url ? (
              <img
                src={media.cover_image_url}
                alt={media.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Icon size={48} className={`${config.color} opacity-40`} />
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className={`mb-3 inline-flex items-center gap-1.5 rounded-md ${config.bg} px-2.5 py-1`}>
            <Icon size={14} className={config.color} />
            <span className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-text-primary">
            {media.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text-muted">
            {media.release_date && (
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {new Date(media.release_date).getFullYear()}
              </span>
            )}
            {media.avg_rating && (
              <span className="flex items-center gap-1">
                <Star size={14} className="fill-accent-game text-accent-game" />
                {media.avg_rating.toFixed(1)} ({media.rating_count} ratings)
              </span>
            )}
          </div>

          {/* Metadata details */}
          {metaDetails.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {metaDetails.map((d) => (
                <span key={d.label}>
                  <span className="text-text-muted">{d.label}: </span>
                  <span className="text-text-secondary">{d.value}</span>
                </span>
              ))}
            </div>
          )}

          {media.description && (
            <p className="mt-5 leading-relaxed text-text-secondary">
              {media.description}
            </p>
          )}

          {/* Tracking controls — client component */}
          <div className="mt-8">
            <MediaDetailClient
              mediaId={media.id}
              userMedia={userMedia}
              isLoggedIn={!!user}
            />
          </div>
        </div>
      </div>

      {/* Community reviews */}
      {typedReviews.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Reviews
          </h2>
          <div className="space-y-4">
            {typedReviews.map((r) => (
              <div key={r.id} className="glass p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-text-primary">
                    {r.profiles?.display_name || r.profiles?.username}
                  </span>
                  {r.rating && (
                    <span className="flex items-center gap-0.5 text-xs text-accent-game">
                      <Star size={10} className="fill-accent-game" />
                      {r.rating}/10
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-secondary">{r.review}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
