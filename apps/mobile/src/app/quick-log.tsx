/**
 * Quick-log — the center "+" action's destination. A ROOT-level modal route
 * (sibling of `(auth)` / `(tabs)`, presented with `presentation: "modal"` in
 * the root `_layout.tsx`), so it overlays the whole app — including the bottom
 * bar — for a focused create flow reachable from any tab.
 *
 * Placeholder for now. The real flow (Phase 2) lets the viewer search any
 * title (the `media-search` Edge Function) and quickly log / track it without
 * first navigating to its detail screen — a fast "I just watched/read/played
 * X" capture.
 *
 * Own chrome: as a modal it renders its own header row (title + close) rather
 * than a native header; it reserves the top safe-area itself.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

export default function QuickLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-surface-default px-6"
      style={{ paddingTop: insets.top + 12 }}
    >
      {/* Modal header row — title + close. */}
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-xl font-bold text-text-primary">Quick log</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: colors["surface-overlay"] }}
          onPress={() => router.back()}
        >
          <X size={20} color={colors["text-primary"]} />
        </Pressable>
      </View>

      <Text className="text-sm text-text-secondary">
        Search a title to log it — coming soon.
      </Text>
    </View>
  );
}
