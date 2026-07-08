/**
 * ExpandableText — a blurb that clamps to `collapsedLines` lines and toggles
 * between clamped and full when the text area is tapped. Used for media
 * descriptions on the detail screen (long TMDb/Google-Books synopses
 * shouldn't dominate the screen).
 *
 * ── No-flash truncation detection ──────────────────────────────────────
 * RN's `onTextLayout` reports only the CLIPPED lines once `numberOfLines`
 * is set, so it can't tell us whether the FULL text overflows. We measure
 * with a one-shot, off-screen copy of the text (absolute + opacity 0, same
 * width + type styles) whose `onTextLayout` counts the real line total. The
 * VISIBLE text is clamped from the first frame, so nothing ever flashes
 * full; the measurer only decides whether the tap/"Show more" cue applies,
 * then unmounts. If the text fits within the clamp, the area is inert (no
 * cue, tap does nothing) so a short blurb isn't misleadingly interactive.
 *
 * The "Show more" / "Show less" cue uses the `brand` accent, matching web's
 * truncation affordance. Tapping anywhere in the text area toggles.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function ExpandableText({
  text,
  collapsedLines = 4,
  className,
}: {
  text: string;
  /** Lines shown when collapsed. Default 4. */
  collapsedLines?: number;
  /** Tailwind classes for the text (font size, color, leading). */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);
  const [measured, setMeasured] = useState(false);

  return (
    <View>
      {/* One-shot off-screen measurer — full text, no clamp, invisible, and
          hidden from screen readers. Determines whether the clamp overflows,
          then unmounts. */}
      {!measured ? (
        <Text
          className={className}
          style={{ position: "absolute", left: 0, right: 0, opacity: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onTextLayout={(e) => {
            setTruncatable(e.nativeEvent.lines.length > collapsedLines);
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
              ? "Show less"
              : "Show more"
            : undefined
        }
        accessibilityState={truncatable ? { expanded } : undefined}
        onPress={() => setExpanded((v) => !v)}
      >
        <Text className={className} numberOfLines={expanded ? undefined : collapsedLines}>
          {text}
        </Text>
        {truncatable ? (
          <Text className="mt-1 text-xs font-medium text-brand">
            {expanded ? "Show less" : "Show more"}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
