import Link from "next/link";
import { Heart, User } from "lucide-react";
import ListCoverStack from "@/components/lists/list-cover-stack";
import ListMediaIcons from "@/components/lists/list-media-icons";
import type { List, MediaItem, Profile } from "@/lib/types";

/**
 * Popular-section card variant: same total stack width as Featured but
 * with bigger covers + heavier overlap, giving the section a visually
 * weightier presentation. Below the stack: title, then a single meta
 * line with curator + items + likes.
 */
export default function PopularListCard({
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
      className="group block transition-opacity hover:opacity-90"
    >
      {/* coverWidth=138, offset=28 → total stack width 250px (matches
          the Featured card's 90+4*40=250). Cards are taller with
          heavier overlap than Featured, but the stack footprint is
          identical so the two sections align horizontally. */}
      <ListCoverStack covers={covers} coverWidth={138} coverOffset={28} />
      <h3 className="mt-3 line-clamp-2 text-base font-semibold text-text-primary group-hover:text-brand">
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
    </Link>
  );
}
