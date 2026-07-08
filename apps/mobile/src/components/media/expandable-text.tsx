/**
 * ExpandableText — a blurb that clamps to `collapsedLines` lines and toggles
 * between clamped and full when the text area is tapped. Used for media
 * descriptions on the detail screen (long TMDb/Google-Books synopses
 * shouldn't dominate the screen).
 *
 * ── Letterboxd-style fade cue (no ellipsis, no button) ────────────────
 * When collapsed AND the text overflows, the clamped text is clipped
 * WITHOUT an ellipsis (`ellipsizeMode="clip"`) and a gradient fading from
 * transparent to the page background (`fadeColor`, default surface-default)
 * is overlaid over the last line — so the final line dissolves into the
 * background, signalling "there's more" the way Letterboxd does. Tapping
 * anywhere in the text toggles full/clamped; expanded shows the whole
 * synopsis with no fade.
 *
 * ── No-flash truncation detection ──────────────────────────────────────
 * RN's `onTextLayout` reports only the CLIPPED lines once `numberOfLines`
 * is set, so it can't tell us whether the FULL text overflows. We measure
 * with a one-shot, off-screen copy of the text (absolute + opacity 0, same
 * width + type styles) whose `onTextLayout` counts the real line total AND
 * captures a line height (to size the fade). The VISIBLE text is clamped
 * from the first frame, so nothing ever flashes full; the measurer only
 * decides whether the fade/tap applies, then unmounts. A short blurb that
 * fits within the clamp stays inert (no fade, tap does nothing).
 */
import { useId, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "@intertaind/design-system";

/** Fallback line height (pt) until the off-screen measure reports the real
 *  one — text-sm + leading-relaxed lands near here. */
const FALLBACK_LINE_HEIGHT = 20;

export function ExpandableText({
  text,
  collapsedLines = 4,
  className,
  fadeColor = colors["surface-default"],
}: {
  text: string;
  /** Lines shown when collapsed. Default 4. */
  collapsedLines?: number;
  /** Tailwind classes for the text (font size, color, leading). */
  className?: string;
  /** The background the last line fades INTO — set this if the text sits on
   *  a non-default surface. Defaults to the page background. */
  fadeColor?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [lineHeight, setLineHeight] = useState(FALLBACK_LINE_HEIGHT);
  // useId output contains ":" — strip to a safe SVG id fragment (one per
  // instance so multiple ExpandableTexts can't cross-reference defs).
  const gradId = `etfade${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const showFade = truncatable && !expanded;
  // Fade the bottom ~1.5 lines so the last line dissolves into the bg.
  const fadeHeight = Math.round(lineHeight * 1.5);

  return (
    <View>
      {/* One-shot off-screen measurer — full text, no clamp, invisible, and
          hidden from screen readers. Learns the overflow + a line height,
          then unmounts. */}
      {!measured ? (
        <Text
          className={className}
          style={{ position: "absolute", left: 0, right: 0, opacity: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onTextLayout={(e) => {
            const lines = e.nativeEvent.lines;
            setTruncatable(lines.length > collapsedLines);
            if (lines[0]?.height) setLineHeight(lines[0].height);
            setMeasured(true);
          }}
        >
          {text}
        </Text>
      ) : null}

      <Pressable
        disabled={!truncatable}
        accessibilityRole={truncatable ? "button" : undefined}
        accessibilityLabel={
          truncatable
            ? expanded
              ? "Collapse description"
              : "Expand description"
            : undefined
        }
        accessibilityState={truncatable ? { expanded } : undefined}
        onPress={() => setExpanded((v) => !v)}
      >
        <Text
          className={className}
          numberOfLines={expanded ? undefined : collapsedLines}
          // No "…": the fade is the truncation cue (Letterboxd).
          ellipsizeMode="clip"
        >
          {text}
        </Text>

        {showFade ? (
          <Svg
            width="100%"
            height={fadeHeight}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fadeColor} stopOpacity={0} />
                <Stop offset="1" stopColor={fadeColor} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
          </Svg>
        ) : null}
      </Pressable>
    </View>
  );
}
