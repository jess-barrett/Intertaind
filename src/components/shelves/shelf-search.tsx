"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, X } from "lucide-react";
import SearchResultCard from "@/components/search-result-card";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

export default function ShelfSearch({
  mediaType,
  onAdded,
}: {
  mediaType: MediaType;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const config = MEDIA_TYPE_CONFIG[mediaType];

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&type=${mediaType}`
        );
        if (res.ok) {
          setResults(await res.json());
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    },
    [mediaType]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary`}
      >
        <Search size={14} />
        Add {config.label.toLowerCase()}
      </button>
    );
  }

  return (
    <div className="glass p-4">
      {/* Search input */}
      <div className="relative mb-4 flex items-center gap-2">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${config.label.toLowerCase()}...`}
          autoFocus
          className="w-full rounded-lg border border-surface-border bg-surface-overlay py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
        />
        <button
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults([]);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((result, i) => (
            <SearchResultCard
              key={`${result.external_ids[Object.keys(result.external_ids)[0]]}-${i}`}
              result={result}
            />
          ))}
        </div>
      ) : query.length >= 2 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No results found
        </p>
      ) : null}
    </div>
  );
}
