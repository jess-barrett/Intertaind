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
import { useId, useMemo, useRef } from "react";
import {
  type AccessibilityActionEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";
import { colors } from "@intertaind/design-system";
import { formatStars } from "@intertaind/types";

// This is lucide's own <Star> path, inlined (NOT lucide-react-native's
// <Star>) so the half-fill ClipPath below can clip the left 12 units —
// kept custom on purpose; don't swap it for the lucide component.
/** lucide "star" outline path (24×24 viewBox) — web renders <Star/>. */
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 " +
  "1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 " +
  "2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618" +
  "-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77" +
  "-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 " +
  "0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

type StarFill = "full" | "half" | "empty";

/**
 * Literal inter-star gap (pt). It must match the row's `style={{ gap }}` AND
 * the drag→value math in `starsFromX` — they're kept in sync via this one
 * constant. (NOT gap-1: NativeWind inlines rem at 14pt, so gap-1 ≈ 3.5pt.)
 */
const STAR_GAP = 4;

/**
 * Map a horizontal offset (pt, measured from the star row's left edge) to a
 * half-star value in [0.5, 5] — the drag/tap hit test. Assumes five `size`-wide
 * stars separated by `STAR_GAP`: the left half of a star is n−0.5, the right
 * half (and the gap after it) is n. Clamped to the row's bounds.
 */
function starsFromX(x: number, size: number): number {
  const step = size + STAR_GAP;
  const width = 5 * size + 4 * STAR_GAP;
  const clamped = Math.max(0, Math.min(x, width));
  const index = Math.min(4, Math.floor(clamped / step));
  const within = (clamped - index * step) / size;
  return Math.min(5, index + (within <= 0.5 ? 0.5 : 1));
}

function StarGlyph({
  size,
  fill,
  clipId,
  hideOutline,
}: {
  size: number;
  fill: StarFill;
  clipId: string;
  /** Skip the empty outline (background). In earned-only mode a half star then
   *  shows just its left filled portion — no outline on the empty right half. */
  hideOutline?: boolean;
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
      {/* Empty outline (background) — omitted in earned-only mode. */}
      {!hideOutline ? (
        <Path
          d={STAR_PATH}
          fill="none"
          stroke={colors["surface-border"]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
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

export default function StarRating({
  value,
  onChange,
  readOnly,
  size = 28,
  starsOnly,
  hideEmpty,
}: {
  /** Display-scale stars, 0.5–5.0 in half steps; null = unrated. */
  value: number | null;
  /** Omit (or set readOnly) for a display-only rating. */
  onChange?: (next: number | null) => void;
  readOnly?: boolean;
  /** Star edge length in pt. Default 28 — each tap half is then 14pt. */
  size?: number;
  /**
   * Render ONLY the 5 stars — no numeric value, no clear button. Lets a
   * caller (e.g. the action strip) center just the stars and supply its own
   * clear affordance, so the value/clear can't shift the stars' position.
   */
  starsOnly?: boolean;
  /**
   * Earned-only display: render just the filled/half stars, with NO empty
   * outlines at all (a 3.5 shows three full + one left-half glyph, nothing
   * more). For compact read-only badges (e.g. shelf cards). Meaningless when
   * interactive — the tap targets need all five stars — so pair with readOnly.
   */
  hideEmpty?: boolean;
}) {
  // useId output contains ":" — strip to stay a safe SVG id fragment.
  const clipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const interactive = !!onChange && !readOnly;
  const display = value ?? 0;
  const valueLabel = formatStars(value);

  // Latest onChange/size behind a ref so the gesture object stays STABLE across
  // renders. If the gesture were rebuilt when `onChange` changes (a fresh
  // closure most renders), the ACTIVE gesture would be swapped mid-interaction:
  // the pan's onUpdate stream stops (stars freeze instead of following the
  // finger) and a tap races the swap (the perceptible delay).
  const latestRef = useRef({ onChange, size });
  /* eslint-disable react-hooks/refs -- read only inside the gesture callbacks
     (at interaction time, never during render); a stable gesture is required so
     an in-progress drag isn't interrupted. */
  latestRef.current = { onChange, size };
  const gesture = useMemo(() => {
    const setFromX = (x: number) =>
      latestRef.current.onChange?.(starsFromX(x, latestRef.current.size));
    // runOnJS(true): callbacks run on the JS thread (no worklet hop), so they
    // update state immediately. Tap rates at the touch point; Pan drags across
    // ratings live; activeOffsetX lets a vertical drag pass through to an
    // enclosing bottom sheet / scroll. `e.x` is relative to the gesture's view.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => setFromX(e.x));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .onUpdate((e) => setFromX(e.x));
    return Gesture.Race(pan, tap);
  }, []);
  /* eslint-enable react-hooks/refs */

  // VoiceOver/TalkBack: the row is an "adjustable"; swipe up/down nudges the
  // rating a half-star (down past a half clears it).
  function onA11yAction(event: AccessibilityActionEvent) {
    const current = value ?? 0;
    if (event.nativeEvent.actionName === "increment") {
      onChange?.(Math.min(5, current + 0.5));
    } else if (event.nativeEvent.actionName === "decrement") {
      const next = current - 0.5;
      onChange?.(next < 0.5 ? null : next);
    }
  }

  // The five star glyphs (earned-only mode drops the empty ones). Input is
  // handled by the row's gesture below — no per-star Pressables.
  const stars = [1, 2, 3, 4, 5].map((n) => {
    const fill: StarFill =
      display >= n ? "full" : display >= n - 0.5 ? "half" : "empty";
    if (hideEmpty && fill === "empty") return null;
    return (
      <View key={n} style={{ width: size, height: size }}>
        <StarGlyph
          size={size}
          fill={fill}
          clipId={`${clipPrefix}s${n}`}
          hideOutline={hideEmpty}
        />
      </View>
    );
  });

  const starRow = (
    <View
      className="flex-row items-center"
      style={{ gap: STAR_GAP }}
      // Interactive: one "adjustable" element (drag/tap rates; the a11y
      // swipe nudges). Display-only: one labeled element ("Rated 3.5 stars").
      accessible
      accessibilityRole={interactive ? "adjustable" : undefined}
      accessibilityLabel={
        interactive
          ? "Rating"
          : valueLabel != null
            ? `Rated ${valueLabel} stars`
            : "Not rated"
      }
      accessibilityValue={
        interactive
          ? {
              min: 0,
              max: 5,
              now: value ?? 0,
              text: valueLabel != null ? `${valueLabel} stars` : "Not rated",
            }
          : undefined
      }
      accessibilityActions={
        interactive ? [{ name: "increment" }, { name: "decrement" }] : undefined
      }
      onAccessibilityAction={interactive ? onA11yAction : undefined}
    >
      {stars}
    </View>
  );

  return (
    <View className="flex-row items-center gap-2">
      {/* Drag across the stars to rate; tap to set at a point. Wrapped in a
          GestureDetector only when interactive. */}
      {interactive ? (
        <GestureDetector gesture={gesture}>{starRow}</GestureDetector>
      ) : (
        starRow
      )}

      {/* Numeric readout, web parity ("3.5" in the star accent). */}
      {!starsOnly && valueLabel != null ? (
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
      {!starsOnly && interactive && value != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
          hitSlop={8}
          className="rounded px-2 py-1 active:opacity-70"
          onPress={() => onChange?.(null)}
        >
          <Text className="text-base leading-none text-text-muted">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
