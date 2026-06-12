"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import RecommendationCard from "@/components/recommendations/recommendation-card";
import type {
  RecommendationWithSource,
  RecommendationWithTarget,
} from "@/lib/types";

type Direction = "with" | "for";

/**
 * Toggleable recommendations section on a media detail page. Holds the
 * data for BOTH directions in props so the toggle is instant — no
 * fetch on switch — at the cost of one extra index-only query at page
 * load. Cheap relative to the existing page work and keeps the section
 * snappy.
 *
 * Renders nothing if both directions are empty so we don't show a
 * heading with no body.
 */
export default function MediaRecommendationsSection({
  mediaId,
  pairsWith,
  pairsWithTotal,
  recommendedFor,
  recommendedForTotal,
}: {
  mediaId: string;
  /** Recs WHERE source = this media. Visible under "Pairs with this". */
  pairsWith: RecommendationWithTarget[];
  pairsWithTotal: number;
  /** Recs WHERE target = this media. Visible under "Recommended for this". */
  recommendedFor: RecommendationWithSource[];
  recommendedForTotal: number;
}) {
  const hasPairs = pairsWith.length > 0;
  const hasInverse = recommendedFor.length > 0;
  // Default to whichever side has content — the page must show
  // something useful on first paint or the section reads as broken.
  const initialDirection: Direction = hasPairs ? "with" : "for";
  const [direction, setDirection] = useState<Direction>(initialDirection);

  if (!hasPairs && !hasInverse) return null;

  const activeTotal =
    direction === "with" ? pairsWithTotal : recommendedForTotal;

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-surface-border pb-2">
        <div className="flex items-end gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Intertaind
          </h2>
          {/* Tab pair — only render the side that has content. We
              don't show a disabled "0 results" tab; that reads as
              broken on a community-thin page. */}
          <div className="flex items-center gap-1 text-xs">
            {hasPairs && (
              <button
                type="button"
                onClick={() => setDirection("with")}
                className={`rounded-sm px-2 py-1 font-medium transition-colors ${
                  direction === "with"
                    ? "bg-brand/10 text-brand"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Pairs with this
              </button>
            )}
            {hasInverse && (
              <button
                type="button"
                onClick={() => setDirection("for")}
                className={`rounded-sm px-2 py-1 font-medium transition-colors ${
                  direction === "for"
                    ? "bg-brand/10 text-brand"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Intertaind for this
              </button>
            )}
          </div>
        </div>
        {activeTotal > 5 && (
          <Link
            href={`/media/${mediaId}/recommendations?direction=${direction}`}
            className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
          >
            See all ({activeTotal}) <ArrowRight size={12} />
          </Link>
        )}
      </div>

      <div>
        {direction === "with"
          ? pairsWith.map((r) => (
              <RecommendationCard
                key={r.id}
                primaryMedia={r.recommended_media}
                recommender={r.profiles}
                note={r.note}
                createdAt={r.created_at}
              />
            ))
          : recommendedFor.map((r) => (
              <RecommendationCard
                key={r.id}
                primaryMedia={r.source_media}
                recommender={r.profiles}
                note={r.note}
                createdAt={r.created_at}
              />
            ))}
      </div>
    </section>
  );
}
