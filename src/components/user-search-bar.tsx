"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Lock } from "lucide-react";
import { searchUsers, type UserSearchHit } from "@/app/actions/social";

export default function UserSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Stay expanded while the user is interacting or has typed something —
  // collapsing mid-edit would feel broken.
  const expanded = hovered || focused || query.trim().length > 0;

  // Close dropdown on outside click
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
      setOpen(false);
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
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex h-8 items-center overflow-hidden rounded-sm border border-surface-border bg-surface-overlay transition-[width] duration-200 ease-out ${
          expanded ? "w-48" : "w-8"
        }`}
      >
        <button
          type="button"
          aria-label="Find users"
          onClick={() => inputRef.current?.focus()}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
        >
          <UserPlus size={14} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (query.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          placeholder="Find users…"
          tabIndex={expanded ? 0 : -1}
          className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-sm border border-surface-border bg-surface-raised shadow-xl shadow-black/40">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Searching…</div>
          )}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-text-muted">
              No users found.
            </div>
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
