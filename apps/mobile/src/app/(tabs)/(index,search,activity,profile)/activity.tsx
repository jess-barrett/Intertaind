/**
 * Activity tab — placeholder. The real screen (Phase 2) hosts the social
 * activity feed (friends' recent tracking / reviews / recommendations),
 * mirroring web's activity surface.
 *
 * Headerless tab anchor (the per-tab Stack hides headers), so it reserves
 * the top safe-area itself — see apps/mobile/AGENTS.md.
 */
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 gap-2 bg-surface-default px-6"
      style={{ paddingTop: insets.top + 16 }}
    >
      <Text className="text-2xl font-semibold text-text-primary">Activity</Text>
      <Text className="text-sm text-text-secondary">Coming soon.</Text>
    </View>
  );
}
