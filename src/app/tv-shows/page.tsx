import Link from "next/link";
import { Tv, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import PopularCarousel from "@/components/popular-carousel";
import BackButton from "@/components/back-button";
import {
  getSortOptionsForType,
  GENRES_BY_TYPE,
  TV_STATUSES,
} from "@/lib/media-query";

export const metadata = {
  title: "Popular TV Shows — Intertaind",
  description:
    "Discover what's popular this week in TV on Intertaind. Track what you watch, rate it, and find cross-media recommendations.",
};

export default async function TVShowsLandingPage() {
  const supabase = await createClient();

  const { data: popular } = await supabase
    .from("media_items")
    .select("*")
    .eq("media_type", "tv_show")
    .order("tracking_count", { ascending: false, nullsFirst: false })
    .limit(20);

  const items = (popular as MediaItem[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>
      <div className="mb-6 flex items-center gap-2">
        <Tv size={22} className="text-accent-tv" />
        <h1 className="text-3xl font-bold text-text-primary">TV Shows</h1>
      </div>

      <MediaFilterBar
        mediaType="tv_show"
        mode="redirect"
        currentFilters={{ sort: "popular_week" }}
        genres={GENRES_BY_TYPE.tv_show}
        sortOptions={getSortOptionsForType("tv_show")}
        statuses={TV_STATUSES}
      />

      <PopularCarousel items={items} title="Popular Shows This Week" />

      <div className="mt-6 flex justify-center">
        <Link
          href="/tv-shows/browse"
          className="flex items-center gap-2 rounded-lg border border-surface-border px-5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          Browse all shows
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
