/**
 * List detail — a single curated list at `list/<id>`.
 *
 * SHARED route inside the tab navigator: this file lives in the array-group
 * folder `(tabs)/(index,search,activity,profile)/list/[id].tsx`, so expo-router
 * extrapolates it into ALL FOUR per-tab Stacks (like `media/[id]` /
 * `u/[username]`). `router.push("/list/<id>")` — from the profile Lists tab, the
 * profile Recs, or the home Popular Lists rail — pushes it onto the CURRENT
 * tab's stack, beneath the persistent bottom navbar; native/gesture back returns
 * within that tab.
 *
 * Thin by design: resolve the id and hand it to the shared `ListDetailView`,
 * which owns the fetch (`useListDetail`), the pending/error/not-found states,
 * and the whole screen body.
 *
 * Route note: after ADDING this file, restart Metro with `--clear` so the typed
 * routes regenerate (the `/list/[id]` href) and the bundler picks up the new
 * shared route — see apps/mobile/AGENTS.md.
 */
import { useLocalSearchParams } from "expo-router";

import { ListDetailView } from "@/components/lists/list-detail-view";

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListDetailView listId={id} />;
}
