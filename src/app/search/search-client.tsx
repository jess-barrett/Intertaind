"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, BookOpen, Film, Tv, Gamepad2, Loader2 } from "lucide-react";
import SearchResultCard from "@/components/search-result-card";
import type { SearchResult } from "@/lib/types";

const TABS = [
  { key: "all", label: "All", icon: Search, color: "text-text-primary" },
  { key: "movie", label: "Movies", icon: Film, color: "text-accent-movie" },
  { key: "tv_show", label: "TV Shows", icon: Tv, color: "text-accent-tv" },
  { key: "book", label: "Books", icon: BookOpen, color: "text-accent-book" },
  { key: "video_game", label: "Games", icon: Gamepad2, color: "text-accent-game" },
];

export default function SearchClient({
  initialQuery,
  initialType,
}: {
  initialQuery: string;
  initialType: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const doSearch = useCallback(
    async (q: string, t: string) => {
      if (q.length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }

      setLoading(true);
      setSearched(true);

      // Update URL without navigation
      const params = new URLSearchParams();
      params.set("q", q);
      if (t !== "all") params.set("type", t);
      router.replace(`/search?${params.toString()}`, { scroll: false });

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&type=${t}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch {
        // Silently handle — results stay empty
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Debounced search on query/type change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, type), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, type, doSearch]);

  // Initial search if URL has query
  useEffect(() => {
    if (initialQuery.length >= 2) {
      doSearch(initialQuery, initialType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Search input */}
      <div className="relative mb-6">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, shows, books, games..."
          className="w-full rounded-xl border border-surface-border bg-surface-raised py-3 pl-11 pr-4 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          autoFocus
        />
      </div>

      {/* Type tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setType(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              type === tab.key
                ? "bg-surface-overlay text-text-primary border border-surface-border"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-raised"
            }`}
          >
            <tab.icon
              size={14}
              className={type === tab.key ? tab.color : ""}
            />
            {tab.label}
          </button>
        ))}
      </div>

      {type === "book" && (
        <p className="mb-6 text-xs text-text-muted">
          Can&apos;t find your book? Try adding{" "}
          <span className="text-text-secondary">by [author name]</span> to your
          search.
        </p>
      )}
      {type !== "book" && <div className="mb-6" />}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((result, i) => (
            <SearchResultCard
              key={`${result.external_ids[Object.keys(result.external_ids)[0]]}-${i}`}
              result={result}
            />
          ))}
        </div>
      ) : searched ? (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg text-text-secondary">No results found</p>
          <p className="mt-1 text-sm text-text-muted">
            {type === "book"
              ? "Try adding \"by [author name]\" to your search."
              : "Try a different search term or media type."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <Search size={32} className="mb-4 text-text-muted" />
          <p className="text-lg text-text-secondary">
            Search across movies, TV, books, and games
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Find something to add to your collection.
          </p>
        </div>
      )}
    </>
  );
}
