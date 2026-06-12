import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import FeaturedListCard from "@/components/lists/featured-list-card";
import PopularListCard from "@/components/lists/popular-list-card";
import RecentListRow from "@/components/lists/recent-list-row";
import { fetchListSourceMediaMap } from "@/lib/list-source-media";
import type { List, Profile } from "@intertaind/types";

const PREVIEW_COUNT = 5;
const FEATURED_LIMIT = 3;
const POPULAR_LIMIT = 3;
const RECENT_LIMIT = 10;

type ListWithProfile = List & { profiles: Profile };

export default async function ListsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const oneWeekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [featuredRes, popularIdsRes, recentIdsRes] = await Promise.all([
    supabase
      .from("lists")
      .select("*, profiles!lists_user_id_fkey(*)")
      .eq("visibility", "public")
      .eq("featured", true)
      .order("like_count", { ascending: false })
      .limit(FEATURED_LIMIT),
    supabase.rpc("popular_lists_in_window", {
      window_start: oneWeekAgo,
      lim: POPULAR_LIMIT,
    }),
    supabase.rpc("recently_liked_lists", { lim: RECENT_LIMIT }),
  ]);

  const featured = (featuredRes.data as ListWithProfile[] | null) ?? [];
  const popularIds =
    (popularIdsRes.data as { list_id: string; recent_likes: number }[] | null)
      ?.map((r) => r.list_id) ?? [];
  const recentIds =
    (recentIdsRes.data as { list_id: string; last_liked: string }[] | null)
      ?.map((r) => r.list_id) ?? [];

  const followupIds = Array.from(new Set([...popularIds, ...recentIds]));

  let popular: ListWithProfile[] = [];
  let recent: ListWithProfile[] = [];
  if (followupIds.length > 0) {
    const { data: rows } = await supabase
      .from("lists")
      .select("*, profiles!lists_user_id_fkey(*)")
      .eq("visibility", "public")
      .in("id", followupIds);
    const byId = new Map<string, ListWithProfile>();
    for (const row of (rows as ListWithProfile[] | null) ?? []) {
      byId.set(row.id, row);
    }
    popular = popularIds
      .map((id) => byId.get(id))
      .filter((l): l is ListWithProfile => !!l);
    recent = recentIds
      .map((id) => byId.get(id))
      .filter((l): l is ListWithProfile => !!l);
  }

  // Single batched query for all preview covers across all sections.
  const allListIds = Array.from(
    new Set([
      ...featured.map((l) => l.id),
      ...popular.map((l) => l.id),
      ...recent.map((l) => l.id),
    ])
  );
  const coversByList: Record<
    string,
    { src: string | null; title: string }[]
  > = {};
  if (allListIds.length > 0) {
    const { data: items } = await supabase
      .from("list_items")
      .select("list_id, position, media_items(id, title, cover_image_url)")
      .in("list_id", allListIds)
      .order("position", { ascending: true })
      .limit(allListIds.length * PREVIEW_COUNT * 2);

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

  const sourceMediaByList = await fetchListSourceMediaMap(supabase, [
    ...featured,
    ...popular,
    ...recent,
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Centered banner — slogan, description, primary CTA. The slogan
          uses the same uppercase / wide-tracked / semibold treatment as
          the section headers below ("FEATURED LISTS", etc.), just sized
          up for top-of-page emphasis. */}
      <div className="mb-12 text-center">
        <h1 className="text-xl font-semibold uppercase tracking-wider text-text-primary sm:text-2xl">
          Pair, curate, recommend.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-text-secondary">
          Lists are how the book pairs with the movie pairs with the game — the
          only place on the internet where your favorite show, novel, and
          playthrough sit on the same shelf.
        </p>
        {user && (
          <Link
            href="/lists/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-sm border border-surface-border bg-surface-overlay px-4 py-2 text-sm text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
          >
            <Plus size={14} />
            Start your own list
          </Link>
        )}
      </div>

      {/* Featured — full content width, 3 columns */}
      {featured.length > 0 && (
        <section className="mb-12">
          <SectionHeader
            title="Featured Lists"
            actionLabel="All"
            actionHref="/lists/featured"
          />
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3">
            {featured.map((list) => (
              <FeaturedListCard
                key={list.id}
                list={list}
                profile={list.profiles}
                covers={coversByList[list.id] ?? []}
                sourceMedia={sourceMediaByList[list.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Popular this week — full content width, 3 columns of larger cards */}
      {popular.length > 0 && (
        <section className="mb-12">
          <SectionHeader
            title="Popular this week"
            actionLabel="More"
            actionHref="/lists/browse?sort=popular_week"
          />
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3">
            {popular.map((list) => (
              <PopularListCard
                key={list.id}
                list={list}
                profile={list.profiles}
                covers={coversByList[list.id] ?? []}
                sourceMedia={sourceMediaByList[list.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Liked — 2/3 column, sidebar fills the right 1/3 */}
      {recent.length > 0 && (
        <section className="mb-12">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-2">
              <SectionHeader title="Recently Liked" />
              <div>
                {recent.map((list) => (
                  <RecentListRow
                    key={list.id}
                    list={list}
                    profile={list.profiles}
                    covers={coversByList[list.id] ?? []}
                    sourceMedia={sourceMediaByList[list.id] ?? null}
                  />
                ))}
              </div>
            </div>

            {/* Sidebar placeholder — slot for future Crew Picks /
                editorial / ad / filter widgets. */}
            <aside className="md:col-span-1">
              <SidebarPlaceholder />
            </aside>
          </div>
        </section>
      )}

      {featured.length === 0 &&
        popular.length === 0 &&
        recent.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-lg text-text-secondary">No lists yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Community lists will appear here once they&apos;re created.
            </p>
          </div>
        )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  actionLabel,
  actionHref,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-surface-border pb-2">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 max-w-xl text-sm text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
        >
          {actionLabel} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function SidebarPlaceholder() {
  return (
    <div className="rounded-sm border border-dashed border-surface-border p-6 text-center text-xs text-text-muted">
      <p className="font-semibold uppercase tracking-wider">Sidebar</p>
      <p className="mt-2">
        Crew picks, editorial collections, and discovery widgets land here.
      </p>
    </div>
  );
}
