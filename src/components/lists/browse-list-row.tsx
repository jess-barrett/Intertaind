import Link from "next/link";
import { Heart, User } from "lucide-react";
import ListCoverStack from "@/components/lists/list-cover-stack";
import type { List, Profile } from "@/lib/types";

/**
 * Wide one-per-row layout used on the /lists/browse page. The cover
 * stack sits at the top spanning a generous width (10 covers, medium
 * size, modest overlap) so each row reads as a banner; title, curator,
 * and description follow below in stacked blocks.
 *
 * Designed as the "deep dive" counterpart to the smaller cards on the
 * /lists landing — same data, more breathing room.
 */
export default function BrowseListRow({
  list,
  profile,
  covers,
}: {
  list: List;
  profile: Profile | null;
  covers: { src: string | null; title: string }[];
}) {
  const curatorDisplay = profile?.display_name || profile?.username || "—";
  return (
    <Link
      href={`/lists/${list.id}`}
      className="group block border-b border-surface-border/60 py-6 last:border-b-0"
    >
      {/* coverWidth=110, offset=55 → 10 covers span 110+9*55 = 605px.
          Each preceding cover reveals half of itself, so titles are
          legible across the strip rather than the leftmost cover being
          the only one you can read. */}
      <ListCoverStack covers={covers} coverWidth={110} coverOffset={55} />

      <div className="mt-4">
        <h3 className="text-lg font-semibold text-text-primary group-hover:text-brand">
          {list.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
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
        </div>
        {list.description && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary">
            {list.description}
          </p>
        )}
      </div>
    </Link>
  );
}
