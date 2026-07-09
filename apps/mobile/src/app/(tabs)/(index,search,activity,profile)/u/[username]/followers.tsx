/**
 * Followers list — the users following the profile at `u/<username>/followers`.
 *
 * SHARED nested route inside the tab navigator: this file lives in the
 * array-group folder under `u/[username]/`, so expo-router extrapolates it into
 * ALL FOUR per-tab Stacks (like `media/[id]` / `u/[username]`).
 * `router.push("/u/<username>/followers")` (the header's Followers CountPill)
 * pushes it onto the CURRENT tab's stack — beneath the persistent bottom navbar,
 * with native/gesture back returning within that tab.
 *
 * Resolves the profile BY `username` (→ `profile.id`, the read key), then feeds
 * `useFollowers` into the shared `FollowListScreen`. The nested folder means the
 * base profile route moved to `u/[username]/index.tsx` — same screen, no change.
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/u/[username]/followers` href) and the bundler picks
 * up the new shared route — see docs/plans/2026-07-08-mobile-profile.md +
 * apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { FollowListScreen } from "@/components/profile/follow-list-screen";
import { useFollowers, useProfile } from "@/queries/profile";

export default function FollowersScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useProfile({ username });
  // The list read gates on the resolved id inside the hook (enabled: !!userId),
  // so it stays dormant until the profile resolves; passing undefined is safe.
  const followers = useFollowers(profile.data?.id);

  return (
    <FollowListScreen
      title="Followers"
      emptyMessage="No followers yet."
      query={followers}
    />
  );
}
