/**
 * The app's bottom tab navigator. Uses expo-router's JS `Tabs` (from
 * `expo-router/js-tabs` — the bare `expo-router` export is deprecated in
 * SDK 56) with a fully custom `tabBar`, so the navbar is our own dark +
 * neon component rendering identically on iOS/Android. This replaces the
 * old OS-native `NativeTabs`.
 *
 * The per-tab visuals (icon, active accent, surface) all live in
 * `BottomTabBar`; here we only declare the tab SET and their labels.
 * `headerShown: false` because screens render their own chrome. Keep
 * this list the single source of the tab order — the custom bar is
 * data-driven off it. (Tab-set is a later brainstorm — Trending +
 * Explore are the current placeholders; adding a tab is one Screen here
 * plus one icon entry in `BottomTabBar`.)
 */
import { Tabs } from "expo-router/js-tabs";

import BottomTabBar from "@/components/nav/bottom-tab-bar";

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Trending" }} />
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
    </Tabs>
  );
}
