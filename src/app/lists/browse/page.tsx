import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BrowseListRow from "@/components/lists/browse-list-row";
import ListSortSelector from "@/components/lists/list-sort-selector";
import {
  LIST_SORT_OPTIONS,
  type ListSortKey,
} from "@/components/lists/list-sort-options";
import type { List, Profile } from "@/lib/types";

const PREVIEW_COUNT = 10;
const RESULTS_LIMIT = 30;

type ListWithProfile = List & { profiles: Profile };

function isSortKey(s: string | undefined): s is ListSortKey {
  return !!s && LIST_SORT_OPTIONS.some((o) => o.value === s);
}

export default async function BrowseListsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const params = await searchParams;
  // Default sort matches the entry-point button on /lists ("More" on
  // the Popular this week section), so following that link lands on
  // the same ordering they were already browsing.
  const sort: ListSortKey = isSortKey(params.sort) ? params.sort : "popular_week";

  const supabase = await createClient();
  const lists = await fetchLists(supabase, sort);

  // Bulk cover fetch — first 10 per list. Same pattern as /lists, just
  // with PREVIEW_COUNT bumped to 10 since the row is wider here.
  const coversByList: Record<string, { src: string | null; title: string }[]> =
    {};
  if (lists.length > 0) {
    const listIds = lists.map((l) => l.id);
    const { data: items } = await supabase
      .from("list_items")
      .select("list_id, position, media_items(id, title, cover_image_url)")
      .in("list_id", listIds)
      .order("position", { ascending: true })
      .limit(lists.length * PREVIEW_COUNT * 2);

    type ItemRow = {
      list_id: string;
      position: number;
      media_items: { id: string; title: string; cover_image_url: string | null };
    };
    for (const row of (items as ItemRow[] | null) ?? []) {
      const arr = coversByList[row.list_id] ?? [];
      if (arr.length >= PREVIEW_COUNT) continue;
      arr.push({
        src: row.media_items.cover_image_url,
        title: row.media_items.title,
      });
      coversByList[row.list_id] = arr;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/lists"
          className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
          Back to Lists
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Browse Lists</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Sort the community catalog. Default order is whatever&apos;s
            getting the most love this week.
          </p>
        </div>
        <ListSortSelector value={sort} />
      </div>

      {lists.length > 0 ? (
        <div>
          {lists.map((list) => (
            <BrowseListRow
              key={list.id}
              list={list}
              profile={list.profiles}
              covers={coversByList[list.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg text-text-secondary">No lists match this sort</p>
          <p className="mt-1 text-sm text-text-muted">
            Try a different ordering above.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Resolve a sort key into an ordered list of public lists. The two RPC-
 * backed sorts (popular_week, recently_liked) return ids in order from
 * the SQL function and we then resolve to full rows; the simpler
 * date/count sorts use a direct ORDER BY.
 */
async function fetchLists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sort: ListSortKey
): Promise<ListWithProfile[]> {
  if (sort === "popular_week" || sort === "recently_liked") {
    const oneWeekAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const rpcRes =
      sort === "popular_week"
        ? await supabase.rpc("popular_lists_in_window", {
            window_start: oneWeekAgo,
            lim: RESULTS_LIMIT,
          })
        : await supabase.rpc("recently_liked_lists", { lim: RESULTS_LIMIT });
    const ids =
      (rpcRes.data as { list_id: string }[] | null)?.map((r) => r.list_id) ??
      [];
    if (ids.length === 0) return [];
    const { data: rows } = await supabase
      .from("lists")
      .select("*, profiles!lists_user_id_fkey(*)")
      .eq("visibility", "public")
      .in("id", ids);
    const byId = new Map<string, ListWithProfile>();
    for (const row of (rows as ListWithProfile[] | null) ?? []) {
      byId.set(row.id, row);
    }
    return ids
      .map((id) => byId.get(id))
      .filter((l): l is ListWithProfile => !!l);
  }

  // Simpler sorts — direct order on the lists table.
  const orderBy =
    sort === "popular_all"
      ? ("like_count" as const)
      : ("created_at" as const);
  const { data } = await supabase
    .from("lists")
    .select("*, profiles!lists_user_id_fkey(*)")
    .eq("visibility", "public")
    .order(orderBy, { ascending: false })
    .limit(RESULTS_LIMIT);
  return (data as ListWithProfile[] | null) ?? [];
}
