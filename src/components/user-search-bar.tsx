"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Lock } from "lucide-react";
import { searchUsers, type UserSearchHit } from "@/app/actions/social";

export default function UserSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const hits = await searchUsers(q);
        setResults(hits);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function selectHit(hit: UserSearchHit) {
    setOpen(false);
    setQuery("");
    router.push(`/u/${hit.username}`);
  }

  return (
    <div ref={rootRef} className="relative w-64">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Find users…"
        className="w-full rounded-sm border border-surface-border bg-surface-overlay py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-sm border border-surface-border bg-surface-raised shadow-xl shadow-black/40">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Searching…</div>
          )}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-text-muted">No users found.</div>
          )}
          {results.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => selectHit(hit)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-overlay"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay text-sm font-bold text-brand">
                {hit.avatar_url ? (
                  <img
                    src={hit.avatar_url}
                    alt={hit.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  hit.username[0]?.toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm text-text-primary">
                  <span className="truncate">
                    {hit.display_name || hit.username}
                  </span>
                  {hit.is_private && (
                    <Lock size={10} className="text-text-muted" />
                  )}
                </div>
                <div className="truncate text-xs text-text-muted">
                  @{hit.username}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
