import { createClient } from "@/lib/supabase/server";
import type { MediaItem, List, Profile } from "@/lib/types";
import LandingPage from "@/components/landing-page";
import DiscoveryFeed from "@/components/discovery-feed";

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

  return (
    <DiscoveryFeed
      displayName={displayName}
      popularMovies={(moviesRes.data as MediaItem[]) ?? []}
      popularShows={(showsRes.data as MediaItem[]) ?? []}
      popularBooks={(booksRes.data as MediaItem[]) ?? []}
      popularGames={(gamesRes.data as MediaItem[]) ?? []}
      popularLists={
        (listsRes.data as (List & { profiles: Profile })[]) ?? []
      }
    />
  );
}
