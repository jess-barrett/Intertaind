import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Film, Tv, Gamepad2, Settings } from "lucide-react";
import type { MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import ProfileNavTabs from "./profile-nav-tabs";
import FollowButton from "@/components/follow-button";
import FollowActionsMenu from "@/components/follow-actions-menu";
import { getFollowState } from "@/app/actions/social";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

const STAT_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];

export default async function UserProfileLayout({
  params,
  children,
}: {
  params: Promise<{ username: string }>;
  children: React.ReactNode;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  const [movieCountRes, tvCountRes, bookCountRes, gameCountRes] =
    await Promise.all([
      supabase
        .from("user_media")
        .select("id, media_items!inner(media_type)", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("media_items.media_type", "movie")
        .neq("status", "want"),
      supabase
        .from("user_media")
        .select("id, media_items!inner(media_type)", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("media_items.media_type", "tv_show"),
      supabase
        .from("user_media")
        .select("id, media_items!inner(media_type)", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("media_items.media_type", "book")
        .neq("status", "want"),
      supabase
        .from("user_media")
        .select("id, media_items!inner(media_type)", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("media_items.media_type", "video_game"),
    ]);

  const mediaCounts: Record<MediaType, number> = {
    movie: movieCountRes.count ?? 0,
    tv_show: tvCountRes.count ?? 0,
    book: bookCountRes.count ?? 0,
    video_game: gameCountRes.count ?? 0,
  };

  const followersCount = profile.followers_count ?? 0;
  const followingCount = profile.following_count ?? 0;

  const followState = isOwner ? "self" : await getFollowState(profile.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Profile header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-2xl font-bold text-brand">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              profile.username[0].toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {profile.display_name || profile.username}
            </h1>
            <p className="text-text-muted">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2 max-w-md text-sm text-text-secondary">
                {profile.bio}
              </p>
            )}
            <div className="mt-3 flex items-center gap-4 text-sm">
              <Link
                href={`/u/${username}/followers`}
                className="text-text-secondary transition-colors hover:text-text-primary"
              >
                <span className="font-semibold text-text-primary">
                  {followersCount}
                </span>{" "}
                followers
              </Link>
              <Link
                href={`/u/${username}/following`}
                className="text-text-secondary transition-colors hover:text-text-primary"
              >
                <span className="font-semibold text-text-primary">
                  {followingCount}
                </span>{" "}
                following
              </Link>
              {isOwner && (
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="ml-1 text-text-muted transition-colors hover:text-text-primary"
                >
                  <Settings size={16} />
                </Link>
              )}
            </div>

            {!isOwner && (
              <div className="mt-4 flex items-center gap-2">
                <FollowButton
                  targetId={profile.id}
                  targetIsPrivate={profile.is_private}
                  initialState={followState}
                  loggedIn={!!user}
                />
                {!!user && (
                  <FollowActionsMenu
                    targetId={profile.id}
                    targetUsername={profile.username}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-5 sm:gap-7">
          {STAT_ORDER.map((type) => {
            const config = MEDIA_TYPE_CONFIG[type];
            const Icon = MEDIA_ICONS[type];
            return (
              <div key={type} className="flex flex-col items-center gap-1.5">
                <Icon size={22} className={config.color} />
                <span className="text-2xl font-bold text-text-primary">
                  {mediaCounts[type]}
                </span>
                <span className="text-sm text-text-muted">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ProfileNavTabs username={username} />

      {children}
    </div>
  );
}
