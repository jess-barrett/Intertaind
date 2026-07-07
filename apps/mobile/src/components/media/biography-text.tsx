/**
 * BiographyText — the RN mirror of web's `biography-text.tsx`
 * (apps/web/src/components/media/biography-text.tsx). Collapses a
 * multi-paragraph biography to its first paragraph with an inline "Show
 * more" / "Show less" toggle.
 *
 * Web uses an inline <button> inside a <p>; RN has no inline flow between
 * <Text> and a pressable, so the toggle is a separate `Pressable` beneath
 * the paragraph. Splits on `/\n+/` (handles both TMDb's `\n\n` and single
 * `\n` bios); a single-paragraph bio renders whole with no toggle.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function BiographyText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  // Split on any run of one-or-more newlines. TMDb bios use `\n\n` between
  // paragraphs; splitting on `\n+` also handles single-`\n` sources.
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const hasMore = paragraphs.length > 1;
  const first = paragraphs[0] ?? "";

  return (
    <View>
      <Text className="text-sm leading-relaxed text-text-secondary">
        {expanded || !hasMore ? text : first}
      </Text>
      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less" : "Show more"}
          className="mt-1 self-start active:opacity-70"
          onPress={() => setExpanded((v) => !v)}
        >
          <Text className="text-xs font-medium text-brand">
            {expanded ? "Show less" : "Show more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
