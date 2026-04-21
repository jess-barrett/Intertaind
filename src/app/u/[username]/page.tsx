import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Users } from "lucide-react";
import type { MediaItem, MediaType, ShelfItem } from "@/lib/types";
import { TOP_5_SHELF_NAMES } from "@/lib/types";
import TopFiveGrid from "@/components/top-five-grid";

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

  return (
    <>
      <section className="mt-8">
        <TopFiveGrid topFives={topFives} username={username} isOwner={isOwner} />
      </section>

      <hr className="my-10 border-surface-border" />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Recent Activity
        </h2>
        <div className="flex flex-col items-center py-12 text-center">
          <Users size={24} className="mb-3 text-text-muted" />
          <p className="text-sm text-text-muted">
            Activity feed coming soon
          </p>
        </div>
      </section>
    </>
  );
}
