"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, X } from "lucide-react";
import SearchResultCard from "@/components/search-result-card";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";

export default function ShelfSearch({
  mediaType,
}: {
  mediaType: MediaType;
  /** @deprecated kept for API compatibility — the card navigates now. */
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Track the in-flight request so a new keystroke can cancel it.
  // Without this, a fast "red"-then-"red rising" sequence races: the
  // shorter query's larger response sometimes finishes after the longer
  // query's response, overwriting the right results with stale ones.
  const abortRef = useRef<AbortController | null>(null);
  const config = MEDIA_TYPE_CONFIG[mediaType];

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      // Cancel any in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&type=${mediaType}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          // Belt-and-suspenders: ignore the response if the user has
          // moved on to a different query. AbortController catches the
          // common case but doesn't help if the request returned right
          // before we started cancelling.
          if (abortRef.current === controller) {
            setResults(await res.json());
          }
        }
      } catch {
        // AbortError is the expected cancel path — silently swallow.
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
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

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-sm border border-surface-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        <Search size={14} />
        Add {config.label.toLowerCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-lg max-w-[calc(100vw-2rem)] rounded-sm border border-surface-border bg-surface-raised p-4 shadow-2xl shadow-black/50">
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
              className="w-full rounded-sm border border-surface-border bg-surface-overlay py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
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
            <div className="custom-scrollbar grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
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
      )}
    </div>
  );
}
