/**
 * Per-tab Stack — the SHARED layout for both tabs.
 *
 * This lives in the ARRAY-GROUP folder `(index,explore)/`, which
 * expo-router extrapolates into two real layouts at build time:
 * `(index)/_layout` and `(explore)/_layout` (see the expo-router
 * SDK-56 source: `getRoutesCore.js` `extrapolateGroups`, and
 * `matchers.js` `matchArrayGroupName`). So each tab gets its OWN Stack
 * instance — and its own back stack.
 *
 * The `media/[id]` detail screen is a SHARED route (it lives beside
 * this file in the array-group folder), so it exists inside BOTH
 * stacks. `router.push("/media/<id>")` from a screen therefore pushes
 * the detail ONTO the current tab's stack — which is why the custom
 * bottom navbar (rendered by `(tabs)/_layout.tsx` ABOVE this Stack)
 * stays visible on detail, native/gesture back returns within the
 * tab, and detail→detail works (each push is a new instance). This is
 * the doc-blessed "shared routes" pattern for SDK 56.
 *
 * Per-group anchor (initial route): expo-router auto-anchors each
 * extrapolated group to the child whose route name matches the group
 * name — group `(index)` → `index.tsx`, group `(explore)` →
 * `explore.tsx` (the `childMatchingGroup` default in
 * `getRoutesCore.js`). That's exactly why the tab screens keep the
 * names `index`/`explore`, so NO `unstable_settings` anchor override
 * is needed here. `media/[id]` is never an anchor, so a cold start on
 * a detail URL mounts the tab's home screen beneath it.
 *
 * `headerShown: false` by default; the detail screen opts its own
 * transparent header back in via `<Stack.Screen options>`.
 */
import { Stack } from "expo-router";

export default function TabStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
