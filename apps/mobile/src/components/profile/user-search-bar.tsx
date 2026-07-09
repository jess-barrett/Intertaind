/**
 * UserSearchBar — the profile screen's "find users" search, the RN mirror of
 * web's `UserSearchBar` (apps/web/src/components/user-search-bar.tsx). Web keeps
 * a `UserPlus` icon at the end of the profile nav that slides open into a
 * user-only search field; on mobile the profile's top row shows the same
 * `UserPlus` toggle beside the segmented control, and tapping it swaps the row
 * for a full-width search field (this component) with the results listed below.
 *
 * Searches USERS only (`useUserSearch` → a `profiles` ilike read, RLS-filtered),
 * NOT media — distinct from the Search TAB. The query is debounced (~250ms, web
 * parity) into `useUserSearch`; a result taps through to `/u/<username>` (and
 * closes the bar first via `UserRow`'s `onPress` override). The ✕ closes it.
 *
 * Mobile primitives only; `Image`/icons per the house rules; design tokens.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { UserPlus, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { UserRow } from "@/components/profile/user-row";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useUserSearch } from "@/queries/profile";

/** Debounce delay for the query string — web parity (user-search-bar). */
const DEBOUNCE_MS = 250;
/** Min chars before the hook invokes (matches useUserSearch's gate). */
const MIN_QUERY_LENGTH = 2;

export function UserSearchBar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the field into the search key — the field responds instantly, the
  // round trip fires once typing settles.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = useUserSearch(debouncedQuery);
  const results = search.data ?? [];
  const tooShort = debouncedQuery.trim().length < MIN_QUERY_LENGTH;

  function selectHit(username: string) {
    onClose();
    router.push(`/u/${username}`);
  }

  return (
    <View className="gap-2">
      {/* Full-width search field: UserPlus glyph · input · close. */}
      <View className="flex-row items-center gap-2 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2">
        <UserPlus size={16} color={colors["text-muted"]} />
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
          className="flex-1 text-sm text-text-primary"
          style={{ color: colors["text-primary"] }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close user search"
          hitSlop={8}
          className="active:opacity-60"
          onPress={onClose}
        >
          <X size={18} color={colors["text-muted"]} />
        </Pressable>
      </View>

      {/* Results — only once the query is long enough. */}
      {tooShort ? null : search.isPending ? (
        <View className="items-center py-4">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      ) : search.error ? (
        <Text className="px-1 py-3 text-sm text-accent-movie">
          {trackingErrorMessage(search.error, "the search", "user-search")}
        </Text>
      ) : results.length === 0 ? (
        <View className="rounded-sm border border-surface-border bg-surface-raised px-3 py-3">
          <Text className="text-sm text-text-muted">No users found.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: 360 }}
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
  );
}
