import Link from "next/link";
import { Heart, User } from "lucide-react";
import ListCoverStack from "@/components/lists/list-cover-stack";
import ListMediaIcons from "@/components/lists/list-media-icons";
import type { List, MediaItem, Profile } from "@/lib/types";

/**
 * Recently-liked row variant: horizontal layout with the cover stack
 * pinned left and a stacked title / curator+meta / description block
 * filling the remaining width. One row per list, designed to stack
 * vertically inside a 2/3-width column on the discovery page.
 */
export default function RecentListRow({
  list,
  profile,
  covers,
  sourceMedia,
}: {
  list: List;
  profile: Profile | null;
  covers: { src: string | null; title: string }[];
  sourceMedia?: Pick<MediaItem, "media_type"> | null;
}) {
  const curatorDisplay = profile?.display_name || profile?.username || "—";
  return (
    <Link
      href={`/lists/${list.id}`}
      className="group flex items-start gap-4 border-b border-surface-border/60 py-4 last:border-b-0"
    >
      <ListCoverStack covers={covers} coverWidth={90} coverOffset={32} />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-base font-semibold text-text-primary group-hover:text-brand">
          {list.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={curatorDisplay}
                className="h-4 w-4 rounded-full border border-surface-border object-cover"
              />
            ) : (
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
                <User size={9} />
              </span>
            )}
            <span className="font-medium text-text-secondary">
              {curatorDisplay}
            </span>
          </span>
          <span aria-hidden>·</span>
          <span>{list.item_count} items</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            <Heart size={10} />
            {list.like_count}
          </span>
          <span aria-hidden>·</span>
          <ListMediaIcons list={list} sourceMedia={sourceMedia} iconSize={12} />
        </div>
        {list.description && (
          <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
            {list.description}
          </p>
        )}
      </div>
    </Link>
  );
}
