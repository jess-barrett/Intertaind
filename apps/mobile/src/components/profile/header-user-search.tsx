/**
 * HeaderUserSearch — the "find users" control that lives in the profile
 * header's right column, directly beneath the settings gear (or Follow). The
 * RN take on web's `UserSearchBar` (apps/web/src/components/user-search-bar.tsx),
 * adapted to a phone: collapsed it's a circular `UserPlus` button; tapping it
 * SLIDES OUT to the LEFT into a search field (the button becomes the field's
 * right cap), and the results show as a connected dropdown BENEATH the field.
 *
 * ── No layout shift ─────────────────────────────────────────────────────
 * The sliding bar + the results dropdown are ABSOLUTELY positioned, anchored to
 * the right (`right: 0`) so they grow leftward OVER the header/content without
 * pushing anything. A fixed 40×40 spacer reserves the collapsed footprint in
 * the header's flex column, so opening/closing never reflows the header. The
 * width change is animated with `LayoutAnimation` (the "slide").
 *
 * ── Users only ──────────────────────────────────────────────────────────
 * `useUserSearch` → a `profiles` ilike read (RLS-filtered), NOT media — distinct
 * from the Search tab. The query is debounced (~250ms, web parity); a result
 * taps through to `/u/<username>` and closes the bar. The ✕ (the same right-cap
 * button, now an X) closes it.
 *
 * Mobile primitives only; `Image`/icons per the house rules; design tokens.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { UserPlus, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { UserRow } from "@/components/profile/user-row";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useUserSearch } from "@/queries/profile";

// LayoutAnimation is opt-in on Android (a no-op toggle on iOS).
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Debounce delay for the query string — web parity (user-search-bar). */
const DEBOUNCE_MS = 250;
/** Min chars before the hook invokes (matches useUserSearch's gate). */
const MIN_QUERY_LENGTH = 2;
/** Bar / collapsed-button height (also the collapsed width — a circle). Matches
 *  the settings gear's explicit size so the two buttons are identical. */
const BAR_HEIGHT = 36;
/** Corner radius for the OPEN bar's left edge — "rounded small" (the right edge
 *  stays a circular cap, matching the collapsed button it grows from). */
const OPEN_LEFT_RADIUS = 6;
/** Results-dropdown corners: SQUARE top (joins the bar seamlessly) + rounded
 *  small bottom. */
const DROPDOWN_RADII = {
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: OPEN_LEFT_RADIUS,
  borderBottomRightRadius: OPEN_LEFT_RADIUS,
} as const;
/** The slide-out/collapse tween (the "slide"). */
const SLIDE = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

export function HeaderUserSearch() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Expanded width: ~2/3 of the earlier full width — a compact field that grows
  // leftward. Capped so it stays reasonable on any screen width.
  const expandedWidth = Math.round(Math.min(300, width - 120) * (2 / 3));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useUserSearch(debouncedQuery);
  const results = search.data ?? [];
  const tooShort = debouncedQuery.trim().length < MIN_QUERY_LENGTH;
  // A results LIST is attached below → the bar squares its bottom to join it.
  // Otherwise (idle, loading, empty, error) the bar keeps a rounded bottom and
  // any state box floats as a separate rounded card.
  const hasResults = open && !tooShort && results.length > 0;

  function toggle(next: boolean) {
    LayoutAnimation.configureNext(SLIDE);
    setOpen(next);
    if (!next) setQuery("");
  }

  function selectHit(username: string) {
    toggle(false);
    router.push(`/u/${username}`);
  }

  return (
    // 40×40 spacer reserves the collapsed footprint in the header's flex column
    // so the absolute bar/dropdown overlay leftward without shifting anything.
    <View style={{ width: BAR_HEIGHT, height: BAR_HEIGHT }}>
      {/* The bar — right-anchored, width animates 40 → expandedWidth (slides
          out left). Circle when collapsed, pill when open. */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          height: BAR_HEIGHT,
          width: open ? expandedWidth : BAR_HEIGHT,
          // TOP corners when open: left rounded-sm, right circular cap.
          // BOTTOM corners: when a results list is attached (`hasResults`) both
          // are SQUARE so the dropdown joins seamlessly; otherwise the bar is a
          // self-contained shape (bottom-left rounded-sm, bottom-right circular).
          // Collapsed: a full circle.
          borderTopRightRadius: BAR_HEIGHT / 2,
          borderTopLeftRadius: open ? OPEN_LEFT_RADIUS : BAR_HEIGHT / 2,
          borderBottomLeftRadius: !open
            ? BAR_HEIGHT / 2
            : hasResults
              ? 0
              : OPEN_LEFT_RADIUS,
          borderBottomRightRadius: !open || !hasResults ? BAR_HEIGHT / 2 : 0,
        }}
        // Collapsed: a border-only circle that MATCHES the settings gear (no
        // fill). Open: fill with surface-raised so it reads as a search field.
        className={`flex-row items-center overflow-hidden border border-surface-border ${
          open ? "bg-surface-raised" : ""
        }`}
      >
        {open ? (
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Find users…"
            placeholderTextColor={colors["text-muted"]}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Find users"
            textAlignVertical="center"
            className="min-w-0 flex-1 pl-4 text-sm text-text-primary"
            // Fill the bar height + zero vertical padding so the text sits on
            // the vertical center (not riding high).
            style={{
              color: colors["text-primary"],
              height: BAR_HEIGHT,
              paddingVertical: 0,
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Close user search" : "Find users"}
          className="items-center justify-center active:opacity-70"
          style={{ width: BAR_HEIGHT, height: BAR_HEIGHT }}
          onPress={() => toggle(!open)}
        >
          {open ? (
            <X size={18} color={colors["text-secondary"]} />
          ) : (
            <UserPlus size={20} color={colors["text-secondary"]} />
          )}
        </Pressable>
      </View>

      {/* Results — a connected dropdown beneath the bar, right-anchored + over
          the page (absolute, so it never shifts content). */}
      {open && !tooShort ? (
        <View
          style={{
            position: "absolute",
            // Results list joins the bar flush (connected); the transient
            // loading/empty/error states float just below as a separate card.
            top: hasResults ? BAR_HEIGHT : BAR_HEIGHT + 6,
            right: 0,
            width: expandedWidth,
            zIndex: 30,
            elevation: 8,
          }}
        >
          {search.isPending ? (
            <View className="items-center rounded-sm border border-surface-border bg-surface-raised py-4">
              <ActivityIndicator color={colors["text-muted"]} />
            </View>
          ) : search.error ? (
            <View className="rounded-sm border border-surface-border bg-surface-raised px-3 py-3">
              <Text className="text-sm text-accent-movie">
                {trackingErrorMessage(search.error, "the search", "user-search")}
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View className="rounded-sm border border-surface-border bg-surface-raised px-3 py-3">
              <Text className="text-sm text-text-muted">No users found.</Text>
            </View>
          ) : (
            // Results list — SQUARE top (joins the squared bar), rounded bottom.
            <ScrollView
              style={{ maxHeight: 320, ...DROPDOWN_RADII }}
              keyboardShouldPersistTaps="handled"
              className="overflow-hidden border border-surface-border bg-surface-raised"
            >
              {results.map((hit) => (
                <UserRow
                  key={hit.id}
                  user={hit}
                  isPrivate={hit.is_private}
                  onPress={() => selectHit(hit.username)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
