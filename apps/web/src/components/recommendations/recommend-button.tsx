"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Share2, X } from "lucide-react";
import ModalWrapper from "@/components/modals/modal-wrapper";
import InlineMediaPicker from "@/components/lists/inline-media-picker";
import CoverImage from "@/components/cover-image";
import { createRecommendation } from "@/app/actions/recommendations";
import { toast } from "@/lib/toast";
import type { MediaItem, MediaType, SearchResult } from "@intertaind/types";

const MAX_NOTE = 280;

// Singular labels for the helper-line copy. Pluralized labels live in
// MEDIA_TYPE_CONFIG but read awkwardly in a sentence ("could be another
// Movies"), so we keep a separate map here.
const SINGULAR_LABEL: Record<MediaType, string> = {
  movie: "movie",
  tv_show: "show",
  book: "book",
  video_game: "game",
};

/**
 * "Could be another {source_type}, a {other1}, a {other2}, or a {other3}"
 * — re-orders the four media-type labels so the source's own type is the
 * first option (encouraging same-medium picks) and the cross-media types
 * follow. Reads naturally for any of the four sources.
 */
function pairingHint(sourceType: MediaType): string {
  const others = (
    Object.keys(SINGULAR_LABEL) as MediaType[]
  ).filter((t) => t !== sourceType);
  return `Could be another ${SINGULAR_LABEL[sourceType]}, a ${SINGULAR_LABEL[others[0]]}, a ${SINGULAR_LABEL[others[1]]}, or a ${SINGULAR_LABEL[others[2]]}.`;
}

/**
 * "Recommend" button mounted on a media detail page. For logged-out
 * viewers it routes to /login with a `next` param so they land back
 * on the media page after auth. For logged-in viewers it opens the
 * recommend modal.
 *
 * Source media (i.e. the page you're on) is fixed by the `source`
 * prop; the modal lets you pick the target.
 */
export default function RecommendButton({
  source,
  isLoggedIn,
}: {
  source: Pick<MediaItem, "id" | "title" | "cover_image_url" | "media_type">;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Width-matched to the rest of the sidebar action stack
  // (`w-full ... gap-2.5 px-3 py-2 text-sm`), but filled with the
  // brand pink as the visual hook. The Intertain CTA gets the strong
  // color so the brand verb is the eye magnet of the column; the
  // surrounding tracking actions stay quiet by comparison.
  const sharedClass =
    "flex w-full items-center gap-2.5 rounded-sm bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-light";

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?next=/media/${source.id}`}
        className={sharedClass}
      >
        <Share2 size={14} />
        Intertain friends
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={sharedClass}
      >
        <Share2 size={14} />
        Intertain friends
      </button>
      {open && (
        <RecommendModal source={source} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function RecommendModal({
  source,
  onClose,
}: {
  source: Pick<MediaItem, "id" | "title" | "cover_image_url" | "media_type">;
  onClose: () => void;
}) {
  const router = useRouter();
  // The picker is a search widget that resolves SearchResult → mediaId
  // via upsertMediaItem. We only need the surfaced fields for the
  // staged-target preview, so we keep the snapshot minimal.
  const [target, setTarget] = useState<{
    mediaId: string;
    title: string;
    cover: string | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handlePick(result: SearchResult, mediaId: string) {
    if (mediaId === source.id) {
      // Defensive — the picker excludes the source via `excludeMediaIds`,
      // but if somehow the user picks the same media (e.g. a duplicate
      // row resolved through a shared external id), surface it cleanly
      // rather than letting the server-side CHECK throw.
      toast("Pick something other than the source", { variant: "error" });
      return;
    }
    setTarget({ mediaId, title: result.title, cover: result.cover_image_url });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      await createRecommendation(source.id, target.mediaId, note || undefined);
      toast("Intertaind!", { variant: "success" });
      router.refresh();
      onClose();
    } catch (err) {
      toast((err as Error).message, { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = MAX_NOTE - note.length;

  return (
    <ModalWrapper title="Intertain Your Friends" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <p className="text-sm text-text-secondary">
            If a friend liked{" "}
            <span className="font-semibold text-text-primary">
              {source.title}
            </span>
            , what would you recommend them next?
          </p>
          {/* Cross-media nudge — adapts to the source's media type so
              the listed examples always include the OTHER three types.
              Italic + muted to read as supporting copy, not a second
              question. */}
          <p className="mt-1.5 text-xs italic text-text-muted">
            {pairingHint(source.media_type)}
          </p>
        </div>

        {/* Source pill — visual anchor so the user always knows which
            media they're recommending FROM, even after they scroll the
            picker results. */}
        <div className="flex items-center gap-3 rounded-sm border border-surface-border bg-surface-overlay p-2">
          <div className="aspect-2/3 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border">
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
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Source
            </p>
            <p className="truncate text-sm font-medium text-text-primary">
              {source.title}
            </p>
          </div>
        </div>

        {/* Target — picker until something's chosen, then a staged pill
            with a Change button that swaps it back to the picker. */}
        {target ? (
          <div className="flex items-center gap-3 rounded-sm border border-brand/40 bg-brand/5 p-2">
            <div className="aspect-2/3 w-10 shrink-0 overflow-hidden rounded-sm border border-surface-border">
              <CoverImage
                src={target.cover}
                alt={target.title}
                className="h-full w-full object-cover"
                fallback={
                  <div className="flex h-full items-center justify-center text-text-muted">
                    —
                  </div>
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-brand">
                Intertain with
              </p>
              <p className="truncate text-sm font-medium text-text-primary">
                {target.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="shrink-0 rounded-sm p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
              aria-label="Change pairing"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wider text-text-muted">
              Intertain with
            </p>
            <InlineMediaPicker
              placeholder={`${source.title} lovers would also love…`}
              scope="all"
              excludeMediaIds={[source.id]}
              onPick={handlePick}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="rec-note"
            className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted"
          >
            Note <span className="lowercase text-text-muted/70">(optional)</span>
          </label>
          <textarea
            id="rec-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="Why is this a good pair?"
            className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
          <div className="mt-1 flex justify-end text-xs text-text-muted">
            <span className={remaining < 30 ? "text-text-secondary" : ""}>
              {remaining < 80 ? `${remaining} left` : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!target || submitting}
            className="flex items-center gap-1.5 rounded-sm bg-brand px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Intertain
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}
