/**
 * Custom bottom tab bar — the persistent app shell navbar. Replaces the
 * OS-native `NativeTabs`; renders identically on iOS/Android in the
 * Intertaind near-black + neon look (web's visual language).
 *
 * Wired as expo-router `Tabs`' `tabBar={(props) => <BottomTabBar {...props} />}`.
 * Follows the standard react-navigation custom-tabBar contract:
 *   - iterate `props.state.routes`; the active tab is `props.state.index`
 *   - per-route options live in `props.descriptors[route.key].options`
 *     (label falls back options.tabBarLabel → options.title → route.name)
 *   - on tap, emit a cancelable `tabPress` and navigate only if the tab
 *     isn't already focused and no listener called preventDefault
 * (see the reference impl in expo-router's
 *  react-navigation/bottom-tabs/views/BottomTabBar).
 *
 * Data-driven: the per-tab icon comes from ROUTE_ICONS keyed by route
 * name, so adding a tab later is just a new `Tabs.Screen` in app-tabs +
 * one entry here (designed for ~5 slots; unknown routes fall back to the
 * Circle glyph rather than crashing).
 *
 * Coloring: lucide-react-native icons render through react-native-svg,
 * so their color comes from the `color` PROP (a hex from the `colors`
 * token object), NOT a NativeWind className — className color utilities
 * don't reach the SVG (same rule as star-rating.tsx / status-badge.tsx).
 * The active tab uses the neon brand accent; inactive tabs are muted.
 * Chrome (surface, border, label text) uses className tokens.
 */
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Circle,
  Compass,
  TrendingUp,
  type LucideIcon,
} from "lucide-react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { colors } from "@intertaind/design-system";

/**
 * Route-name → lucide glyph. Keyed by the file-based route name (the
 * `Tabs.Screen name`), so it stays in lockstep with `app-tabs.tsx`.
 *
 * Each tab is now a Stack living in the array-group folder
 * `(tabs)/(index,explore)/`, so the Tabs navigator's route names are the
 * GROUP names `(index)`/`(explore)` (expo-router keeps the parentheses
 * for group directories) — the keys below match those, NOT `index`/
 * `explore`. The bar iterates the Tabs navigator's two group routes, so
 * exactly two tabs render (the shared `media` detail lives INSIDE a
 * stack, never as a sibling tab).
 *
 * Unknown routes render `Circle` (never crash) — keeps the bar tolerant
 * while tabs are still being decided (see the plan's tab-set follow-up).
 */
const ROUTE_ICONS: Record<string, LucideIcon> = {
  "(index)": TrendingUp,
  "(explore)": Compass,
};

/**
 * The bar's own geometry, in points — the SINGLE SOURCE OF TRUTH for how
 * tall this custom bar is above the safe-area inset. Kept as named
 * constants (not just inline Tailwind classes) so `use-bottom-inset.ts`
 * can reserve the SAME space for scrollable screens without re-measuring.
 *
 * Why constants instead of react-navigation's `useBottomTabBarHeight()`:
 * that hook returns the *measured* height of the DEFAULT bar, but our bar
 * is a fully custom `tabBar` that never reports its layout back to the
 * navigator's height-callback context — so the hook falls back to
 * react-navigation's hardcoded UIKit constant (49 + inset), which does
 * NOT match our layout. Composing the inset from these constants (the
 * exact values our JSX uses) is the accurate, durable path. See
 * `use-bottom-inset.ts`.
 *
 * BAR_CONTENT_HEIGHT tracks the per-tab column below (`pt-2` + icon +
 * `gap-1` + a single label line). If you change that JSX, change these.
 */
const BAR_PADDING_TOP = 8; // pt-2 on each tab column
const BAR_ICON_SIZE = 24; // drives <Icon size={BAR_ICON_SIZE} /> below
const BAR_ICON_LABEL_GAP = 4; // gap-1 between icon and label
const BAR_LABEL_HEIGHT = 16; // one line of text-xs (12) at ~1.33 line-height
/** Bar height ABOVE the safe-area inset (the inset is added separately). */
export const BAR_CONTENT_HEIGHT =
  BAR_PADDING_TOP + BAR_ICON_SIZE + BAR_ICON_LABEL_GAP + BAR_LABEL_HEIGHT;
/**
 * Minimum bottom padding on inset-less devices so labels never sit flush
 * against the screen edge. Mirrors the `Math.max(insets.bottom, …)` below.
 */
export const BAR_MIN_BOTTOM_PADDING = 8;

export default function BottomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      // Near-black raised surface + a top hairline border, matching web's
      // dark/neon navbar. `paddingBottom` clears the home indicator via
      // the safe-area inset (falls back to a small pad on inset-less
      // devices so labels never sit flush against the edge).
      className="flex-row border-t border-surface-border bg-surface-raised"
      style={{ paddingBottom: Math.max(insets.bottom, BAR_MIN_BOTTOM_PADDING) }}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = index === state.index;

        // Standard label fallback: explicit string label → title → the
        // route name. (A function tabBarLabel isn't used by our tabs.)
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : options.title != null
              ? options.title
              : route.name;

        const accessibilityLabel =
          options.tabBarAccessibilityLabel ?? `${label} tab`;

        const Icon = ROUTE_ICONS[route.name] ?? Circle;
        const tint = focused ? colors.brand : colors["text-muted"];

        const onPress = () => {
          // Cancelable tabPress, then navigate only if not already
          // focused and no listener prevented default — the documented
          // custom-tabBar contract.
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={accessibilityLabel}
            className="flex-1 items-center justify-center gap-1 pt-2 active:opacity-70"
          >
            <Icon size={BAR_ICON_SIZE} color={tint} />
            <Text
              className={`text-xs font-medium ${
                focused ? "text-brand" : "text-text-muted"
              }`}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
