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
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
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
            <Icon size={24} color={tint} />
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
