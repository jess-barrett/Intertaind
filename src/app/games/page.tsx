import Link from "next/link";
import { Gamepad2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import PopularCarousel from "@/components/popular-carousel";
import {
  getSortOptionsForType,
  GENRES_BY_TYPE,
  GAME_PLATFORMS,
} from "@/lib/media-query";

export const metadata = {
  title: "Popular Games — Intertaind",
  description:
    "Discover what's popular this week in games on Intertaind. Track what you play, rate it, and find cross-media recommendations.",
};

export default async function GamesLandingPage() {
  const supabase = await createClient();

  const { data: popular } = await supabase
    .from("media_items")
    .select("*")
    .eq("media_type", "video_game")
    .order("tracking_count", { ascending: false, nullsFirst: false })
    .limit(20);

  const items = (popular as MediaItem[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Gamepad2 size={22} className="text-accent-game" />
        <h1 className="text-3xl font-bold text-text-primary">Games</h1>
      </div>

      <MediaFilterBar
        mediaType="video_game"
        mode="redirect"
        currentFilters={{ sort: "popular_week" }}
        genres={GENRES_BY_TYPE.video_game}
        sortOptions={getSortOptionsForType("video_game")}
        platforms={GAME_PLATFORMS}
      />

      <PopularCarousel items={items} title="Popular Games This Week" />

      <div className="mt-6 flex justify-center">
        <Link
          href="/games/browse"
          className="flex items-center gap-2 rounded-lg border border-surface-border px-5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          Browse all games
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
