import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tv } from "lucide-react";
import type { MediaItem, TrackingStatus, UserMedia } from "@/lib/types";
import MediaCard from "@/components/media-card";
import ShelfSearch from "@/components/shelves/shelf-search";
import ShelfTabs from "@/components/shelves/shelf-tabs";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import {
  applyMediaFilters,
  applyMediaSort,
  getSortOptionsForType,
  parseFilters,
  GENRES_BY_TYPE,
  TV_STATUSES,
} from "@/lib/media-query";

const TABS = [
  { key: "watching", label: "Currently Watching", status: "in_progress" as TrackingStatus },
  { key: "watched", label: "Watched", status: "completed" as TrackingStatus },
  { key: "watchlist", label: "Watchlist", status: "want" as TrackingStatus },
];

export default async function TVShowsShelfPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    tab?: string;
    decade?: string;
    genre?: string;
    status?: string;
    sort?: string;
  }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const activeTab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const filters = parseFilters(sp);

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

  let query = supabase
    .from("user_media")
    .select("*, media_items!inner(*)")
    .eq("user_id", profile.id)
    .eq("media_items.media_type", "tv_show")
    .eq("status", activeTab.status);
  query = applyMediaFilters(query, filters, "tv_show", "media_items.");
  query = applyMediaSort(query, filters.sort, "tv_show", "media_items");
  const { data } = await query;

  const tracked =
    (data as (UserMedia & { media_items: MediaItem })[]) ?? [];

  return (
    <div className="pt-8">
      {isOwner && (
        <div className="mb-6">
          <ShelfSearch mediaType="tv_show" />
        </div>
      )}

      <ShelfTabs tabs={TABS} activeTab={activeTab.key} />

      <MediaFilterBar
        genres={GENRES_BY_TYPE.tv_show}
        sortOptions={getSortOptionsForType("tv_show")}
        statuses={TV_STATUSES}
      />

      {tracked.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tracked.map((um) => (
            <MediaCard
              key={um.media_items.id}
              item={um.media_items}
              userRating={um.rating}
              userFavorite={um.is_favorite}
              userMedia={um}
              customCoverUrl={
                (um.progress as Record<string, unknown> | null)?.custom_cover_url as
                  | string
                  | undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <Tv size={32} className="mb-3 text-accent-tv opacity-40" />
          <p className="text-lg text-text-secondary">
            No shows in {activeTab.label.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {isOwner
              ? "Search for shows above to add them to your collection."
              : "Nothing here yet."}
          </p>
        </div>
      )}
    </div>
  );
}
