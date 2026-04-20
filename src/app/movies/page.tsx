import Link from "next/link";
import { Film, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import PopularCarousel from "@/components/popular-carousel";
import {
  getSortOptionsForType,
  GENRES_BY_TYPE,
} from "@/lib/media-query";

export const metadata = {
  title: "Popular Movies — Intertaind",
  description:
    "Discover what's popular this week in movies on Intertaind. Track what you watch, rate it, and find cross-media recommendations.",
};

export default async function MoviesLandingPage() {
  const supabase = await createClient();

  const { data: popular } = await supabase
    .from("media_items")
    .select("*")
    .eq("media_type", "movie")
    .order("tracking_count", { ascending: false, nullsFirst: false })
    .limit(20);

  const items = (popular as MediaItem[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Film size={22} className="text-accent-movie" />
        <h1 className="text-3xl font-bold text-text-primary">Movies</h1>
      </div>

      <MediaFilterBar
        mediaType="movie"
        mode="redirect"
        currentFilters={{ sort: "popular_week" }}
        genres={GENRES_BY_TYPE.movie}
        sortOptions={getSortOptionsForType("movie")}
      />

      <PopularCarousel items={items} title="Popular Films This Week" />

      <div className="mt-6 flex justify-center">
        <Link
          href="/movies/browse"
          className="flex items-center gap-2 rounded-lg border border-surface-border px-5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          Browse all movies
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
