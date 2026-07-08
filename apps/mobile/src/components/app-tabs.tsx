/**
 * The app's bottom tab navigator. Uses expo-router's JS `Tabs` (from
 * `expo-router/js-tabs` — the bare `expo-router` export is deprecated in
 * SDK 56) with a fully custom `tabBar`, so the navbar is our own dark +
 * neon component rendering identically on iOS/Android. This replaces the
 * old OS-native `NativeTabs`.
 *
 * Each tab is its OWN Stack, and the detail screens (`media/[id]`,
 * `person/[id]`) are SHARED routes pushed inside whichever tab is active —
 * see the structure comment in
 * `(tabs)/(index,search,activity,profile)/_layout.tsx`. Because of the
 * array-group folder `(index,search,activity,profile)/`, this Tabs
 * navigator's children are the four GROUP routes `(index)` / `(search)` /
 * `(activity)` / `(profile)` (expo-router keeps the parentheses in the route
 * name for group directories). So the `Tabs.Screen` names — and the custom
 * bar's `ROUTE_ICONS` keys — are the parenthesized group names, NOT
 * `index`/`search`/… The bar iterates THIS navigator's four routes, so it
 * renders exactly four tabs and never a nested detail as a phantom tab;
 * active tab derives from this top-level navigator's `state.index`.
 *
 * The center "+" (quick-log) is NOT a tab — it's a non-route action the bar
 * injects between Search and Activity (opening the `/quick-log` root modal),
 * so it isn't declared here.
 *
 * The per-tab visuals (icon, active accent, surface) + the injected "+" all
 * live in `BottomTabBar`; here we only declare the tab SET and their labels.
 * `headerShown: false` because screens render their own chrome. Keep this
 * list the single source of the tab order — the custom bar is data-driven off
 * it. Adding a tab is one Screen here (named to match its group) plus one
 * icon entry in `BottomTabBar`.
 */
import { Tabs } from "expo-router/js-tabs";

import BottomTabBar from "@/components/nav/bottom-tab-bar";

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="(index)" options={{ title: "Home" }} />
      <Tabs.Screen name="(search)" options={{ title: "Search" }} />
      <Tabs.Screen name="(activity)" options={{ title: "Activity" }} />
      <Tabs.Screen name="(profile)" options={{ title: "Profile" }} />
    </Tabs>
  );
}
