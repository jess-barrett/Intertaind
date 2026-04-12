"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import MediaCard from "@/components/media-card";
import type { MediaItem, MediaType } from "@/lib/types";

const TABS: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: "all", label: "All", icon: Film, color: "text-text-primary" },
  { key: "movie", label: "Movies", icon: Film, color: "text-accent-movie" },
  { key: "tv_show", label: "TV Shows", icon: Tv, color: "text-accent-tv" },
  { key: "book", label: "Books", icon: BookOpen, color: "text-accent-book" },
  { key: "video_game", label: "Games", icon: Gamepad2, color: "text-accent-game" },
];

export default function BrowseClient({
  items,
  activeType,
}: {
  items: MediaItem[];
  activeType?: MediaType;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setType(type: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "all") {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    router.push(`/browse?${params.toString()}`);
  }

  const current = activeType ?? "all";

  return (
    <>
      {/* Tabs */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setType(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              current === tab.key
                ? "bg-surface-overlay text-text-primary border border-surface-border"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-raised"
            }`}
          >
            <tab.icon size={14} className={current === tab.key ? tab.color : ""} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg text-text-secondary">No media found</p>
          <p className="mt-1 text-sm text-text-muted">
            Media items will appear here once they&apos;re added to the database.
          </p>
        </div>
      )}
    </>
  );
}
