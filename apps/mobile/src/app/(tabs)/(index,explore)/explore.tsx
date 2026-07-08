/**
 * Explore tab — placeholder screen that also hosts the sign-out control
 * for now. Sign-out is a signed-in-only action, so a tab screen is a
 * fine home for it until we build a proper account/settings surface.
 *
 * On success we do NOTHING navigation-wise: onAuthStateChange clears the
 * session and the root gating in `src/app/_layout.tsx` redirects to
 * login. The screen never navigates itself.
 */

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@intertaind/design-system";

import { useSignOutMutation } from "@/queries/auth";

export default function ExploreScreen() {
  const signOut = useSignOutMutation();
  // Headerless tab anchor — reserve the top safe-area so content clears the
  // status bar / camera notch.
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 gap-4 bg-surface-default px-6"
      style={{ paddingTop: insets.top + 16 }}
    >
      <Pressable
        className="items-center rounded-lg bg-brand px-4 py-3"
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

      <Text className="text-2xl font-semibold text-text-primary">Explore</Text>
      <Text className="text-sm text-text-secondary">Coming soon.</Text>
    </View>
  );
}
