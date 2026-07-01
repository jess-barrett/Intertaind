/**
 * "Continue with Google" button — reusable on both the login and signup
 * screens. Drives `useGoogleSignInMutation`, which opens the OAuth web
 * browser and exchanges the returned code for a session.
 *
 * No navigation here: on success the new session fires onAuthStateChange
 * and root gating routes the user (see src/queries/auth.ts).
 *
 * User-cancel is not surfaced: the mutation returns quietly (no throw) when
 * the user closes the browser, so `mutation.error` stays null and no error
 * message renders — only genuine failures set `.error`.
 */

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@intertaind/design-system";

import { useGoogleSignInMutation } from "@/queries/auth";

// Completes an auth session that redirects back to a web popup. A documented
// no-op on native (returns "Not supported on this platform"), but it is the
// Expo-standard idiom and future-proofs a potential web target — see SDK 56
// WebBrowser.maybeCompleteAuthSession docs.
WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton() {
  const googleSignIn = useGoogleSignInMutation();

  return (
    <View className="gap-2">
      <Pressable
        className="items-center rounded-lg bg-surface-raised px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={() => {
          if (googleSignIn.isPending) return;
          googleSignIn.mutate();
        }}
        disabled={googleSignIn.isPending}
      >
        {googleSignIn.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-primary">
            Continue with Google
          </Text>
        )}
      </Pressable>

      {googleSignIn.error ? (
        <Text className="text-sm text-text-muted">
          {googleSignIn.error.message}
        </Text>
      ) : null}
    </View>
  );
}
