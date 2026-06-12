import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem, MediaType, ShelfItem } from "@intertaind/types";
import { TOP_4_SHELF_NAMES } from "@intertaind/types";
import TopFourGrid from "@/components/top-four-grid";
import ActivityItem from "@/components/activity/activity-item";
import { listUserActivity, listUserRecentReviews } from "@/app/actions/activity";
import { fetchViewerTracking } from "@/lib/viewer-tracking";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const displayName =
    profile.display_name && profile.display_name.trim().length > 0
      ? profile.display_name
      : username;

  const { data: shelves } = await supabase
    .from("shelves")
    .select("id, name")
    .eq("user_id", profile.id)
    .in("name", Object.values(TOP_4_SHELF_NAMES));

  const topFours: Record<MediaType, MediaItem[]> = {
    movie: [],
    tv_show: [],
    book: [],
    video_game: [],
  };

  if (shelves && shelves.length > 0) {
    const shelfIds = shelves.map((s) => s.id);
    const { data: allItems } = await supabase
      .from("shelf_items")
      .select("*, media_items(*)")
      .in("shelf_id", shelfIds)
      .order("position")
      .limit(20);

    const shelfIdToType: Record<string, MediaType> = {};
    for (const shelf of shelves) {
      for (const [type, name] of Object.entries(TOP_4_SHELF_NAMES)) {
        if (shelf.name === name) shelfIdToType[shelf.id] = type as MediaType;
      }
    }

    for (const item of (allItems ?? []) as (ShelfItem & { media_items: MediaItem })[]) {
      const type = shelfIdToType[item.shelf_id];
      if (type && topFours[type].length < 4) {
        topFours[type].push(item.media_items);
      }
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  const [recentActivity, recentReviews] = await Promise.all([
    listUserActivity(profile.id, 3, 0),
    listUserRecentReviews(profile.id, 3),
  ]);

  // Viewer's own tracking for the Top 4 covers — so hovering a favorite on
  // someone else's profile reflects the viewer's own state. Skip for
  // owners since their overview hides the slideout.
  const topFourMediaIds = Object.values(topFours)
    .flat()
    .map((m) => m.id);
  const viewerTracking = !isOwner
    ? await fetchViewerTracking(supabase, user?.id ?? null, topFourMediaIds)
    : undefined;

  // Owner's per-item custom covers — so a profile owner's chosen cover
  // shows on their Top 4 to ANYONE viewing the page, not just to them.
  // The cover override lives on user_media.progress.custom_cover_url
  // and is per-user; here we read the OWNER's rows specifically.
  const ownerCustomCovers: Record<string, string> = {};
  if (topFourMediaIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from("user_media")
      .select("media_id, progress")
      .eq("user_id", profile.id)
      .in("media_id", topFourMediaIds);
    for (const row of (ownerRows as
      | { media_id: string; progress: Record<string, unknown> | null }[]
      | null) ?? []) {
      const url = row.progress?.custom_cover_url;
      if (typeof url === "string") ownerCustomCovers[row.media_id] = url;
    }
  }

  return (
    <>
      <section className="mt-8">
        <TopFourGrid
          topFours={topFours}
          displayName={displayName}
          isOwner={isOwner}
          viewerTracking={viewerTracking}
          ownerCustomCovers={ownerCustomCovers}
        />
      </section>

      <hr className="my-10 border-surface-border" />

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Activity
          </h2>
          {recentActivity.length > 0 && (
            <Link
              href={`/u/${username}/activity`}
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              See all &rarr;
            </Link>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            No activity yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentActivity.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </div>
        )}
      </section>

      <hr className="my-10 border-surface-border" />

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Reviews
          </h2>
          {recentReviews.length > 0 && (
            <Link
              href={`/u/${username}/reviews`}
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              See all &rarr;
            </Link>
          )}
        </div>
        {recentReviews.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            No reviews yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentReviews.map((r) => (
              <ActivityItem key={r.id} activity={r} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
