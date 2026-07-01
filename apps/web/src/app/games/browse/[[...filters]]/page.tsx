import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@intertaind/types";
import MediaCard from "@/components/media-card";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import {
  applyMediaFilters,
  applyMediaSort,
  getSortOptionsForType,
  GENRES_BY_TYPE,
  GAME_PLATFORMS,
} from "@/lib/media-query";
import { fetchViewerTracking } from "@/lib/viewer-tracking";
import { parsePath, filtersToPath, getFiltersDescription } from "@/lib/filter-path";

const PAGE_SIZE = 48;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ filters?: string[] }>;
}): Promise<Metadata> {
  const { filters } = await params;
  const parsed = parsePath(filters, "video_game");
  const { title, description } = getFiltersDescription("video_game", parsed);
  return { title: `${title} — Intertaind`, description };
}

export default async function GamesBrowsePage({
  params,
}: {
  params: Promise<{ filters?: string[] }>;
}) {
  const { filters: segments } = await params;
  const filters = parsePath(segments, "video_game");

  const canonicalPath = filtersToPath("video_game", filters);
  const actualPath =
    "/games/browse" + (segments && segments.length ? "/" + segments.join("/") : "");
  if (canonicalPath !== actualPath && canonicalPath !== "/games/browse") {
    redirect(canonicalPath);
  }

  const supabase = await createClient();

  let query = supabase
    .from("media_items")
    .select("*", { count: "exact" })
    .eq("media_type", "video_game");
  query = applyMediaFilters(query, filters, "video_game");
  query = applyMediaSort(query, filters.sort, "video_game");
  query = query.limit(PAGE_SIZE);

  const { data, count } = await query;
  const items = (data as MediaItem[]) ?? [];
  const totalCount = count ?? 0;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerTracking = await fetchViewerTracking(
    supabase,
    user?.id ?? null,
    items.map((i) => i.id)
  );

  const { title } = getFiltersDescription("video_game", filters);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Gamepad2 size={22} className="text-accent-game" />
        <h1 className="text-3xl font-bold text-text-primary">{title}</h1>
      </div>

      <MediaFilterBar
        mediaType="video_game"
        mode="inplace"
        currentFilters={filters}
        genres={GENRES_BY_TYPE.video_game}
        sortOptions={getSortOptionsForType("video_game")}
        platforms={GAME_PLATFORMS}
      />

      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm text-text-muted">
          {totalCount.toLocaleString()} results
        </span>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {items.map((item) => {
            const um = viewerTracking[item.id];
            return (
              <MediaCard
                key={item.id}
                item={item}
                showStats
                userMedia={um ?? null}
                userRating={um?.rating ?? null}
                userFavorite={um?.is_favorite ?? false}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-center">
          <Gamepad2 size={32} className="mb-3 text-accent-game opacity-40" />
          <p className="text-lg text-text-secondary">
            No games match these filters
          </p>
        </div>
      )}
    </div>
  );
}
