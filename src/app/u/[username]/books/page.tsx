import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookOpen } from "lucide-react";
import type { MediaItem, TrackingStatus, UserMedia } from "@/lib/types";
import MediaCard from "@/components/media-card";
import BookProgressHeader from "@/components/book-progress-header";
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
  { key: "read", label: "Read", status: "completed" as TrackingStatus },
  { key: "reading", label: "Reading", status: "in_progress" as TrackingStatus },
  { key: "tbr", label: "TBR", status: "want" as TrackingStatus },
  { key: "dnf", label: "DNF", status: "dropped" as TrackingStatus },
];

export default async function BooksShelfPage({
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
    .eq("media_items.media_type", "book")
    .eq("status", activeTab.status);
  query = applyMediaFilters(query, filters, "book", "media_items.");
  query = applyMediaSort(query, filters.sort, "book", "media_items");
  const { data } = await query;

  const tracked =
    (data as (UserMedia & { media_items: MediaItem })[]) ?? [];

  // When viewing someone else's shelves, fetch the viewer's own tracking
  // rows for the same media so the hover action bar reflects the viewer's
  // state instead of the profile owner's.
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
      {isOwner && (
        <div className="mb-6">
          <ShelfSearch mediaType="book" />
        </div>
      )}

      <ShelfTabs tabs={TABS} activeTab={activeTab.key} />

      <MediaFilterBar
        genres={GENRES_BY_TYPE.book}
        sortOptions={getSortOptionsForType("book")}
      />

      {tracked.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tracked.map((um) => {
            const progress =
              (um.progress as Record<string, unknown> | null) ?? {};
            const isReadingTab = activeTab.key === "reading";
            const totalPages =
              (um.media_items.metadata?.page_count as number | undefined) ??
              null;
            const currentPage =
              (progress.current_page as number | undefined) ?? 0;

            return (
              <MediaCard
                key={um.media_items.id}
                item={um.media_items}
                userRating={um.rating}
                userFavorite={um.is_favorite}
                userMedia={
                  isOwner ? um : viewerTracking.get(um.media_items.id) ?? null
                }
                customCoverUrl={progress.custom_cover_url as string | undefined}
                topSlot={
                  isReadingTab ? (
                    <BookProgressHeader
                      userMediaId={um.id}
                      mediaId={um.media_items.id}
                      title={um.media_items.title}
                      startedAt={um.started_at}
                      currentPage={currentPage}
                      totalPages={totalPages}
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
          <BookOpen size={32} className="mb-3 text-accent-book opacity-40" />
          <p className="text-lg text-text-secondary">
            No books in {activeTab.label.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {isOwner
              ? "Search for books above to add them to your collection."
              : "Nothing here yet."}
          </p>
        </div>
      )}
    </div>
  );
}
