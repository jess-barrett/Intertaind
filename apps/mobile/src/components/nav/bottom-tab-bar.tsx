/**
 * Custom bottom tab bar — the persistent app shell navbar. Replaces the
 * OS-native `NativeTabs`; renders identically on iOS/Android in the
 * Intertaind dark + neon look (web's visual language).
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
 * ── Layout: 4 tabs + an injected center "+" ────────────────────────────
 * The visible order is Home · Search · [+] · Activity · Profile. Only the
 * four are navigator tabs (iterated from `state.routes`); the "+" is a
 * NON-route action injected at the horizontal midpoint that opens the
 * `/quick-log` root modal (a focused create flow over the whole app). It
 * never participates in tab focus/navigation — it just `router.push`es.
 *
 * Data-driven: the per-tab icon comes from ROUTE_ICONS keyed by route name,
 * so adding a tab is a new `Tabs.Screen` in app-tabs + one entry here
 * (unknown routes fall back to the Circle glyph rather than crashing).
 *
 * Coloring: lucide-react-native icons render through react-native-svg, so
 * their color comes from the `color` PROP (a hex from the `colors` token
 * object), NOT a NativeWind className — className color utilities don't reach
 * the SVG (same rule as star-rating.tsx / status-badge.tsx). The active tab
 * uses the neon brand accent; inactive tabs are muted. Chrome (surface,
 * border, label text) uses className tokens.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity,
  Circle,
  Home,
  Plus,
  Search,
  User,
  type LucideIcon,
} from "lucide-react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { colors } from "@intertaind/design-system";

/**
 * Route-name → lucide glyph. Keyed by the file-based route name (the
 * `Tabs.Screen name`), so it stays in lockstep with `app-tabs.tsx`.
 *
 * Each tab is a Stack in the array-group folder
 * `(tabs)/(index,search,activity,profile)/`, so the Tabs navigator's route
 * names are the GROUP names `(index)` / `(search)` / `(activity)` /
 * `(profile)` (expo-router keeps the parentheses for group directories) —
 * the keys below match those. The bar iterates the navigator's four group
 * routes, so exactly four tabs render (the shared `media`/`person` detail
 * routes live INSIDE a stack, never as sibling tabs).
 *
 * Unknown routes render `Circle` (never crash).
 */
const ROUTE_ICONS: Record<string, LucideIcon> = {
  "(index)": Home,
  "(search)": Search,
  "(activity)": Activity,
  "(profile)": User,
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
 * The center "+" is sized to fit within the same content height.
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

/** Diameter (pt) of the center "+" action's filled brand circle. Sized to
 *  the content-row height so it reads as a prominent, aligned action. */
const CENTER_BUTTON_SIZE = 44;

/**
 * The center "+" — a NON-route action (not a tab) that opens the quick-log
 * root modal. A filled brand circle occupying one flex-1 slot so it sits
 * centered between Search and Activity, aligned with the tab columns.
 */
function CenterAction() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick log"
        className="items-center justify-center rounded-full bg-brand active:opacity-80"
        style={{ width: CENTER_BUTTON_SIZE, height: CENTER_BUTTON_SIZE }}
        onPress={() => router.push("/quick-log")}
      >
        <Plus size={26} color={colors["text-primary"]} />
      </Pressable>
    </View>
  );
}

export default function BottomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Build the tab columns, then splice the center "+" in at the horizontal
  // midpoint (index 2 for four tabs → Home · Search · [+] · Activity · Profile).
  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const focused = index === state.index;

    // Standard label fallback: explicit string label → title → route name.
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
      // Cancelable tabPress, then navigate only if not already focused and no
      // listener prevented default — the documented custom-tabBar contract.
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
  });

  const midpoint = Math.floor(tabs.length / 2);
  const items = [
    ...tabs.slice(0, midpoint),
    <CenterAction key="center-action" />,
    ...tabs.slice(midpoint),
  ];

  return (
    <View
      // Raised surface + a top hairline border, matching web's dark/neon
      // navbar. `paddingBottom` clears the home indicator via the safe-area
      // inset (falls back to a small pad on inset-less devices so labels never
      // sit flush against the edge).
      className="flex-row border-t border-surface-border bg-surface-raised"
      style={{ paddingBottom: Math.max(insets.bottom, BAR_MIN_BOTTOM_PADDING) }}
      accessibilityRole="tablist"
    >
      {items}
    </View>
  );
}
