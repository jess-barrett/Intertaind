import Link from "next/link";
import { Heart, User } from "lucide-react";
import { LIST_TYPE_LABELS, type List, type Profile } from "@/lib/types";

export interface ListCardData {
  covers: { src: string | null; title: string }[];
}

const COVER_WIDTH = 56; // px
const COVER_OFFSET = 30; // px between successive covers — half overlap
const STACK_HEIGHT = COVER_WIDTH * 1.5; // aspect 2/3 → height = width × 1.5

/**
 * Letterboxd-style list card: metadata on the left, layered horizontal
 * stack of the first ~5 item covers on the right. The covers tile from
 * left to right with the leftmost on top, mirroring the order users see
 * when they open the list itself.
 */
export default function ListCard({
  list,
  profile,
  covers,
}: {
  list: List;
  profile: Profile | null;
  covers: ListCardData["covers"];
}) {
  const stackWidth =
    covers.length === 0
      ? 0
      : COVER_WIDTH + (covers.length - 1) * COVER_OFFSET;

  return (
    <Link
      href={`/lists/${list.id}`}
      className="glass flex items-center gap-4 p-4 transition-colors hover:border-brand/30"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {LIST_TYPE_LABELS[list.list_type]}
          </span>
        </div>
        <h2 className="mt-2 line-clamp-2 text-lg font-semibold text-text-primary">
          {list.title}
        </h2>
        {list.description && (
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
            {list.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
          {profile && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {profile.display_name || profile.username}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Heart size={12} />
            {list.like_count}
          </span>
        </div>
      </div>

      {covers.length > 0 && (
        <div
          className="relative shrink-0"
          style={{ width: `${stackWidth}px`, height: `${STACK_HEIGHT}px` }}
          aria-hidden
        >
          {covers.map((cover, i) => (
            <div
              key={i}
              className="absolute top-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay shadow-md shadow-black/40"
              style={{
                left: `${i * COVER_OFFSET}px`,
                width: `${COVER_WIDTH}px`,
                height: `${STACK_HEIGHT}px`,
                zIndex: covers.length - i,
              }}
            >
              {cover.src ? (
                <img
                  src={cover.src}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-surface-overlay" />
              )}
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
