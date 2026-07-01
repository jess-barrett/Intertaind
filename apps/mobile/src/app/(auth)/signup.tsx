/**
 * Email/password sign-up screen.
 *
 * Username is validated client-side with the shared `validateUsername`
 * rule (same rule the mutation re-checks) so the user sees the error
 * inline before submitting. The mutation stores the normalized username
 * in `user_metadata`; Task 6's setup-username flow / a DB trigger turns
 * that into the profile row.
 *
 * On success we do NOTHING navigation-wise — root gating in
 * `src/app/_layout.tsx` handles the redirect once the session appears.
 * NOTE: if Supabase email confirmation is ENABLED, signUp does not
 * return a session, so no auto-redirect happens until the user confirms.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { validateUsername } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { useSignUpMutation } from "@/queries/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const signUp = useSignUpMutation();

  // Inline pre-submit hint: only surface once the user has typed
  // something, so an empty field doesn't scream at them on load.
  const usernameCheck = validateUsername(username);
  const usernameError =
    username.length > 0 && !usernameCheck.ok ? usernameCheck.error : null;

  const submit = () => {
    if (signUp.isPending) return;
    signUp.mutate({ email: email.trim(), password, username });
  };

  return (
    <View className="flex-1 justify-center gap-4 bg-surface-default px-6">
      <Text className="text-2xl font-semibold text-text-primary">
        Create account
      </Text>

      <View className="gap-2">
        <Text className="text-sm text-text-secondary">Email</Text>
        <TextInput
          className="rounded-lg bg-surface-raised px-4 py-3 text-text-primary"
          accessibilityLabel="Email"
          placeholder="you@example.com"
          placeholderTextColor={colors["text-muted"]}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!signUp.isPending}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm text-text-secondary">Username</Text>
        <TextInput
          className="rounded-lg bg-surface-raised px-4 py-3 text-text-primary"
          accessibilityLabel="Username"
          placeholder="your_handle"
          placeholderTextColor={colors["text-muted"]}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          editable={!signUp.isPending}
        />
        {usernameError ? (
          <Text className="text-xs text-text-muted">{usernameError}</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-sm text-text-secondary">Password</Text>
        <TextInput
          className="rounded-lg bg-surface-raised px-4 py-3 text-text-primary"
          accessibilityLabel="Password"
          placeholder="••••••••"
          placeholderTextColor={colors["text-muted"]}
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!signUp.isPending}
          onSubmitEditing={submit}
        />
      </View>

      {signUp.error ? (
        <Text className="text-sm text-text-muted">{signUp.error.message}</Text>
      ) : null}

      {signUp.data?.needsConfirmation ? (
        <View className="gap-1">
          <Text className="text-sm text-text-primary">
            Check your email to confirm your account, then sign in.
          </Text>
          <Link
            href="/(auth)/login"
            className="text-sm font-semibold text-text-primary"
          >
            Go to sign in
          </Link>
        </View>
      ) : null}

      <Pressable
        className="items-center rounded-lg bg-brand px-4 py-3"
        onPress={submit}
        disabled={signUp.isPending}
      >
        {signUp.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-primary">Sign up</Text>
        )}
      </Pressable>

      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-surface-border" />
        <Text className="text-xs text-text-muted">or</Text>
        <View className="h-px flex-1 bg-surface-border" />
      </View>

      <GoogleSignInButton />

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-text-secondary">Have an account?</Text>
        <Link href="/(auth)/login" className="text-sm font-semibold text-text-primary">
          Sign in
        </Link>
      </View>
    </View>
  );
}
