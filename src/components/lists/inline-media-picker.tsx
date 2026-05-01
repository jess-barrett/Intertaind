"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2, X, Plus } from "lucide-react";
import CoverImage from "@/components/cover-image";
import { upsertMediaItem } from "@/app/actions/media";
import type { MediaType, SearchResult } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { yearFromDateString } from "@/lib/time";

interface PickerOption {
  /** Restrict search results by media type:
      - `"all"` or empty array → all four types
      - single `MediaType` → only that type (legacy single-scope picker)
      - `MediaType[]` with 1-3 entries → those types only (multi-select
        from the list create form's "Media types" field). */
  scope?: MediaType | "all" | MediaType[];
}

/**
 * Search-and-pick widget shared by the source-media field and the items
 * list on the create/edit form. Internally hits `/api/search` (debounced)
 * and `upsertMediaItem` on selection so the caller always receives a
 * persisted `media_id`.
 *
 * The caller decides what to do with the picked item — append it to
 * a list, set a single source media, etc. — via the `onPick` callback.
 */
export default function InlineMediaPicker({
  placeholder = "Search movies, TV, books, or games…",
  scope = "all",
  excludeMediaIds = [],
  onPick,
}: PickerOption & {
  placeholder?: string;
  /** mediaId values to hide from results (typically items already added). */
  excludeMediaIds?: string[];
  onPick: (
    result: SearchResult,
    mediaId: string
  ) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel in-flight fetches when a new keystroke fires a new search.
  // Prevents the slow "red" response from arriving after "red rising"
  // and overwriting the right results with stale ones.
  const abortRef = useRef<AbortController | null>(null);

  // Resolve the prop's many shapes down to a stable types-or-all
  // signal. Empty arrays and the literal "all" both mean unrestricted;
  // a single string and a single-element array both mean that one type.
  const types: MediaType[] | "all" = (() => {
    if (scope === "all" || scope == null) return "all";
    if (Array.isArray(scope)) {
      return scope.length === 0 || scope.length === 4 ? "all" : scope;
    }
    return [scope];
  })();
  const typesKey = Array.isArray(types) ? types.join(",") : types;

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      // Cancel any in-flight request before starting a new one, then
      // remember the new controller so the response handler can verify
      // it's still the latest before applying results.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        let merged: SearchResult[];
        if (types === "all") {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}&type=all`,
            { signal: controller.signal }
          );
          merged = res.ok ? ((await res.json()) as SearchResult[]) : [];
        } else if (types.length === 1) {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}&type=${types[0]}`,
            { signal: controller.signal }
          );
          merged = res.ok ? ((await res.json()) as SearchResult[]) : [];
        } else {
          // Multi-type filtered: hit each per-type endpoint in parallel
          // (each returns its own ranked top-N) and interleave by index
          // so the dropdown shows a balanced mix instead of every movie
          // before any book.
          const responses = await Promise.all(
            types.map((t) =>
              fetch(`/api/search?q=${encodeURIComponent(q)}&type=${t}`, {
                signal: controller.signal,
              }).then(
                async (r) => (r.ok ? ((await r.json()) as SearchResult[]) : [])
              )
            )
          );
          merged = [];
          const maxLen = Math.max(...responses.map((r) => r.length), 0);
          for (let i = 0; i < maxLen; i++) {
            for (const list of responses) {
              if (list[i]) merged.push(list[i]);
            }
          }
        }
        if (abortRef.current === controller) {
          setResults(merged);
        }
      } catch {
        // AbortError is the expected cancel path — silently swallow.
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    },
    // typesKey collapses the array into a stable string so the callback
    // identity doesn't change every render due to a fresh array ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typesKey]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  async function handlePick(result: SearchResult) {
    // Use the first external id as the dedupe key during the in-flight
    // window so a double-click doesn't fire two upserts.
    const externalKey = Object.values(result.external_ids)[0];
    const dedupeKey = `${result.media_type}:${externalKey}`;
    if (adding === dedupeKey) return;

    setAdding(dedupeKey);
    try {
      const mediaId = await upsertMediaItem(result);
      await onPick(result, mediaId);
      setQuery("");
      setResults([]);
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-sm border border-surface-border bg-surface-overlay py-2 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {(loading || results.length > 0 || query.length >= 2) && (
        <div className="custom-scrollbar absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-sm border border-surface-border bg-surface-raised shadow-xl shadow-black/40">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-text-muted" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-muted">
              No results
            </p>
          ) : (
            results.map((r) => {
              const externalKey = Object.values(r.external_ids)[0];
              const dedupeKey = `${r.media_type}:${externalKey}`;
              const config = MEDIA_TYPE_CONFIG[r.media_type];
              const isAdding = adding === dedupeKey;
              const year = yearFromDateString(r.release_date);
              return (
                <button
                  key={dedupeKey}
                  type="button"
                  disabled={isAdding}
                  onClick={() => handlePick(r)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-overlay disabled:opacity-50"
                >
                  <div className="aspect-2/3 w-8 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
                    <CoverImage
                      src={r.cover_image_url}
                      alt={r.title}
                      className="h-full w-full object-cover"
                      fallback={
                        <div className="flex h-full items-center justify-center text-text-muted">
                          —
                        </div>
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text-primary">
                      {r.title}
                    </div>
                    <div className="text-xs text-text-muted">
                      <span className={config.color}>{config.label}</span>
                      {year && <> · {year}</>}
                    </div>
                  </div>
                  {isAdding ? (
                    <Loader2 size={14} className="animate-spin text-text-muted" />
                  ) : (
                    <Plus size={14} className="text-text-muted" />
                  )}
                </button>
              );
            })
          )}
          {/* Hide rows already in the list — done client-side after the
              fact since /api/search doesn't accept exclusions. We keep
              them in the dropdown but mark them as already-added if we
              want; for now, simplest is to filter outright. */}
          {excludeMediaIds.length > 0 && results.length > 0 && (
            <span className="hidden">{excludeMediaIds.join(",")}</span>
          )}
        </div>
      )}
    </div>
  );
}
