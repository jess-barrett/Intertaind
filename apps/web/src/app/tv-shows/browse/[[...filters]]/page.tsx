import { redirect } from "next/navigation";
import { Tv } from "lucide-react";
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
  TV_STATUSES,
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
  const parsed = parsePath(filters, "tv_show");
  const { title, description } = getFiltersDescription("tv_show", parsed);
  return { title: `${title} — Intertaind`, description };
}

export default async function TVShowsBrowsePage({
  params,
}: {
  params: Promise<{ filters?: string[] }>;
}) {
  const { filters: segments } = await params;
  const filters = parsePath(segments, "tv_show");

  const canonicalPath = filtersToPath("tv_show", filters);
  const actualPath =
    "/tv-shows/browse" + (segments && segments.length ? "/" + segments.join("/") : "");
  if (canonicalPath !== actualPath && canonicalPath !== "/tv-shows/browse") {
    redirect(canonicalPath);
  }

  const supabase = await createClient();

  let query = supabase
    .from("media_items")
    .select("*", { count: "exact" })
    .eq("media_type", "tv_show");
  query = applyMediaFilters(query, filters, "tv_show");
  query = applyMediaSort(query, filters.sort, "tv_show");
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

  const { title } = getFiltersDescription("tv_show", filters);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Tv size={22} className="text-accent-tv" />
        <h1 className="text-3xl font-bold text-text-primary">{title}</h1>
      </div>

      <MediaFilterBar
        mediaType="tv_show"
        mode="inplace"
        currentFilters={filters}
        genres={GENRES_BY_TYPE.tv_show}
        sortOptions={getSortOptionsForType("tv_show")}
        statuses={TV_STATUSES}
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
          <Tv size={32} className="mb-3 text-accent-tv opacity-40" />
          <p className="text-lg text-text-secondary">
            No shows match these filters
          </p>
        </div>
      )}
    </div>
  );
}
