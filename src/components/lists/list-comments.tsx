"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Trash2, User } from "lucide-react";
import {
  createComment,
  deleteComment,
  fetchCommentsPage,
  type ListCommentWithProfile,
} from "@/app/actions/list-comments";
import { toast } from "@/lib/toast";
import { relativeTime } from "@/lib/time";

const MAX_BODY = 4000;

/**
 * Comments thread for a list — flat chronological. Logged-in viewers
 * see a compose form at the bottom; comment authors and the list
 * owner can delete (the latter for moderation).
 *
 * State is locally optimistic: new comments append on success and bad
 * deletes roll back. We also call `router.refresh()` so the parent
 * page picks up the new `comments_count` for any header that surfaces
 * it.
 */
export default function ListComments({
  listId,
  initialComments,
  initialHasMore,
  isLoggedIn,
  isListOwner,
  viewerId,
}: {
  listId: string;
  initialComments: ListCommentWithProfile[];
  initialHasMore: boolean;
  isLoggedIn: boolean;
  isListOwner: boolean;
  /** Auth'd user's id — used to decide whether each comment can be
      deleted by the viewer. Nullable for logged-out viewers. */
  viewerId: string | null;
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [paging, setPaging] = useState(false);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadPage(nextPage: number) {
    if (paging || nextPage < 0) return;
    setPaging(true);
    try {
      const result = await fetchCommentsPage(listId, nextPage);
      setComments(result.comments);
      setHasMore(result.hasMore);
      setPage(result.page);
    } catch (err) {
      toast((err as Error).message, { variant: "error" });
    } finally {
      setPaging(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn || pending) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > MAX_BODY) {
      toast(`Comment is too long (max ${MAX_BODY} chars)`, { variant: "error" });
      return;
    }
    setPending(true);
    try {
      await createComment(listId, trimmed);
      // Reset to the newest page so the user sees their just-posted
      // comment at the top, then re-fetch (rather than appending
      // optimistically) so we get fresh hasMore + don't risk drift
      // with the server's view if anyone else commented in parallel.
      const refreshed = await fetchCommentsPage(listId, 0);
      setComments(refreshed.comments);
      setHasMore(refreshed.hasMore);
      setPage(0);
      setBody("");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: "error" });
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    setDeletingId(commentId);
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteComment(commentId);
      router.refresh();
    } catch (err) {
      // Roll back on failure so the user doesn't lose context of which
      // comment they were trying to delete.
      setComments(previous);
      toast((err as Error).message, { variant: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  const remaining = MAX_BODY - body.length;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Comments ({comments.length})
      </h2>

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No comments yet — be the first.
        </p>
      ) : (
        <ul className="space-y-5">
          {comments.map((c) => {
            const profile = c.profiles;
            const display = profile?.display_name || profile?.username || "—";
            const canDelete =
              !!viewerId && (viewerId === c.user_id || isListOwner);
            const isDeleting = deletingId === c.id;
            return (
              <li
                key={c.id}
                className="flex items-start gap-3 border-b border-surface-border/60 pb-5 last:border-b-0"
              >
                <div className="shrink-0">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={display}
                      className="h-8 w-8 rounded-full border border-surface-border object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface-overlay text-text-muted">
                      <User size={14} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {profile?.username ? (
                      <Link
                        href={`/u/${profile.username}`}
                        className="font-medium text-text-secondary transition-colors hover:text-text-primary"
                      >
                        {display}
                      </Link>
                    ) : (
                      <span className="font-medium text-text-secondary">
                        {display}
                      </span>
                    )}
                    <span aria-hidden>·</span>
                    <span title={c.created_at}>
                      {relativeTime(c.created_at)}
                    </span>
                    {c.updated_at !== c.created_at && (
                      <span className="text-text-muted">(edited)</span>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-primary">
                    {c.body}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={isDeleting}
                    aria-label="Delete comment"
                    className="shrink-0 rounded-sm p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-red-400 disabled:opacity-30"
                  >
                    {isDeleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(page > 0 || hasMore) && (
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-text-muted">
          <button
            type="button"
            onClick={() => loadPage(page - 1)}
            disabled={page === 0 || paging}
            className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={12} />
            Newer
          </button>
          <span className="tabular-nums">
            {paging ? "Loading…" : `Page ${page + 1}`}
          </span>
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            disabled={!hasMore || paging}
            className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-1.5 transition-colors hover:border-brand/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Older
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      {isLoggedIn ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={MAX_BODY}
            placeholder="Add a comment…"
            className="w-full resize-y rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
            <span
              className={remaining < 100 ? "text-text-secondary" : ""}
              aria-hidden
            >
              {remaining < 1000 ? `${remaining} left` : ""}
            </span>
            <button
              type="submit"
              disabled={pending || body.trim().length === 0}
              className="flex items-center gap-1.5 rounded-sm bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Post comment
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-6 text-center text-sm text-text-muted">
          <Link
            href={`/login?next=/lists/${listId}`}
            className="text-brand-light transition-colors hover:text-brand"
          >
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
    </section>
  );
}
