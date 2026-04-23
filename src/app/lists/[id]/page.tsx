import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Heart, User } from "lucide-react";
import MediaCard from "@/components/media-card";
import { fetchViewerTracking } from "@/lib/viewer-tracking";
import type { List, ListItem, MediaItem, Profile } from "@/lib/types";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch list with author profile
  const { data: list } = await supabase
    .from("lists")
    .select("*, profiles(*)")
    .eq("id", id)
    .single();

  if (!list) notFound();

  const typedList = list as List & { profiles: Profile };

  // Fetch list items ordered by position
  const { data: items } = await supabase
    .from("list_items")
    .select("*, media_items(*)")
    .eq("list_id", id)
    .order("position");

  const listItems = (items as (ListItem & { media_items: MediaItem })[]) ?? [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerTracking = await fetchViewerTracking(
    supabase,
    user?.id ?? null,
    listItems.map((li) => li.media_items.id)
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* List header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary">
          {typedList.title}
        </h1>
        {typedList.description && (
          <p className="mt-3 max-w-2xl text-text-secondary">
            {typedList.description}
          </p>
        )}
        <div className="mt-4 flex items-center gap-4 text-sm text-text-muted">
          {typedList.profiles && (
            <Link
              href={`/u/${typedList.profiles.username}`}
              className="flex items-center gap-1.5 transition-colors hover:text-text-secondary"
            >
              <User size={14} />
              {typedList.profiles.display_name || typedList.profiles.username}
            </Link>
          )}
          <span className="flex items-center gap-1">
            <Heart size={14} />
            {typedList.like_count} likes
          </span>
          <span>{listItems.length} items</span>
        </div>
      </div>

      {/* List items */}
      {listItems.length > 0 ? (
        <div className="space-y-4">
          {listItems.map((item, index) => (
            <div
              key={item.id}
              className="glass flex gap-4 p-4"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-sm font-bold text-text-muted">
                {index + 1}
              </span>

              <div className="w-16 shrink-0">
                <MediaCard
                  item={item.media_items}
                  userMedia={viewerTracking[item.media_items.id] ?? null}
                  userRating={
                    viewerTracking[item.media_items.id]?.rating ?? null
                  }
                  userFavorite={
                    viewerTracking[item.media_items.id]?.is_favorite ?? false
                  }
                />
              </div>

              <div className="flex-1 min-w-0 pt-1">
                <h3 className="font-medium text-text-primary">
                  {item.media_items.title}
                </h3>
                {item.note && (
                  <p className="mt-1 text-sm text-text-secondary">
                    {item.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg text-text-secondary">This list is empty</p>
        </div>
      )}
    </div>
  );
}
