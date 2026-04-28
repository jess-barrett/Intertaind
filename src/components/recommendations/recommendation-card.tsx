import Link from "next/link";
import { User } from "lucide-react";
import CoverImage from "@/components/cover-image";
import { relativeTime } from "@/lib/time";
import type { MediaItem, Profile } from "@/lib/types";

/**
 * One recommendation rendered as a horizontal card. The "primary" media
 * is whichever side is interesting to surface here — the opposite of
 * the page the viewer is currently on.
 *
 * Used in three surfaces with the same shape:
 *   - "Pairs with this" section on a source's page → primary = target
 *   - "Recommended for this" inverse section on a target's page → primary = source
 *   - User profile "Recommended" sub-tab — see ProfileRecommendationCard
 *     for that variant; it shows BOTH sides with an arrow between.
 *
 * Direction context is conveyed by the surrounding section header, so
 * the card itself stays simple: cover + recommender chip + headline +
 * optional note.
 */
export default function RecommendationCard({
  primaryMedia,
  recommender,
  note,
  createdAt,
}: {
  primaryMedia: Pick<MediaItem, "id" | "title" | "cover_image_url" | "media_type">;
  recommender: Profile | null;
  note: string | null;
  createdAt: string;
}) {
  const recommenderDisplay =
    recommender?.display_name || recommender?.username || "—";
  return (
    <div className="flex items-start gap-4 border-b border-surface-border/60 py-4 last:border-b-0">
      <Link
        href={`/media/${primaryMedia.id}`}
        className="aspect-2/3 w-20 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay transition-opacity hover:opacity-90"
      >
        <CoverImage
          src={primaryMedia.cover_image_url}
          alt={primaryMedia.title}
          className="h-full w-full object-cover"
          fallback={
            <div className="flex h-full items-center justify-center text-text-muted">
              —
            </div>
          }
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/media/${primaryMedia.id}`}
          className="block text-base font-semibold text-text-primary hover:text-brand"
        >
          {primaryMedia.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          {recommender?.username ? (
            <Link
              href={`/u/${recommender.username}`}
              className="flex items-center gap-1.5 transition-colors hover:text-text-primary"
            >
              {recommender.avatar_url ? (
                <img
                  src={recommender.avatar_url}
                  alt={recommenderDisplay}
                  className="h-5 w-5 rounded-full border border-surface-border object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-surface-border bg-surface-overlay">
                  <User size={10} />
                </span>
              )}
              <span className="font-medium text-text-secondary">
                Recommended by {recommenderDisplay}
              </span>
            </Link>
          ) : (
            <span className="font-medium text-text-secondary">
              Recommended by {recommenderDisplay}
            </span>
          )}
          <span aria-hidden>·</span>
          <span title={createdAt}>{relativeTime(createdAt)}</span>
        </div>
        {note && (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            “{note}”
          </p>
        )}
      </div>
    </div>
  );
}
