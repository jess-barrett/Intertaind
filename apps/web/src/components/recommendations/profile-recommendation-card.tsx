import Link from "next/link";
import { Share2 } from "lucide-react";
import CoverImage from "@/components/cover-image";
import DeleteRecommendationButton from "@/components/recommendations/delete-recommendation-button";
import { relativeTime } from "@/lib/time";
import type { MediaItem } from "@intertaind/types";

/**
 * Two-cover variant of the recommendation card, used on the profile
 * page where the viewer hasn't picked a side — we want to show the
 * full pairing at a glance: `[source] → [target]`. Compared to the
 * single-cover `RecommendationCard` (used on media pages where one
 * side is implicit from the page context), this variant explicitly
 * shows both media items.
 */
export default function ProfileRecommendationCard({
  id,
  source,
  target,
  note,
  createdAt,
  canDelete = false,
}: {
  id: string;
  source: Pick<MediaItem, "id" | "title" | "cover_image_url">;
  target: Pick<MediaItem, "id" | "title" | "cover_image_url">;
  note: string | null;
  createdAt: string;
  /** The viewer authored this pairing → show the delete affordance. */
  canDelete?: boolean;
}) {
  return (
    <div className="border-b border-surface-border/60 py-5 last:border-b-0">
      <div className="flex items-start gap-4">
        {/* Source cover — left. Same size as target so the pair reads
            as a single visual unit; the `Share2` between them carries
            the directional meaning. */}
        <Link
          href={`/media/${source.id}`}
          className="aspect-2/3 w-20 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay transition-opacity hover:opacity-90"
        >
          <CoverImage
            src={source.cover_image_url}
            alt={source.title}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center text-text-muted">
                —
              </div>
            }
          />
        </Link>

        {/* Arrow separator — Share2 mirrors the icon used elsewhere
            for the "intertain" verb so the visual vocabulary stays
            consistent across surfaces. */}
        <Share2
          size={18}
          className="mt-12 shrink-0 text-text-muted"
          aria-label="recommends"
        />

        {/* Target cover — same dimensions as source. */}
        <Link
          href={`/media/${target.id}`}
          className="aspect-2/3 w-20 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay transition-opacity hover:opacity-90"
        >
          <CoverImage
            src={target.cover_image_url}
            alt={target.title}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center text-text-muted">
                —
              </div>
            }
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">
            If you liked{" "}
            <Link
              href={`/media/${source.id}`}
              className="font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {source.title}
            </Link>
            , try
          </p>
          <Link
            href={`/media/${target.id}`}
            className="mt-0.5 block text-base font-semibold text-text-primary hover:text-brand"
          >
            {target.title}
          </Link>
          <p className="mt-1 text-xs text-text-muted" title={createdAt}>
            {relativeTime(createdAt)}
          </p>
          {note && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
              “{note}”
            </p>
          )}
        </div>

        {/* Owner-only delete. */}
        {canDelete && <DeleteRecommendationButton id={id} />}
      </div>
    </div>
  );
}
