import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/types";
import MediaFilterBar from "@/components/shelves/media-filter-bar";
import PopularCarousel from "@/components/popular-carousel";
import BackButton from "@/components/back-button";
import {
  getSortOptionsForType,
  GENRES_BY_TYPE,
} from "@/lib/media-query";

export const metadata = {
  title: "Popular Books — Intertaind",
  description:
    "Discover what's popular this week in books on Intertaind. Track what you read, rate it, and find cross-media recommendations.",
};

export default async function BooksLandingPage() {
  const supabase = await createClient();

  const { data: popular } = await supabase
    .from("media_items")
    .select("*")
    .eq("media_type", "book")
    .order("tracking_count", { ascending: false, nullsFirst: false })
    .limit(20);

  const items = (popular as MediaItem[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>
      <div className="mb-6 flex items-center gap-2">
        <BookOpen size={22} className="text-accent-book" />
        <h1 className="text-3xl font-bold text-text-primary">Books</h1>
      </div>

      <MediaFilterBar
        mediaType="book"
        mode="redirect"
        currentFilters={{ sort: "popular_week" }}
        genres={GENRES_BY_TYPE.book}
        sortOptions={getSortOptionsForType("book")}
      />

      <PopularCarousel items={items} title="Popular Books This Week" />

      <div className="mt-6 flex justify-center">
        <Link
          href="/books/browse"
          className="flex items-center gap-2 rounded-lg border border-surface-border px-5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          Browse all books
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
