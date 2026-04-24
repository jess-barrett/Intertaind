import { createClient } from "@/lib/supabase/server";
import type { MediaItem, List, Profile } from "@/lib/types";
import LandingPage from "@/components/landing-page";
import DiscoveryFeed from "@/components/discovery-feed";
import { fetchViewerTracking } from "@/lib/viewer-tracking";

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
        .select("*, profiles(*)")
        .eq("is_public", true)
        .order("like_count", { ascending: false })
        .limit(3),
    ]);

  const popularMovies = (moviesRes.data as MediaItem[]) ?? [];
  const popularShows = (showsRes.data as MediaItem[]) ?? [];
  const popularBooks = (booksRes.data as MediaItem[]) ?? [];
  const popularGames = (gamesRes.data as MediaItem[]) ?? [];

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

  return (
    <DiscoveryFeed
      displayName={displayName}
      popularMovies={popularMovies}
      popularShows={popularShows}
      popularBooks={popularBooks}
      popularGames={popularGames}
      popularLists={
        (listsRes.data as (List & { profiles: Profile })[]) ?? []
      }
      viewerTracking={viewerTracking}
    />
  );
}
