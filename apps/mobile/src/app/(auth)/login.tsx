/**
 * Email/password sign-in screen.
 *
 * On success we do NOTHING navigation-wise: AuthProvider's
 * onAuthStateChange fires, the root gating in `src/app/_layout.tsx`
 * sees the new session, and redirects into the app. Keeping redirects
 * in one place avoids double-navigation races.
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
import { colors } from "@intertaind/design-system";

import { useSignInMutation } from "@/queries/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignInMutation();

  const submit = () => {
    if (signIn.isPending) return;
    signIn.mutate({ email: email.trim(), password });
  };

  return (
    <View className="flex-1 justify-center gap-4 bg-surface-default px-6">
      <Text className="text-2xl font-semibold text-text-primary">Sign in</Text>

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
          editable={!signIn.isPending}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm text-text-secondary">Password</Text>
        <TextInput
          className="rounded-lg bg-surface-raised px-4 py-3 text-text-primary"
          accessibilityLabel="Password"
          placeholder="••••••••"
          placeholderTextColor={colors["text-muted"]}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!signIn.isPending}
          onSubmitEditing={submit}
        />
      </View>

      {signIn.error ? (
        <Text className="text-sm text-text-muted">{signIn.error.message}</Text>
      ) : null}

      <Pressable
        className="items-center rounded-lg bg-brand px-4 py-3"
        onPress={submit}
        disabled={signIn.isPending}
      >
        {signIn.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-primary">Sign in</Text>
        )}
      </Pressable>

      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-surface-border" />
        <Text className="text-xs text-text-muted">or</Text>
        <View className="h-px flex-1 bg-surface-border" />
      </View>

      <GoogleSignInButton />

      <View className="flex-row justify-center gap-1">
        <Text className="text-sm text-text-secondary">No account?</Text>
        <Link href="/(auth)/signup" className="text-sm font-semibold text-text-primary">
          Sign up
        </Link>
      </View>
    </View>
  );
}
