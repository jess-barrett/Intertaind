import { Star } from "lucide-react";
import { StarRatingDisplay } from "@/components/star-rating";

/**
 * Compact ratings distribution chart. Shown beneath the actions sidebar
 * on every media detail page once the title has at least one rating.
 *
 * - 10 vertical bars, one per half-star (0.5 → 5.0)
 * - Total fan count in the header
 * - Average displayed prominently to the right of the bars
 * - Endpoint star markers as a scale legend
 */
export default function RatingsHistogram({
  buckets,
  total,
  average,
}: {
  /** Counts per half-star bucket. Length 10, index 0 = 0.5★, index 9 = 5.0★. */
  buckets: number[];
  total: number;
  average: number | null;
}) {
  if (total === 0) return null;

  const max = Math.max(...buckets, 1);

  return (
    <div className="mt-4 border-t border-surface-border pt-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wider text-text-muted">
          Ratings
        </span>
        <span className="text-text-muted">
          {total.toLocaleString()} {total === 1 ? "fan" : "fans"}
        </span>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <div className="flex h-10 flex-1 items-end gap-px">
          {buckets.map((count, i) => {
            const rawPct = total > 0 ? (count / total) * 100 : 0;
            // Buckets that round to <1% of all ratings (and the empty
            // ones) render as a faint gray baseline so the bar row still
            // feels populated and the bucket stays hoverable.
            const isSparse = rawPct < 1;
            const heightPct = isSparse
              ? 8
              : Math.max(2, (count / max) * 100);
            const pctLabel =
              count > 0 && rawPct < 1 ? "<1%" : `${Math.round(rawPct)}%`;
            // DB scale value for this bucket (i=0 → 1 → 0.5★, i=9 → 10 → 5★)
            const dbValue = i + 1;
            return (
              <div
                key={i}
                className="group relative flex h-full flex-1 items-end"
              >
                <div
                  className={`w-full rounded-[1px] transition-all ${
                    isSparse
                      ? "bg-text-muted/40 group-hover:bg-text-muted/70"
                      : "bg-brand group-hover:bg-brand-light"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
                {/* Tooltip — appears above the bar on hover. Pure CSS so
                    the histogram stays a server component. */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-sm border border-surface-border bg-surface-raised px-2 py-1 text-[10px] text-text-primary opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover:opacity-100">
                  <span className="font-medium tabular-nums">
                    {count.toLocaleString()}
                  </span>
                  <StarRatingDisplay value={dbValue} size={8} />
                  <span className="text-text-muted">
                    rating{count === 1 ? "" : "s"} ({pctLabel})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {average != null && (
          <span className="text-2xl font-semibold text-text-primary tabular-nums">
            {average.toFixed(1)}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <Star size={10} className="fill-brand text-brand" />
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              size={10}
              className="fill-brand text-brand"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
