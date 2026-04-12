"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setExpanded(false);
    }
  }

  return (
    <>
      {/* Desktop: always-visible input */}
      <form onSubmit={handleSubmit} className="hidden sm:block">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-40 rounded-lg border border-surface-border bg-surface-overlay py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:w-56 focus:border-brand focus:outline-none transition-all"
          />
        </div>
      </form>

      {/* Mobile: icon toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center rounded-lg p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text-primary sm:hidden"
      >
        <Search size={18} />
      </button>

      {expanded && (
        <form
          onSubmit={handleSubmit}
          className="absolute left-4 right-4 top-full mt-2 sm:hidden"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, books, games..."
            autoFocus
            className="w-full rounded-lg border border-surface-border bg-surface-raised px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </form>
      )}
    </>
  );
}
