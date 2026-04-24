import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tv } from "lucide-react";
import type { MediaItem, TrackingStatus, UserMedia } from "@/lib/types";
import MediaCard from "@/components/media-card";
import TVProgressHeader from "@/components/tv-progress-header";
import ShelfSearch from "@/components/shelves/shelf-search";
import ShelfTabs from "@/components/shelves/shelf-tabs";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import {
  applyMediaFilters,
  sortTrackedMedia,
  getSortOptionsForType,
  parseFilters,
  GENRES_BY_TYPE,
  TV_STATUSES,
} from "@/lib/media-query";

const TABS = [
  { key: "watched", label: "Watched", status: "completed" as TrackingStatus },
  { key: "watching", label: "Currently Watching", status: "in_progress" as TrackingStatus },
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
  const { data } = await query;

  const tracked = sortTrackedMedia(
    (data as (UserMedia & { media_items: MediaItem })[]) ?? [],
    filters.sort,
    "tv_show"
  );

  const viewerTracking = new Map<string, UserMedia>();
  if (!isOwner && user && tracked.length > 0) {
    const mediaIds = tracked.map((t) => t.media_items.id);
    const { data: vm } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .in("media_id", mediaIds);
    for (const row of (vm as UserMedia[]) ?? []) {
      viewerTracking.set(row.media_id, row);
    }
  }

  return (
    <div className="pt-8">
      <ShelfTabs
        tabs={TABS}
        activeTab={activeTab.key}
        rightSlot={isOwner ? <ShelfSearch mediaType="tv_show" /> : null}
      />

      <MediaFilterBar
        genres={GENRES_BY_TYPE.tv_show}
        sortOptions={getSortOptionsForType("tv_show")}
        statuses={TV_STATUSES}
      />

      {tracked.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tracked.map((um) => {
            const isWatchingTab = activeTab.key === "watching";
            const meta = um.media_items.metadata as
              | Record<string, unknown>
              | null;
            const totalSeasons =
              (meta?.number_of_seasons as number | undefined) ??
              (meta?.seasons as number | undefined) ??
              1;
            const seasonEps =
              (meta?.season_episodes as Record<string, number> | undefined) ??
              null;
            return (
              <MediaCard
                key={um.media_items.id}
                item={um.media_items}
                userRating={um.rating}
                userFavorite={um.is_favorite}
                userMedia={
                  isOwner ? um : viewerTracking.get(um.media_items.id) ?? null
                }
                customCoverUrl={
                  (um.progress as Record<string, unknown> | null)
                    ?.custom_cover_url as string | undefined
                }
                topSlot={
                  isWatchingTab ? (
                    <TVProgressHeader
                      userMedia={um}
                      mediaId={um.media_items.id}
                      title={um.media_items.title}
                      totalSeasons={totalSeasons}
                      seasonEpisodes={seasonEps}
                      editable={isOwner}
                    />
                  ) : undefined
                }
              />
            );
          })}
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
