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
/** Bar / collapsed-button height (also the collapsed width — a circle). */
const BAR_HEIGHT = 40;
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

  // Expanded width: grow leftward toward (but not over) the avatar. Capped so
  // it stays a comfortable field on any width.
  const expandedWidth = Math.min(300, width - 120);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useUserSearch(debouncedQuery);
  const results = search.data ?? [];
  const tooShort = debouncedQuery.trim().length < MIN_QUERY_LENGTH;

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
        }}
        className="flex-row items-center overflow-hidden rounded-full border border-surface-border bg-surface-raised"
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
            className="min-w-0 flex-1 pl-4 text-sm text-text-primary"
            style={{ color: colors["text-primary"] }}
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
            top: BAR_HEIGHT + 6,
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
            <ScrollView
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              className="overflow-hidden rounded-sm border border-surface-border bg-surface-raised"
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
