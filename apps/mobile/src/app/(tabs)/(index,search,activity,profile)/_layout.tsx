/**
 * Per-tab Stack — the SHARED layout for all four tabs.
 *
 * This lives in the ARRAY-GROUP folder `(index,search,activity,profile)/`,
 * which expo-router extrapolates into four real layouts at build time:
 * `(index)/_layout`, `(search)/_layout`, `(activity)/_layout`,
 * `(profile)/_layout` (see the expo-router SDK-56 source:
 * `getRoutesCore.js` `extrapolateGroups`, and `matchers.js`
 * `matchArrayGroupName`). So each tab gets its OWN Stack instance — and its
 * own back stack.
 *
 * The `media/[id]` and `person/[id]` detail screens are SHARED routes (they
 * live beside this file in the array-group folder), so they exist inside ALL
 * four stacks. `router.push("/media/<id>")` from a screen therefore pushes
 * the detail ONTO the current tab's stack — which is why the custom bottom
 * navbar (rendered by `(tabs)/_layout.tsx` ABOVE this Stack) stays visible on
 * detail, native/gesture back returns within the tab, and detail→detail works
 * (each push is a new instance). This is the doc-blessed "shared routes"
 * pattern for SDK 56.
 *
 * Per-group anchor (initial route): expo-router auto-anchors each extrapolated
 * group to the child whose route name matches the group name — `(index)` →
 * `index.tsx`, `(search)` → `search.tsx`, `(activity)` → `activity.tsx`,
 * `(profile)` → `profile.tsx` (the `childMatchingGroup` default in
 * `getRoutesCore.js`). That's exactly why each tab screen is named after its
 * group, so NO `unstable_settings` anchor override is needed here. The detail
 * routes are never anchors, so a cold start on a detail URL mounts the tab's
 * home screen beneath it.
 *
 * `headerShown: false` by default; the detail screens render their own chrome
 * (media/[id] draws a custom scroll-fading top bar; person/[id] opts an opaque
 * native header back in via `<Stack.Screen options>`).
 */
import { Stack } from "expo-router";

export default function TabStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
