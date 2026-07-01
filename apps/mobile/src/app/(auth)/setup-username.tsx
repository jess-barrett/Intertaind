/**
 * Username setup screen for a signed-in user with no profiles row yet
 * (OAuth/Apple users in later milestones; testable now by deleting your
 * own profile row). Root gating in `src/app/_layout.tsx` routes
 * `profileStatus === "missing"` here and won't let them into the tabs
 * until a profile exists.
 *
 * Submitting runs `useCreateProfileMutation`, which mirrors web's
 * `createInitialProfile`. On success we do NOTHING navigation-wise —
 * the mutation's `refreshProfileStatus` flips profileStatus to "present"
 * and root gating redirects to /(tabs). A "Sign out" escape keeps a user
 * who abandons setup from getting trapped on this screen.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { normalizeUsername, validateUsername } from "@intertaind/types";
import { colors } from "@intertaind/design-system";

import { useAuth } from "@/components/auth-provider";
import { useCreateProfileMutation, useSignOutMutation } from "@/queries/auth";

export default function SetupUsernameScreen() {
  const { user } = useAuth();
  const createProfile = useCreateProfileMutation();
  const signOut = useSignOutMutation();

  // Seed a suggestion from the user's name metadata (falls back to the
  // email prefix), normalized to our handle rules. It's just a starting
  // point — the user can edit it, and validateUsername runs on submit.
  const [username, setUsername] = useState(() =>
    normalizeUsername(
      String(user?.user_metadata?.name ?? user?.email?.split("@")[0] ?? "")
    )
  );

  // Inline pre-submit hint: only surface once the user has typed
  // something, so an empty field doesn't scream at them on load.
  const usernameCheck = validateUsername(username);
  const usernameError =
    username.length > 0 && !usernameCheck.ok ? usernameCheck.error : null;

  const submit = () => {
    if (createProfile.isPending) return;
    createProfile.mutate(username);
  };

  return (
    <View className="flex-1 justify-center gap-4 bg-surface-default px-6">
      <View className="gap-2">
        <Text className="text-2xl font-semibold text-text-primary">
          Pick a username
        </Text>
        <Text className="text-sm text-text-secondary">
          This is how people find and follow you on Intertaind.
        </Text>
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
          editable={!createProfile.isPending}
          onSubmitEditing={submit}
        />
        {usernameError ? (
          <Text className="text-xs text-text-muted">{usernameError}</Text>
        ) : null}
      </View>

      {createProfile.error ? (
        <Text className="text-sm text-text-muted">
          {createProfile.error.message}
        </Text>
      ) : null}

      <Pressable
        className="items-center rounded-lg bg-brand px-4 py-3"
        onPress={submit}
        disabled={createProfile.isPending}
      >
        {createProfile.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-primary">Continue</Text>
        )}
      </Pressable>

      <Pressable
        className="items-center py-2"
        onPress={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        <Text className="text-sm text-text-secondary">Sign out</Text>
      </Pressable>
    </View>
  );
}
