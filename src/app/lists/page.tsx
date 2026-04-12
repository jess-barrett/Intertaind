import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Heart, User } from "lucide-react";
import type { List, Profile } from "@/lib/types";

export default async function ListsPage() {
  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("lists")
    .select("*, profiles(*)")
    .eq("is_public", true)
    .order("like_count", { ascending: false })
    .limit(24);

  const typedLists = (lists as (List & { profiles: Profile })[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-text-primary">Lists</h1>
      <p className="mb-8 text-text-secondary">
        Community-curated cross-media recommendation lists
      </p>

      {typedLists.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {typedLists.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="glass block p-5 transition-colors hover:border-brand/30"
            >
              <h2 className="text-lg font-semibold text-text-primary">
                {list.title}
              </h2>
              {list.description && (
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                  {list.description}
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
                {list.profiles && (
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    {list.profiles.display_name || list.profiles.username}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Heart size={12} />
                  {list.like_count}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
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
