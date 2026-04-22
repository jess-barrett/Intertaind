import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem, MediaType, ShelfItem } from "@/lib/types";
import { TOP_5_SHELF_NAMES } from "@/lib/types";
import TopFiveGrid from "@/components/top-five-grid";
import ActivityItem from "@/components/activity/activity-item";
import { listUserActivity, listUserRecentReviews } from "@/app/actions/activity";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const { data: shelves } = await supabase
    .from("shelves")
    .select("id, name")
    .eq("user_id", profile.id)
    .in("name", Object.values(TOP_5_SHELF_NAMES));

  const topFives: Record<MediaType, MediaItem[]> = {
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
      for (const [type, name] of Object.entries(TOP_5_SHELF_NAMES)) {
        if (shelf.name === name) shelfIdToType[shelf.id] = type as MediaType;
      }
    }

    for (const item of (allItems ?? []) as (ShelfItem & { media_items: MediaItem })[]) {
      const type = shelfIdToType[item.shelf_id];
      if (type && topFives[type].length < 5) {
        topFives[type].push(item.media_items);
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

  return (
    <>
      <section className="mt-8">
        <TopFiveGrid topFives={topFives} username={username} isOwner={isOwner} />
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
