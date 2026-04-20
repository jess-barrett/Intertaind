"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MediaCard from "@/components/media-card";
import type { MediaItem } from "@/lib/types";

const PAGE_SIZE = 4;

export default function PopularCarousel({
  items,
  title,
}: {
  items: MediaItem[];
  title: string;
}) {
  const [offset, setOffset] = useState(0);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE);
  const visible = items.slice(offset, offset + PAGE_SIZE);

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < items.length;

  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <span className="text-xs text-text-muted">
              {currentPage + 1} / {totalPages}
            </span>
          )}
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!canPrev}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-border text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!canNext}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-border text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {visible.map((item) => (
          <MediaCard key={item.id} item={item} showStats />
        ))}
      </div>
    </section>
  );
}
