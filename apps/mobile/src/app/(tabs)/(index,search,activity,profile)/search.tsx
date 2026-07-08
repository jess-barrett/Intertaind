/**
 * Search tab — placeholder. The real screen (Phase 2) hosts cross-source
 * media search over the `media-search` Edge Function (the same
 * `useMediaSearch` the recommend picker uses), so a user can find any
 * title and open its detail / track it.
 *
 * Headerless tab anchor (the per-tab Stack hides headers), so it reserves
 * the top safe-area itself — see apps/mobile/AGENTS.md.
 */
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 gap-2 bg-surface-default px-6"
      style={{ paddingTop: insets.top + 16 }}
    >
      <Text className="text-2xl font-semibold text-text-primary">Search</Text>
      <Text className="text-sm text-text-secondary">Coming soon.</Text>
    </View>
  );
}
