/**
 * useBottomInset — the bottom space (in points) a scrollable screen must
 * reserve so its last content clears the persistent bottom navbar.
 *
 * The navbar is a custom `tabBar` (`components/nav/bottom-tab-bar.tsx`)
 * rendered by the JS `Tabs` navigator ABOVE the per-tab Stacks, so it
 * overlays the bottom of EVERY screen — Trending, Explore, and the shared
 * media detail. Any `ScrollView`/`FlatList` whose content can reach the
 * bottom edge must pad its `contentContainerStyle.paddingBottom` by this
 * value, or the last row hides behind the bar (see `apps/mobile/AGENTS.md`
 * → "Scrollable screens must clear the navbar").
 *
 * Why compose it here instead of react-navigation's `useBottomTabBarHeight()`
 * ─────────────────────────────────────────────────────────────────────────
 * `useBottomTabBarHeight()` IS importable (re-exported from
 * `expo-router/js-tabs`, no extra dependency) and its context DOES reach
 * nested Stack screens. BUT it returns the height of the DEFAULT bar: a
 * fully custom `tabBar` never reports its measured layout back to the
 * navigator's height-callback context, so the hook falls back to
 * react-navigation's hardcoded `TABBAR_HEIGHT_UIKIT` (49) + `insets.bottom`
 * — a value that does NOT match our bar's real geometry (icon 24 + label +
 * paddings) and, on inset-less devices, ignores our `Math.max(inset, 8)`
 * floor. Reserving that wrong number would leave content partly hidden.
 *
 * Instead we reconstruct the bar's TOTAL height from the exact constants
 * the bar's own JSX uses (`BAR_CONTENT_HEIGHT` + `Math.max(inset,
 * BAR_MIN_BOTTOM_PADDING)`), imported from the bar itself so the two can
 * never drift. This is the accurate, durable path for a custom tabBar.
 * (Verified against the installed expo-router SDK 56 / vendored
 * react-navigation source before choosing.)
 *
 * Returns a `number` (points) suitable for
 * `contentContainerStyle={{ paddingBottom }}`.
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BAR_CONTENT_HEIGHT,
  BAR_MIN_BOTTOM_PADDING,
} from "@/components/nav/bottom-tab-bar";

export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  // Mirror the bar's own `paddingBottom: Math.max(insets.bottom, 8)` so
  // the reserved space equals the bar's real on-screen height.
  return BAR_CONTENT_HEIGHT + Math.max(insets.bottom, BAR_MIN_BOTTOM_PADDING);
}
