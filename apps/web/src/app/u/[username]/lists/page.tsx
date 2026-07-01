import Link from "next/link";
import { notFound } from "next/navigation";
import { ListPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BrowseListRow from "@/components/lists/browse-list-row";
import ShelfTabs from "@/components/shelves/shelf-tabs";
import { fetchListSourceMediaMap } from "@/lib/list-source-media";
import type { List, Profile } from "@intertaind/types";

const PREVIEW_COUNT = 10;
const RESULTS_LIMIT = 50;

type ListWithProfile = List & { profiles: Profile };
type SubTab = "mine" | "saved";

function isSubTab(s: string | undefined): s is SubTab {
  return s === "mine" || s === "saved";
}

export default async function UserListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const tab: SubTab = isSubTab(sp.tab) ? sp.tab : "mine";

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === profile.id;

  const tabRow = (
    <ShelfTabs
      tabs={[
        { key: "mine", label: "Created" },
        { key: "saved", label: "Saved" },
      ]}
      activeTab={tab}
      rightSlot={
        isOwner ? (
          <Link
            href="/lists/new"
            className="flex items-center gap-1.5 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
          >
            <ListPlus size={14} />
            New list
          </Link>
        ) : null
      }
    />
  );

  const lists = await fetchLists(supabase, profile.id, tab, isOwner);

  // Bulk-fetch the first 10 covers per list — same pattern as
  // /lists/browse so this page reuses BrowseListRow without changes.
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

  const sourceMediaByList = await fetchListSourceMediaMap(supabase, lists);

  const emptyMessage =
    tab === "mine"
      ? isOwner
        ? "You haven't created any lists yet."
        : `${profile.username} hasn't shared any public lists yet.`
      : isOwner
        ? "You haven't saved any lists yet."
        : `${profile.username} hasn't saved any public lists yet.`;

  return (
    <div className="pt-8">
      {tabRow}

      {lists.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-muted">
          {emptyMessage}
          {tab === "mine" && isOwner && (
            <>
              {" "}
              <Link
                href="/lists/new"
                className="text-brand-light transition-colors hover:text-brand"
              >
                Start one
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <div>
          {lists.map((list) => (
            <BrowseListRow
              key={list.id}
              list={list}
              profile={list.profiles}
              covers={coversByList[list.id] ?? []}
              sourceMedia={sourceMediaByList[list.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Resolve the active tab into a list of rows. The owner sees their own
 * private/unlisted lists; other viewers only see public ones (RLS would
 * filter most of this anyway, but we apply an explicit `visibility=public`
 * filter so the query is clear about its intent).
 */
async function fetchLists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  tab: "mine" | "saved",
  isOwner: boolean
): Promise<ListWithProfile[]> {
  if (tab === "mine") {
    let query = supabase
      .from("lists")
      .select("*, profiles!lists_user_id_fkey(*)")
      .eq("user_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(RESULTS_LIMIT);
    if (!isOwner) query = query.eq("visibility", "public");
    const { data } = await query;
    return (data as ListWithProfile[] | null) ?? [];
  }

  // Saved — pull the join rows ordered by save time, then hydrate the
  // nested list (with author profile) in one round trip via PostgREST's
  // resource embedding. The `!inner` makes it act like an inner join,
  // so a deleted list naturally drops out of the result set.
  let savedQuery = supabase
    .from("list_saves")
    .select(
      "created_at, lists!inner(*, profiles!lists_user_id_fkey(*))"
    )
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(RESULTS_LIMIT);
  if (!isOwner) {
    savedQuery = savedQuery.eq("lists.visibility", "public");
  }
  const { data: saved } = await savedQuery;
  type SavedRow = { created_at: string; lists: ListWithProfile };
  return ((saved as SavedRow[] | null) ?? []).map((r) => r.lists);
}
