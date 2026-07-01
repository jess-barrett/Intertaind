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
import Svg, { Path } from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@intertaind/design-system";

import { useGoogleSignInMutation } from "@/queries/auth";

// Completes an auth session that redirects back to a web popup. A documented
// no-op on native (returns "Not supported on this platform"), but it is the
// Expo-standard idiom and future-proofs a potential web target — see SDK 56
// WebBrowser.maybeCompleteAuthSession docs.
WebBrowser.maybeCompleteAuthSession();

/**
 * Official Google "G" logo (4-color). These are Google's exact brand hex
 * values, NOT design-system tokens — Google's sign-in branding guidelines
 * require the real logo colors, so the raw hex here is intentional and must
 * not be "fixed" to theme tokens. Paths mirror the web button
 * (apps/web/src/components/google-sign-in-button.tsx) for consistency.
 */
function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
        fill="#4285F4"
      />
      <Path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <Path
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3-2.32z"
        fill="#FBBC05"
      />
      <Path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export function GoogleSignInButton() {
  const googleSignIn = useGoogleSignInMutation();

  return (
    <View className="gap-2">
      <Pressable
        className="flex-row items-center justify-center gap-3 rounded-lg bg-surface-raised px-4 py-3"
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
          <>
            <GoogleLogo />
            <Text className="font-semibold text-text-primary">
              Continue with Google
            </Text>
          </>
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
