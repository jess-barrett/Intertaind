import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Film, Tv, Gamepad2, Users } from "lucide-react";
import type { MediaItem, MediaType, ShelfItem } from "@/lib/types";
import { MEDIA_TYPE_CONFIG, TOP_5_SHELF_NAMES } from "@/lib/types";
import TopFiveGrid from "@/components/top-five-grid";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

const STAT_ORDER: MediaType[] = ["movie", "tv_show", "book", "video_game"];

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params;
  const supabase = await createClient();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  // Fetch all data in parallel
  const [
    movieCountRes,
    tvCountRes,
    bookCountRes,
    gameCountRes,
    topShelvesRes,
  ] = await Promise.all([
    // Per-type counts: join user_media → media_items to filter by media_type
    supabase
      .from("user_media")
      .select("id, media_items!inner(media_type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_items.media_type", "movie"),
    supabase
      .from("user_media")
      .select("id, media_items!inner(media_type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_items.media_type", "tv_show"),
    supabase
      .from("user_media")
      .select("id, media_items!inner(media_type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_items.media_type", "book"),
    supabase
      .from("user_media")
      .select("id, media_items!inner(media_type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_items.media_type", "video_game"),
    // Top 5 shelves
    supabase
      .from("shelves")
      .select("id, name")
      .eq("user_id", profile.id)
      .in("name", Object.values(TOP_5_SHELF_NAMES)),
  ]);

  const mediaCounts: Record<MediaType, number> = {
    movie: movieCountRes.count ?? 0,
    tv_show: tvCountRes.count ?? 0,
    book: bookCountRes.count ?? 0,
    video_game: gameCountRes.count ?? 0,
  };

  // Fetch top 5 shelf items
  const topFives: Record<MediaType, MediaItem[]> = {
    movie: [],
    tv_show: [],
    book: [],
    video_game: [],
  };

  const shelves = topShelvesRes.data ?? [];
  if (shelves.length > 0) {
    const shelfIds = shelves.map((s) => s.id);
    const { data: allItems } = await supabase
      .from("shelf_items")
      .select("*, media_items(*)")
      .in("shelf_id", shelfIds)
      .order("position")
      .limit(20);

    // Map shelf name → media type
    const shelfIdToType: Record<string, MediaType> = {};
    for (const shelf of shelves) {
      for (const [type, name] of Object.entries(TOP_5_SHELF_NAMES)) {
        if (shelf.name === name) shelfIdToType[shelf.id] = type as MediaType;
      }
    }

    for (const item of (allItems ?? []) as (ShelfItem & { media_items: MediaItem })[]) {
      const type = shelfIdToType[item.shelf_id];
      if (type && topFives[type].length < 5) {
        topFives[type].push(item.media_items);
      }
    }
  }

  // Check if viewer is the profile owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  // Followers/following — stubbed for now (no follows table yet)
  const followersCount = 0;
  const followingCount = 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Profile header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: avatar + info */}
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
            {/* Followers / following */}
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {followersCount}
                </span>{" "}
                followers
              </span>
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {followingCount}
                </span>{" "}
                following
              </span>
            </div>
          </div>
        </div>

        {/* Right: per-type stats */}
        <div className="flex gap-3 sm:gap-4">
          {STAT_ORDER.map((type) => {
            const config = MEDIA_TYPE_CONFIG[type];
            const Icon = MEDIA_ICONS[type];
            return (
              <div key={type} className="flex flex-col items-center gap-1">
                <Icon size={16} className={config.color} />
                <span className="text-lg font-bold text-text-primary">
                  {mediaCounts[type]}
                </span>
                <span className="text-xs text-text-muted">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shelf tabs */}
      <nav className="mt-10 flex gap-2 border-b border-surface-border pb-3">
        {([
          { href: `/u/${username}/movies`, label: "Movies", icon: Film, color: "text-accent-movie" },
          { href: `/u/${username}/tv-shows`, label: "Shows", icon: Tv, color: "text-accent-tv" },
          { href: `/u/${username}/books`, label: "Books", icon: BookOpen, color: "text-accent-book" },
          { href: `/u/${username}/games`, label: "Games", icon: Gamepad2, color: "text-accent-game" },
        ] as const).map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            <tab.icon size={14} className={tab.color} />
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Top 5 Grid */}
      <section className="mt-8">
        <TopFiveGrid topFives={topFives} username={username} isOwner={isOwner} />
      </section>

      {/* Divider */}
      <hr className="my-10 border-surface-border" />

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Recent Activity
        </h2>
        <div className="flex flex-col items-center py-12 text-center">
          <Users size={24} className="mb-3 text-text-muted" />
          <p className="text-sm text-text-muted">
            Activity feed coming soon
          </p>
        </div>
      </section>
    </div>
  );
}
