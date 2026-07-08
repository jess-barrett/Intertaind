/**
 * User profile by username — anyone else's profile.
 *
 * SHARED route inside the tab navigator: this file lives in the array-group
 * folder `(tabs)/(index,search,activity,profile)/u/[username].tsx`, so
 * expo-router extrapolates it into ALL FOUR per-tab Stacks (like `media/[id]`
 * and `person/[id]`). `router.push("/u/<username>")` therefore pushes it onto
 * the CURRENT tab's stack — beneath the persistent bottom navbar (which stays
 * visible), and native/gesture back returns within that tab.
 *
 * The per-tab Stack hides headers, so this is pushed WITH a back affordance:
 * `ProfileView showBack` renders the same translucent back pill media detail
 * uses. It resolves the profile BY the `username` route param (the viewer's own
 * profile is the `(profile)` tab, resolved by id — see profile.tsx).
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/u/[username]` href) and the bundler picks up the new
 * shared route — see docs/plans/2026-07-08-mobile-profile.md + apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { ProfileView } from "@/components/profile/profile-view";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileView username={username} showBack />;
}
