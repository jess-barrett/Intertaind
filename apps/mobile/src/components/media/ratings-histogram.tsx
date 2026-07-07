/**
 * Ratings distribution histogram — the RN mirror of web's
 * `apps/web/src/components/media/ratings-histogram.tsx`. Ten vertical
 * bars (one per half-star bucket, 0.5★ → 5.0★), the total fan count, the
 * average to the right, and a two-endpoint star scale legend.
 *
 * Data comes from the denormalized `media_items.rating_distribution`
 * (`int[10]`, maintained by the rating-aggregate trigger — migration
 * 028), so this is a PURE presentational component: no fetching, no
 * on-device aggregation (a popular title's raw ratings never touch the
 * phone). `buckets[i]` is the count for DB rating `i + 1` — index 0 =
 * 0.5★, index 9 = 5.0★.
 *
 * Web-parity notes:
 *   - Web's per-bar hover tooltip is dropped — touch has no hover
 *     (apps/mobile/AGENTS.md) — but each bar carries an accessibility
 *     label with its star value and count for VoiceOver/TalkBack.
 *   - Bar heights, the sparse-bucket faint baseline, colors (brand /
 *     muted), the average readout, and the legend mirror web.
 *
 * Colors that can't be a className come straight from the token object
 * (`colors` from `@intertaind/design-system`): the legend stars are
 * lucide SVG (fill/color are props, not classes). Bar fills DO use
 * className tokens (`bg-brand` / `bg-text-muted/40`).
 */
import { Text, View } from "react-native";
import { Star } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

/** Bar row height in pt (web's `h-10`). Percentage bar heights resolve
 *  against this definite height, so it must stay explicit. */
const BAR_ROW_HEIGHT = 40;

export function RatingsHistogram({
  buckets,
  total,
  average,
}: {
  /** Count per half-star bucket. Length 10, index 0 = 0.5★, index 9 = 5.0★. */
  buckets: number[];
  /** Total ratings across all buckets (denormalized `rating_count`). */
  total: number;
  /** Average on the 0–5 display scale (denormalized `avg_rating`), or null. */
  average: number | null;
}) {
  // Unrated title — keep a compact affordance where the old average line
  // used to sit, rather than a blank gap. (Web returns null since its
  // histogram lives in a sidebar; here it stands alone in the flow.)
  if (total === 0) {
    return <Text className="text-sm text-text-muted">No ratings yet</Text>;
  }

  const max = Math.max(...buckets, 1);

  return (
    <View className="border-y border-surface-border py-4">
      {/* Header — section label + total fan count. */}
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Ratings
        </Text>
        <Text className="text-xs text-text-muted">
          {total.toLocaleString()} {total === 1 ? "fan" : "fans"}
        </Text>
      </View>

      {/* Bars + average readout. */}
      <View className="mt-2 flex-row items-end gap-3">
        <View
          className="flex-1 flex-row items-end"
          // Literal 2pt gap (web's `gap-px`): NativeWind's `w-px`/`gap-px`
          // can compile to 0 on RN, so keep it explicit.
          style={{ height: BAR_ROW_HEIGHT, gap: 2 }}
        >
          {buckets.map((count, i) => {
            const rawPct = total > 0 ? (count / total) * 100 : 0;
            // Buckets under 1% of all ratings (and the empty ones) render
            // as a faint fixed baseline so the row still reads as a chart.
            const isSparse = rawPct < 1;
            const heightPct = isSparse ? 8 : Math.max(2, (count / max) * 100);
            const stars = (i + 1) / 2;
            return (
              <View
                key={i}
                className="flex-1"
                // The bar itself carries the height; flex-1 splits width.
                style={{ height: `${heightPct}%` }}
                accessible
                accessibilityLabel={`${count.toLocaleString()} ${
                  count === 1 ? "rating" : "ratings"
                } at ${stars} ${stars === 1 ? "star" : "stars"}`}
              >
                <View
                  className={`h-full w-full rounded-[1px] ${
                    isSparse ? "bg-text-muted/40" : "bg-brand"
                  }`}
                />
              </View>
            );
          })}
        </View>

        {average != null ? (
          <Text
            className="text-2xl font-semibold text-text-primary"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {Number(average).toFixed(1)}
          </Text>
        ) : null}
      </View>

      {/* Scale legend — 0.5★ (one star) on the left, 5★ on the right. */}
      <View className="mt-1.5 flex-row items-center justify-between">
        <Star size={10} color={colors.brand} fill={colors.brand} />
        <View className="flex-row items-center" style={{ gap: 2 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={10} color={colors.brand} fill={colors.brand} />
          ))}
        </View>
      </View>
    </View>
  );
}
