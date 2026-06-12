import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";
import MediaCard from "@/components/media-card";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import {
  applyMediaFilters,
  applyMediaSort,
  getSortOptionsForType,
  GENRES_BY_TYPE,
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
  const parsed = parsePath(filters, "book");
  const { title, description } = getFiltersDescription("book", parsed);
  return { title: `${title} — Intertaind`, description };
}

export default async function BooksBrowsePage({
  params,
}: {
  params: Promise<{ filters?: string[] }>;
}) {
  const { filters: segments } = await params;
  const filters = parsePath(segments, "book");

  const canonicalPath = filtersToPath("book", filters);
  const actualPath =
    "/books/browse" + (segments && segments.length ? "/" + segments.join("/") : "");
  if (canonicalPath !== actualPath && canonicalPath !== "/books/browse") {
    redirect(canonicalPath);
  }

  const supabase = await createClient();

  let query = supabase
    .from("media_items")
    .select("*", { count: "exact" })
    .eq("media_type", "book");
  query = applyMediaFilters(query, filters, "book");
  query = applyMediaSort(query, filters.sort, "book");
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

  const { title } = getFiltersDescription("book", filters);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <BookOpen size={22} className="text-accent-book" />
        <h1 className="text-3xl font-bold text-text-primary">{title}</h1>
      </div>

      <MediaFilterBar
        mediaType="book"
        mode="inplace"
        currentFilters={filters}
        genres={GENRES_BY_TYPE.book}
        sortOptions={getSortOptionsForType("book")}
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
          <BookOpen size={32} className="mb-3 text-accent-book opacity-40" />
          <p className="text-lg text-text-secondary">
            No books match these filters
          </p>
        </div>
      )}
    </div>
  );
}
