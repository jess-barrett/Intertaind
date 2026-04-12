import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MediaType, SearchResult } from "@/lib/types";
import { searchMovies, searchTVShows } from "@/lib/api/tmdb";
import { searchBooks } from "@/lib/api/google-books";
import { searchGames } from "@/lib/api/igdb";
import {
  normalizeTMDBMovie,
  normalizeTMDBTV,
  normalizeGoogleBook,
  normalizeIGDBGame,
} from "@/lib/api/normalize";

type SearchFn = (query: string) => Promise<SearchResult[]>;

const searchers: Record<MediaType, SearchFn> = {
  movie: async (q) => {
    const res = await searchMovies(q);
    return res.results.slice(0, 20).map(normalizeTMDBMovie);
  },
  tv_show: async (q) => {
    const res = await searchTVShows(q);
    return res.results.slice(0, 20).map(normalizeTMDBTV);
  },
  book: async (q) => {
    const res = await searchBooks(q);
    return (res.items ?? []).map(normalizeGoogleBook);
  },
  video_game: async (q) => {
    const results = await searchGames(q);
    return results.map(normalizeIGDBGame);
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim();
  const type = searchParams.get("type") as MediaType | "all" | null;

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    let results: SearchResult[];

    if (type && type !== "all" && type in searchers) {
      results = await searchers[type as MediaType](query);
    } else {
      // Search all types in parallel
      const settled = await Promise.allSettled(
        Object.values(searchers).map((fn) => fn(query))
      );
      results = settled.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
