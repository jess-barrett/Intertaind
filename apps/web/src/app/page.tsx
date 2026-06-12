import { createClient } from "@/lib/supabase/server";
import type { MediaItem, List, Profile } from "@/lib/types";
import LandingPage from "@/components/landing-page";
import DiscoveryFeed from "@/components/discovery-feed";
import { fetchViewerTracking } from "@/lib/viewer-tracking";
import { fetchListSourceMediaMap } from "@/lib/list-source-media";

const LIST_PREVIEW_COUNT = 5;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  // Signed in — fetch discovery data
  const displayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.username ||
    "friend";

  const [moviesRes, showsRes, booksRes, gamesRes, listsRes] =
    await Promise.all([
      supabase
        .from("media_items")
        .select("*")
        .eq("media_type", "movie")
        .order("tracking_count", { ascending: false })
        .limit(8),
      supabase
        .from("media_items")
        .select("*")
        .eq("media_type", "tv_show")
        .order("tracking_count", { ascending: false })
        .limit(8),
      supabase
        .from("media_items")
        .select("*")
        .eq("media_type", "book")
        .order("tracking_count", { ascending: false })
        .limit(8),
      supabase
        .from("media_items")
        .select("*")
        .eq("media_type", "video_game")
        .order("tracking_count", { ascending: false })
        .limit(8),
      supabase
        .from("lists")
        .select("*, profiles!lists_user_id_fkey(*)")
        .eq("visibility", "public")
        .order("like_count", { ascending: false })
        .limit(4),
    ]);

  const popularMovies = (moviesRes.data as MediaItem[]) ?? [];
  const popularShows = (showsRes.data as MediaItem[]) ?? [];
  const popularBooks = (booksRes.data as MediaItem[]) ?? [];
  const popularGames = (gamesRes.data as MediaItem[]) ?? [];
  const popularLists =
    (listsRes.data as (List & { profiles: Profile })[]) ?? [];

  // Pull first-N item covers for each surfaced list so the home card
  // matches the layered preview on /lists. Same trick: order by position
  // globally so each list contributes its earliest items, cap to keep
  // the response small.
  const coversByList: Record<string, { src: string | null; title: string }[]> =
    {};
  if (popularLists.length > 0) {
    const listIds = popularLists.map((l) => l.id);
    const { data: items } = await supabase
      .from("list_items")
      .select("list_id, position, media_items(id, title, cover_image_url)")
      .in("list_id", listIds)
      .order("position", { ascending: true })
      .limit(popularLists.length * LIST_PREVIEW_COUNT * 2);

    type ItemRow = {
      list_id: string;
      position: number;
      media_items: { id: string; title: string; cover_image_url: string | null };
    };
    for (const row of (items as ItemRow[] | null) ?? []) {
      const arr = coversByList[row.list_id] ?? [];
      if (arr.length >= LIST_PREVIEW_COUNT) continue;
      arr.push({
        src: row.media_items.cover_image_url,
        title: row.media_items.title,
      });
      coversByList[row.list_id] = arr;
    }
  }

  // Fetch the viewer's tracking rows for all popular items in one round-trip
  // so the MediaCard hover slideout and three-dots popup reflect the viewer's
  // own state (watched/loved/rated, current_page/season/episode for in-
  // progress items).
  const allIds = [
    ...popularMovies.map((i) => i.id),
    ...popularShows.map((i) => i.id),
    ...popularBooks.map((i) => i.id),
    ...popularGames.map((i) => i.id),
  ];
  const viewerTracking = await fetchViewerTracking(supabase, user.id, allIds);

  const sourceMediaByList = await fetchListSourceMediaMap(supabase, popularLists);

  return (
    <DiscoveryFeed
      displayName={displayName}
      popularMovies={popularMovies}
      popularShows={popularShows}
      popularBooks={popularBooks}
      popularGames={popularGames}
      popularLists={popularLists}
      coversByList={coversByList}
      sourceMediaByList={sourceMediaByList}
      viewerTracking={viewerTracking}
    />
  );
}
