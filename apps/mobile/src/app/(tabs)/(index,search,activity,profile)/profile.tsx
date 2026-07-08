/**
 * Profile tab — placeholder. The real screen (Phase 2) is the viewer's own
 * profile: header (avatar / name / counts) + segmented Overview / Shelves /
 * Recommendations / Lists, mirroring web's `/u/[username]` (own view). Other
 * users' profiles will resolve through a shared `u/[username]` route (like
 * `media/[id]` / `person/[id]`).
 *
 * For now it also hosts the Sign out control (relocated from the removed
 * Explore tab) so the action isn't lost until the full account surface lands.
 *
 * Headerless tab anchor (the per-tab Stack hides headers), so it reserves the
 * top safe-area itself — see apps/mobile/AGENTS.md.
 */
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@intertaind/design-system";

import { useSignOutMutation } from "@/queries/auth";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const signOut = useSignOutMutation();

  return (
    <View
      className="flex-1 gap-4 bg-surface-default px-6"
      style={{ paddingTop: insets.top + 16 }}
    >
      <Text className="text-2xl font-semibold text-text-primary">Profile</Text>
      <Text className="text-sm text-text-secondary">Coming soon.</Text>

      {/* Sign out — temporary home until the account/settings surface lands.
          On success onAuthStateChange clears the session and the root gating
          redirects to login; the screen never navigates itself. */}
      <Pressable
        className="mt-2 items-center rounded-lg bg-brand px-4 py-3 active:opacity-70"
        onPress={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        {signOut.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-primary">Sign out</Text>
        )}
      </Pressable>

      {signOut.error ? (
        <Text className="text-sm text-text-muted">{signOut.error.message}</Text>
      ) : null}
    </View>
  );
}
