import Link from "next/link";
import { User } from "lucide-react";
import ListCoverStack from "@/components/lists/list-cover-stack";
import ListMediaIcons from "@/components/lists/list-media-icons";
import type { List, MediaItem, Profile } from "@intertaind/types";

/**
 * Featured-section card variant: no card chrome (no border, no
 * background), just a stacked cover preview with the list title and
 * curator below. Likes are intentionally omitted — featured picks
 * are editorial and don't lean on social signal.
 */
export default function FeaturedListCard({
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
      <ListCoverStack covers={covers} coverWidth={90} coverOffset={40} />
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
          <span>
            Created by{" "}
            <span className="font-medium text-text-secondary">{curatorDisplay}</span>
          </span>
        </span>
        <ListMediaIcons list={list} sourceMedia={sourceMedia} iconSize={12} />
      </div>
    </Link>
  );
}
