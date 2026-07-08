/**
 * Profile tab — the viewer's OWN profile. The `(profile)` tab anchor renders
 * the shared `ProfileView` for the signed-in user, resolved BY `user.id` (from
 * `useAuth` — there's no username on the auth user). Anyone ELSE's profile
 * opens through the shared `u/[username]` route (like `media/[id]`); this tab
 * is always the viewer's own, so no back affordance (`showBack` defaults false).
 *
 * The Sign out control lives inside `ProfileView` (the owner-only Overview
 * affordance) until a settings surface exists — see profile-view.tsx.
 *
 * Headerless tab anchor: `ProfileView` reserves the top safe-area itself (see
 * apps/mobile/AGENTS.md). While `useAuth` settles (no `user` yet) we render a
 * spinner rather than a broken empty state.
 */
import { ActivityIndicator, View } from "react-native";
import { colors } from "@intertaind/design-system";

import { useAuth } from "@/components/auth-provider";
import { ProfileView } from "@/components/profile/profile-view";

export default function ProfileScreen() {
  const { user } = useAuth();

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-default">
        <ActivityIndicator color={colors["text-muted"]} />
      </View>
    );
  }

  return <ProfileView userId={user.id} />;
}
