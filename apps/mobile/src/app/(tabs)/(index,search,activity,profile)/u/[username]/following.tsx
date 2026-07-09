/**
 * Following list — the users the profile at `u/<username>/following` follows.
 *
 * SHARED nested route inside the tab navigator: this file lives in the
 * array-group folder under `u/[username]/`, so expo-router extrapolates it into
 * ALL FOUR per-tab Stacks (like `media/[id]` / `u/[username]`).
 * `router.push("/u/<username>/following")` (the header's Following CountPill)
 * pushes it onto the CURRENT tab's stack — beneath the persistent bottom navbar,
 * with native/gesture back returning within that tab.
 *
 * Resolves the profile BY `username` (→ `profile.id`, the read key), then feeds
 * `useFollowing` into the shared `FollowListScreen`.
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/u/[username]/following` href) and the bundler picks
 * up the new shared route — see docs/plans/2026-07-08-mobile-profile.md +
 * apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { FollowListScreen } from "@/components/profile/follow-list-screen";
import { useFollowing, useProfile } from "@/queries/profile";

export default function FollowingScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useProfile({ username });
  const following = useFollowing(profile.data?.id);

  return (
    <FollowListScreen
      title="Following"
      emptyMessage="Not following anyone yet."
      query={following}
    />
  );
}
