/**
 * Interactive half-star rating — the RN mirror of web's
 * `apps/web/src/components/star-rating.tsx`.
 *
 * Values are DISPLAY-scale stars (0.5–5.0 in half steps), never the
 * 1–10 DB scale — convert at the call site with `starsToRating` /
 * `ratingToStars` from `@intertaind/types` (two-scale rule documented
 * there). `null` = unrated / cleared; 0 is never a valid value.
 *
 * Interaction: each star is two invisible `Pressable` halves — left
 * half selects n−0.5, right half selects n (the touch analogue of
 * web's mouse-x hit test; RN has no hover, so there's no preview
 * state). Clearing mirrors web's separate ✕ button as an explicit
 * "Clear" text button (shown only when interactive and rated) rather
 * than tap-current-to-clear, which is invisible and easy to trigger
 * accidentally on touch.
 *
 * Rendering: one `Svg` per star with the lucide star path (visual
 * parity with web). Half fill is a proper SVG `ClipPath` (left 12 of
 * the 24-unit viewBox) rather than an overflow-hidden wrapper View —
 * parent-View clipping of native SVG views has been flaky on Android.
 * Clip ids are namespaced per component instance via `useId` so two
 * mounted ratings can't cross-reference each other's defs.
 *
 * Colors: star fills are SVG props, which NativeWind can't reach, so
 * they come straight from the token object (`colors` from
 * `@intertaind/design-system`) — `accent-game` for the fill (the star
 * color web uses everywhere) and `surface-border` for the empty
 * outline. Chrome (the value + Clear button) uses className tokens.
 */
import { useId } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";
import { colors } from "@intertaind/design-system";
import { formatStars } from "@intertaind/types";

/** lucide "star" outline path (24×24 viewBox) — web renders <Star/>. */
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 " +
  "1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 " +
  "2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618" +
  "-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77" +
  "-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 " +
  "0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

type StarFill = "full" | "half" | "empty";

function StarGlyph({
  size,
  fill,
  clipId,
}: {
  size: number;
  fill: StarFill;
  clipId: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {fill === "half" ? (
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={0} y={0} width={12} height={24} />
          </ClipPath>
        </Defs>
      ) : null}
      {/* Empty outline (background) */}
      <Path
        d={STAR_PATH}
        fill="none"
        stroke={colors["surface-border"]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Filled star, clipped to the left half for .5 values */}
      {fill !== "empty" ? (
        <Path
          d={STAR_PATH}
          fill={colors["accent-game"]}
          stroke={colors["accent-game"]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath={fill === "half" ? `url(#${clipId})` : undefined}
        />
      ) : null}
    </Svg>
  );
}

/** "Rate 3 and a half stars" / "Rate 4 stars" — VoiceOver/TalkBack. */
function halfStepLabel(stars: number): string {
  const whole = Math.floor(stars);
  if (stars % 1 !== 0) {
    return whole === 0
      ? "Rate half a star"
      : `Rate ${whole} and a half stars`;
  }
  return `Rate ${whole} ${whole === 1 ? "star" : "stars"}`;
}

export default function StarRating({
  value,
  onChange,
  readOnly,
  size = 28,
}: {
  /** Display-scale stars, 0.5–5.0 in half steps; null = unrated. */
  value: number | null;
  /** Omit (or set readOnly) for a display-only rating. */
  onChange?: (next: number | null) => void;
  readOnly?: boolean;
  /** Star edge length in pt. Default 28 — each tap half is then 14pt. */
  size?: number;
}) {
  // useId output contains ":" — strip to stay a safe SVG id fragment.
  const clipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const interactive = !!onChange && !readOnly;
  const display = value ?? 0;
  const valueLabel = formatStars(value);

  return (
    <View className="flex-row items-center gap-2">
      <View
        className="flex-row items-center"
        // Literal 4pt gap (NOT gap-1): NativeWind inlines rem at 14pt, so
        // gap-1 is 3.5pt — which would leave a 0.5pt overlap between the
        // adjacent stars' 2pt+2pt outward hitSlops below. The literal keeps
        // the hitSlop math exact.
        style={{ gap: 4 }}
        // Display-only mode reads as one element ("Rated 3.5 stars");
        // interactive mode exposes the per-half buttons instead.
        accessible={!interactive}
        accessibilityLabel={
          valueLabel != null ? `Rated ${valueLabel} stars` : "Not rated"
        }
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const fill: StarFill =
            display >= n ? "full" : display >= n - 0.5 ? "half" : "empty";
          return (
            <View key={n} style={{ width: size, height: size }}>
              <StarGlyph size={size} fill={fill} clipId={`${clipPrefix}s${n}`} />
              {interactive ? (
                // Horizontal hitSlop math: the star row uses a literal
                // 4pt gap between stars (see row style above). Each half
                // extends 2pt on its OUTER edge only — left half grows
                // left, right half grows right — so adjacent stars split
                // each 4pt gap 2pt/2pt with no overlap, and the seam
                // between the two halves of one star stays exact.
                <View className="absolute inset-0 flex-row">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={halfStepLabel(n - 0.5)}
                    accessibilityState={{ selected: value === n - 0.5 }}
                    hitSlop={{ top: 8, bottom: 8, left: 2 }}
                    className="flex-1"
                    onPress={() => onChange?.(n - 0.5)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={halfStepLabel(n)}
                    accessibilityState={{ selected: value === n }}
                    hitSlop={{ top: 8, bottom: 8, right: 2 }}
                    className="flex-1"
                    onPress={() => onChange?.(n)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Numeric readout, web parity ("3.5" in the star accent). */}
      {valueLabel != null ? (
        <Text
          className="text-sm font-medium"
          style={{ color: colors["accent-game"] }}
          accessibilityElementsHidden // redundant with star labels
          importantForAccessibility="no-hide-descendants"
        >
          {valueLabel}
        </Text>
      ) : null}

      {/* Explicit clear, mirroring web's ✕ button (see file header). */}
      {interactive && value != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
          hitSlop={8}
          className="rounded px-2 py-1 active:opacity-70"
          onPress={() => onChange?.(null)}
        >
          <Text className="text-xs text-text-muted">Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
