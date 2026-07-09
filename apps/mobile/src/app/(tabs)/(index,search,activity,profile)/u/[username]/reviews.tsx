/**
 * Reviews feed — the profile's FULL reviews at `u/<username>/reviews` (M6b).
 *
 * SHARED nested route inside the tab navigator: this file lives in the
 * array-group folder under `u/[username]/`, so expo-router extrapolates it into
 * ALL FOUR per-tab Stacks (like `media/[id]` / `u/[username]` / activity).
 * `router.push("/u/<username>/reviews")` (the Overview "Recent reviews" See all
 * arrow) pushes it onto the CURRENT tab's stack — beneath the persistent bottom
 * navbar, with native/gesture back returning within that tab.
 *
 * Resolves the profile BY `username` (→ `profile.id`, the read key), then feeds
 * the paginated `useProfileReviewsPage` (activity_log filtered to
 * `activity_type = 'reviewed'`) into the shared `ActivityListScreen`.
 *
 * Activity source note (deferred M3 backlog): mobile tracking does NOT yet WRITE
 * `activity_log` rows — that activity-trigger work is deferred (see
 * docs/plans/2026-07-08-mobile-profile.md). This feed therefore populates from
 * WEB-sourced reviews for now; a sparse/empty feed is EXPECTED, not a bug.
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/u/[username]/reviews` href) and the bundler picks up
 * the new shared route — see docs/plans/2026-07-08-mobile-profile.md +
 * apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { ActivityListScreen } from "@/components/profile/activity-list-screen";
import { useProfile, useProfileReviewsPage } from "@/queries/profile";

export default function ReviewsScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = useProfile({ username });
  const reviews = useProfileReviewsPage(profile.data?.id);

  return (
    <ActivityListScreen
      title="Reviews"
      emptyMessage="No reviews yet."
      query={reviews}
    />
  );
}
