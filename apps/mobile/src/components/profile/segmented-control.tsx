/**
 * SegmentedControl — a reusable 2–4 option pill segmented control. The active
 * option is filled with the brand accent; the rest sit flat on the raised
 * surface. Generic over a string-literal union so the value/onChange stay
 * typed at the call site (e.g. the profile's `"Overview" | "Shelves" | …`).
 *
 * Used in-screen (not as routes) — the profile's primary tabs live here as
 * component state, per the plan's "Hybrid" decision. Mobile primitives only;
 * design tokens only.
 */
import { Pressable, Text, View } from "react-native";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  /** The 2–4 segment labels; also the values passed to `onChange`. */
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-full border border-surface-border bg-surface-raised p-1">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option}
            onPress={() => onChange(option)}
            className={`flex-1 items-center rounded-full px-3 py-1.5 active:opacity-80 ${
              active ? "bg-brand" : ""
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                active ? "text-text-primary" : "text-text-muted"
              }`}
              numberOfLines={1}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
