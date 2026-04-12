import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Film, Tv, Gamepad2, Star, Clock, Heart, List } from "lucide-react";
import MediaCard from "@/components/media-card";
import type { MediaItem, UserMedia, Shelf, ShelfItem } from "@/lib/types";

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

  // Fetch stats and recent items in parallel
  const [completedRes, inProgressRes, wantRes, listsRes, recentRes, shelvesRes] =
    await Promise.all([
      supabase
        .from("user_media")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "completed"),
      supabase
        .from("user_media")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "in_progress"),
      supabase
        .from("user_media")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "want"),
      supabase
        .from("lists")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_public", true),
      supabase
        .from("user_media")
        .select("*, media_items(*)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("shelves")
        .select("*")
        .eq("user_id", profile.id)
        .eq("is_public", true)
        .order("position"),
    ]);

  const stats = [
    { label: "Completed", value: completedRes.count ?? 0, icon: Star },
    { label: "In Progress", value: inProgressRes.count ?? 0, icon: Clock },
    { label: "Want", value: wantRes.count ?? 0, icon: Heart },
    { label: "Lists", value: listsRes.count ?? 0, icon: List },
  ];

  const recentItems = (recentRes.data as (UserMedia & { media_items: MediaItem })[]) ?? [];
  const shelves = (shelvesRes.data as Shelf[]) ?? [];

  // Fetch shelf items for each shelf
  const shelfItemsMap: Record<string, (ShelfItem & { media_items: MediaItem })[]> = {};
  if (shelves.length > 0) {
    const shelfIds = shelves.map((s) => s.id);
    const { data: allShelfItems } = await supabase
      .from("shelf_items")
      .select("*, media_items(*)")
      .in("shelf_id", shelfIds)
      .order("position")
      .limit(60);

    for (const item of (allShelfItems ?? []) as (ShelfItem & { media_items: MediaItem })[]) {
      if (!shelfItemsMap[item.shelf_id]) shelfItemsMap[item.shelf_id] = [];
      shelfItemsMap[item.shelf_id].push(item);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Profile header */}
      <div className="flex items-start gap-6">
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
            <p className="mt-2 max-w-lg text-sm text-text-secondary">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass flex items-center gap-3 p-4"
          >
            <stat.icon size={18} className="text-text-muted" />
            <div>
              <p className="text-xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recently tracked */}
      {recentItems.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Recently tracked
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {recentItems.map((um) => (
              <MediaCard key={um.id} item={um.media_items} />
            ))}
          </div>
        </section>
      )}

      {/* Shelves */}
      {shelves.map((shelf) => {
        const items = shelfItemsMap[shelf.id] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={shelf.id} className="mt-12">
            <h2 className="mb-1 text-lg font-semibold text-text-primary">
              {shelf.name}
            </h2>
            {shelf.description && (
              <p className="mb-4 text-sm text-text-muted">{shelf.description}</p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {items.map((si) => (
                <MediaCard key={si.id} item={si.media_items} />
              ))}
            </div>
          </section>
        );
      })}

      {recentItems.length === 0 && shelves.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg text-text-secondary">Nothing tracked yet</p>
          <p className="mt-1 text-sm text-text-muted">
            This user hasn&apos;t tracked any media yet.
          </p>
        </div>
      )}
    </div>
  );
}
