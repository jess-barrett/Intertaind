import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Film, ArrowLeft } from "lucide-react";
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
} from "@/lib/media-query";

const TABS = [
  { key: "watched", label: "Watched", status: "completed" as TrackingStatus },
  { key: "watchlist", label: "Watchlist", status: "want" as TrackingStatus },
];

export default async function MoviesShelfPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    tab?: string;
    decade?: string;
    genre?: string;
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
    .eq("media_items.media_type", "movie")
    .eq("status", activeTab.status);
  query = applyMediaFilters(query, filters, "movie", "media_items.");
  query = applyMediaSort(query, filters.sort, "movie", "media_items");
  const { data } = await query;

  const tracked =
    (data as (UserMedia & { media_items: MediaItem })[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center gap-4">
        <Link
          href={`/u/${username}`}
          className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
          Profile
        </Link>
        <div className="flex items-center gap-2">
          <Film size={20} className="text-accent-movie" />
          <h1 className="text-2xl font-bold text-text-primary">
            {profile.display_name || profile.username}&apos;s Movies
          </h1>
        </div>
        <span className="ml-auto text-sm text-text-muted">
          {tracked.length} {activeTab.label.toLowerCase()}
        </span>
      </div>

      {isOwner && (
        <div className="mb-6">
          <ShelfSearch mediaType="movie" />
        </div>
      )}

      <ShelfTabs tabs={TABS} activeTab={activeTab.key} />

      <MediaFilterBar
        genres={GENRES_BY_TYPE.movie}
        sortOptions={getSortOptionsForType("movie")}
      />

      {tracked.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tracked.map((um) => (
            <MediaCard
              key={um.media_items.id}
              item={um.media_items}
              userRating={um.rating}
              userFavorite={um.is_favorite}
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
          <Film size={32} className="mb-3 text-accent-movie opacity-40" />
          <p className="text-lg text-text-secondary">
            No movies in {activeTab.label.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {isOwner
              ? "Search for movies above to add them to your collection."
              : "Nothing here yet."}
          </p>
        </div>
      )}
    </div>
  );
}
