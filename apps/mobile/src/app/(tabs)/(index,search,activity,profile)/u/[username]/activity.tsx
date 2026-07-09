/**
 * Activity feed — the profile's FULL activity at `u/<username>/activity` (M6b).
 *
 * SHARED nested route inside the tab navigator: this file lives in the
 * array-group folder under `u/[username]/`, so expo-router extrapolates it into
 * ALL FOUR per-tab Stacks (like `media/[id]` / `u/[username]` / followers).
 * `router.push("/u/<username>/activity")` (the Overview "Recent activity" See
 * all arrow) pushes it onto the CURRENT tab's stack — beneath the persistent
 * bottom navbar, with native/gesture back returning within that tab.
 *
 * Resolves the profile BY `username` (→ `profile.id`, the read key), then feeds
 * the paginated `useProfileActivityPage` into the shared `ActivityListScreen`.
 *
 * Activity source note (deferred M3 backlog): mobile tracking does NOT yet WRITE
 * `activity_log` rows — that activity-trigger work is deferred (see
 * docs/plans/2026-07-08-mobile-profile.md). This feed therefore populates from
 * WEB-sourced activity for now; a sparse/empty feed is EXPECTED, not a bug.
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/u/[username]/activity` href) and the bundler picks up
 * the new shared route — see docs/plans/2026-07-08-mobile-profile.md +
 * apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { ActivityListScreen } from "@/components/profile/activity-list-screen";
import { useProfile, useProfileActivityPage } from "@/queries/profile";

export default function ActivityScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useProfile({ username });
  // The paginated read gates on the resolved id inside the hook (enabled:
  // !!userId), so it stays dormant until the profile resolves; undefined is safe.
  const activity = useProfileActivityPage(profile.data?.id);

  return (
    <ActivityListScreen
      title="Activity"
      emptyMessage="No activity yet."
      query={activity}
    />
  );
}
