import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Gamepad2 } from "lucide-react";
import type { MediaItem, UserMedia } from "@/lib/types";
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
  GAME_PLATFORMS,
} from "@/lib/media-query";

interface GameTab {
  key: string;
  label: string;
  // status filter (used for "wishlist" tab) — exclusive with subStatus
  status?: string;
  // sub_status JSONB filter (within progress field)
  subStatus?: string;
  // for "Played" tab: include everything except the wishlist (status != "want")
  excludeStatus?: string;
}

const TABS: GameTab[] = [
  { key: "played", label: "Played", excludeStatus: "want" },
  { key: "playing", label: "Playing", subStatus: "playing" },
  { key: "completed", label: "Completed", subStatus: "completed" },
  { key: "wishlist", label: "Wishlist", status: "want" },
  { key: "shelved", label: "Shelved", subStatus: "shelved" },
  { key: "retired", label: "Retired", subStatus: "retired" },
  { key: "abandoned", label: "Abandoned", subStatus: "abandoned" },
];

export default async function GamesShelfPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    tab?: string;
    decade?: string;
    genre?: string;
    platform?: string;
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
    .eq("media_items.media_type", "video_game");

  if (activeTab.status) {
    query = query.eq("status", activeTab.status);
  }
  if (activeTab.subStatus) {
    // JSONB filter: progress->>sub_status equals the value
    query = query.eq("progress->>sub_status", activeTab.subStatus);
  }
  if (activeTab.excludeStatus) {
    query = query.neq("status", activeTab.excludeStatus);
  }

  query = applyMediaFilters(query, filters, "video_game", "media_items.");
  query = applyMediaSort(query, filters.sort, "video_game", "media_items");
  const { data } = await query;

  const tracked =
    (data as (UserMedia & { media_items: MediaItem })[]) ?? [];

  return (
    <div className="pt-8">
      {isOwner && (
        <div className="mb-6">
          <ShelfSearch mediaType="video_game" />
        </div>
      )}

      <ShelfTabs tabs={TABS} activeTab={activeTab.key} />

      <MediaFilterBar
        genres={GENRES_BY_TYPE.video_game}
        sortOptions={getSortOptionsForType("video_game")}
        platforms={GAME_PLATFORMS}
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
          <Gamepad2 size={32} className="mb-3 text-accent-game opacity-40" />
          <p className="text-lg text-text-secondary">
            No games in {activeTab.label.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {isOwner
              ? "Search for games above to add them to your collection."
              : "Nothing here yet."}
          </p>
        </div>
      )}
    </div>
  );
}
