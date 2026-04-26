import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Pencil, User } from "lucide-react";
import MediaCard from "@/components/media-card";
import ListSidebarActions from "@/components/lists/list-sidebar-actions";
import { fetchViewerTracking } from "@/lib/viewer-tracking";
import {
  LIST_TYPE_LABELS,
  LIST_VISIBILITY_OPTIONS,
  type List,
  type ListItem,
  type MediaItem,
  type Profile,
} from "@/lib/types";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("lists")
    .select("*, profiles!lists_user_id_fkey(*)")
    .eq("id", id)
    .single();

  if (!list) notFound();

  const typedListBase = list as List & { profiles: Profile };

  let sourceMedia: MediaItem | null = null;
  if (typedListBase.source_media_id) {
    const { data: src } = await supabase
      .from("media_items")
      .select("*")
      .eq("id", typedListBase.source_media_id)
      .single();
    sourceMedia = (src as MediaItem | null) ?? null;
  }

  const typedList = { ...typedListBase, source_media: sourceMedia };

  const { data: items } = await supabase
    .from("list_items")
    .select("*, media_items(*)")
    .eq("list_id", id)
    .order("position");

  const listItems = (items as (ListItem & { media_items: MediaItem })[]) ?? [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewerLiked = false;
  let viewerSaved = false;
  if (user) {
    const [{ data: like }, { data: save }] = await Promise.all([
      supabase
        .from("list_likes")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("list_id", id)
        .maybeSingle(),
      supabase
        .from("list_saves")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("list_id", id)
        .maybeSingle(),
    ]);
    viewerLiked = !!like;
    viewerSaved = !!save;
  }

  const viewerTracking = await fetchViewerTracking(
    supabase,
    user?.id ?? null,
    listItems.map((li) => li.media_items.id)
  );

  const isOwner = !!user && user.id === typedList.user_id;
  const showSourceBlock =
    typedList.list_type === "if_you_liked" || typedList.list_type === "vibe";

  // Backdrop hero — first item with a backdrop wins. Books rarely have
  // them, so for book-only lists we end up with no hero (just a clean
  // header). That's intentional; a stretched cover at landscape ratio
  // looks worse than no image at all.
  const backdropUrl =
    listItems.find((li) => li.media_items.backdrop_url)?.media_items
      .backdrop_url ?? null;

  // Tracking summary — what fraction of the list does the viewer have
  // on any shelf. Counts any user_media row regardless of status.
  const trackedCount = listItems.filter(
    (li) => viewerTracking[li.media_items.id]
  ).length;
  const trackedPercent =
    listItems.length > 0
      ? Math.round((trackedCount / listItems.length) * 100)
      : 0;

  const curator = typedList.profiles;
  const curatorDisplay = curator?.display_name || curator?.username || "—";
  const visibilityLabel =
    typedList.visibility !== "public"
      ? LIST_VISIBILITY_OPTIONS.find(
          (o) => o.value === typedList.visibility
        )?.label.split(" (")[0] ?? "Private"
      : null;

  return (
    <>
      {backdropUrl && (
        <div className="mx-auto w-full max-w-7xl px-4">
          <div className="relative h-96 w-full overflow-hidden md:h-128 lg:h-160">
            <img
              src={backdropUrl}
              alt=""
              aria-hidden
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-background from-20% to-transparent to-65%" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-48 bg-linear-to-r from-background via-(--background)/70 to-transparent md:w-56 lg:w-64" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-48 bg-linear-to-l from-background via-(--background)/70 to-transparent md:w-56 lg:w-64" />

            <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 md:px-12 md:pb-10">
              <div className="mx-auto w-full max-w-6xl">
                <h1 className="text-3xl font-bold text-white drop-shadow-md md:text-5xl">
                  {typedList.title}
                </h1>
                {curator && (
                  <Link
                    href={`/u/${curator.username}`}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-white/80 transition-colors hover:text-white"
                  >
                    {curator.avatar_url ? (
                      <img
                        src={curator.avatar_url}
                        alt={curatorDisplay}
                        className="h-7 w-7 rounded-full border border-white/20 object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10">
                        <User size={14} />
                      </span>
                    )}
                    <span>
                      List created by{" "}
                      <span className="font-medium text-white">
                        {curatorDisplay}
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`mx-auto w-full max-w-6xl px-4 ${
          backdropUrl ? "-mt-4 pb-8" : "py-8"
        } relative`}
      >
        {!backdropUrl && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-text-primary">
              {typedList.title}
            </h1>
            {curator && (
              <Link
                href={`/u/${curator.username}`}
                className="mt-2 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {curator.avatar_url ? (
                  <img
                    src={curator.avatar_url}
                    alt={curatorDisplay}
                    className="h-7 w-7 rounded-full border border-surface-border object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-border bg-surface-overlay text-text-muted">
                    <User size={14} />
                  </span>
                )}
                <span>
                  List created by{" "}
                  <span className="font-medium text-text-primary">
                    {curatorDisplay}
                  </span>
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Sidebar + main content */}
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="w-full shrink-0 space-y-5 md:w-56">
            <ListSidebarActions
              listId={typedList.id}
              isLoggedIn={!!user}
              initialLiked={viewerLiked}
              initialSaved={viewerSaved}
              initialLikeCount={typedList.like_count}
              initialSaveCount={typedList.saves_count}
            />

            {isOwner && (
              <Link
                href={`/lists/${typedList.id}/edit`}
                className="flex items-center justify-center gap-1.5 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
              >
                <Pencil size={14} />
                Edit list
              </Link>
            )}

            {/* Tracking percentage — only show when the viewer has a
                user account; anonymous viewers see nothing here. */}
            {user && listItems.length > 0 && (
              <SidebarSection label="Your shelves">
                <div className="text-2xl font-semibold text-text-primary tabular-nums">
                  {trackedPercent}%
                </div>
                <p className="mt-0.5 text-xs text-text-muted">
                  {trackedCount} of {listItems.length} tracked
                </p>
              </SidebarSection>
            )}

            <SidebarSection label="Type">
              <span className="inline-block rounded-sm bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                {LIST_TYPE_LABELS[typedList.list_type]}
              </span>
            </SidebarSection>

            {typedList.tags.length > 0 && (
              <SidebarSection label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {typedList.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-sm border border-surface-border bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </SidebarSection>
            )}

            {visibilityLabel && (
              <SidebarSection label="Visibility">
                <span className="text-xs text-text-secondary">
                  {visibilityLabel}
                </span>
              </SidebarSection>
            )}
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1">
            {typedList.description && (
              <p className="max-w-2xl whitespace-pre-line text-text-secondary">
                {typedList.description}
              </p>
            )}

            {showSourceBlock && typedList.source_media && (
              <div className="mt-6 flex items-center gap-4 rounded-sm border border-brand/40 bg-brand/5 p-4">
                <div className="aspect-2/3 w-16 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
                  <Link href={`/media/${typedList.source_media.id}`}>
                    {typedList.source_media.cover_image_url && (
                      <img
                        src={typedList.source_media.cover_image_url}
                        alt={typedList.source_media.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </Link>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wider text-brand">
                    {typedList.list_type === "if_you_liked"
                      ? "If you liked"
                      : "Captures the vibe of"}
                  </p>
                  <Link
                    href={`/media/${typedList.source_media.id}`}
                    className="mt-1 block text-lg font-semibold text-text-primary hover:text-brand"
                  >
                    {typedList.source_media.title}
                  </Link>
                </div>
              </div>
            )}

            <div className="mt-8">
              {listItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {listItems.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <MediaCard
                        item={item.media_items}
                        showStats
                        userMedia={viewerTracking[item.media_items.id] ?? null}
                        userRating={
                          viewerTracking[item.media_items.id]?.rating ?? null
                        }
                        userFavorite={
                          viewerTracking[item.media_items.id]?.is_favorite ??
                          false
                        }
                      />
                      {item.reason && (
                        <p className="px-1 text-xs leading-relaxed text-text-muted">
                          {item.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-20 text-center">
                  <p className="text-lg text-text-secondary">
                    This list is empty
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}
