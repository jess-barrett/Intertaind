"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { MediaType } from "@intertaind/types";
import type { SortKey, MediaFilters } from "@/lib/media-query";
import { DECADES } from "@/lib/media-query";
import { filtersToPath } from "@/lib/filter-path";

type Mode = "redirect" | "inplace" | "queryparam";

export default function MediaFilterBar({
  mediaType,
  genres,
  sortOptions,
  platforms,
  statuses,
  currentFilters,
  mode = "queryparam",
}: {
  mediaType?: MediaType;
  genres: string[];
  sortOptions: { value: SortKey; label: string }[];
  platforms?: string[];
  statuses?: string[];
  /** Provide when using mode="inplace" or "redirect" to show the current state */
  currentFilters?: MediaFilters;
  /**
   * - "redirect": nav to /{type}/browse/{canonical-path} (for landing pages)
   * - "inplace":  router.replace to canonical browse path (for browse pages)
   * - "queryparam" (default): update ?decade=...&genre=... (for shelf pages)
   */
  mode?: Mode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Read current values from URL (query params) or from passed filters
  const decade =
    currentFilters?.decade ?? searchParams.get("decade") ?? "";
  const genre = currentFilters?.genre ?? searchParams.get("genre") ?? "";
  const platform =
    currentFilters?.platform ?? searchParams.get("platform") ?? "";
  const status = currentFilters?.status ?? searchParams.get("status") ?? "";
  const sort =
    (currentFilters?.sort as string | undefined) ??
    searchParams.get("sort") ??
    "popular_all";

  function buildFilters(overrides: Partial<MediaFilters>): MediaFilters {
    return {
      sort: (sort as SortKey) || "popular_all",
      decade: decade || undefined,
      genre: genre || undefined,
      platform: platform || undefined,
      status: status || undefined,
      ...overrides,
    };
  }

  function applyChange(overrides: Partial<MediaFilters>) {
    // Wrap in a transition so current results stay visible while the server
    // re-fetches — otherwise the empty-state flash briefly shows.
    startTransition(() => {
      if ((mode === "redirect" || mode === "inplace") && mediaType) {
        const filters = buildFilters(overrides);
        const path = filtersToPath(mediaType, filters);
        if (mode === "redirect") {
          router.push(path);
        } else {
          router.replace(path, { scroll: false });
        }
      } else {
        // queryparam mode — update search params in place
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(overrides)) {
          if (value) {
            params.set(key, String(value));
          } else {
            params.delete(key);
          }
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    });
  }

  const selectClass =
    "rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 text-xs text-text-secondary focus:border-brand focus:outline-none";

  return (
    <div
      className={`mb-6 flex flex-wrap items-center gap-2 border-b border-surface-border pb-4 transition-opacity ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Filter:</span>

        <select
          value={decade}
          onChange={(e) => applyChange({ decade: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">Any decade</option>
          {DECADES.map((d) => (
            <option key={d} value={d}>
              {d === "older" ? "Pre-1970" : d}
            </option>
          ))}
        </select>

        <select
          value={genre}
          onChange={(e) => applyChange({ genre: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">Any genre</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {platforms && (
          <select
            value={platform}
            onChange={(e) =>
              applyChange({ platform: e.target.value || undefined })
            }
            className={selectClass}
          >
            <option value="">Any platform</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        {statuses && (
          <select
            value={status}
            onChange={(e) =>
              applyChange({ status: e.target.value || undefined })
            }
            className={selectClass}
          >
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-text-muted">Sort by:</span>
        <select
          value={sort}
          onChange={(e) =>
            applyChange({ sort: e.target.value as SortKey })
          }
          className={selectClass}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
