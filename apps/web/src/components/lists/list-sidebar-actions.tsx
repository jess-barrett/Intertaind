"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Heart, Loader2 } from "lucide-react";
import { toggleListLike, toggleListSave } from "@/app/actions/lists";

/**
 * Sidebar variant of like/save. Each button shows icon + label + count
 * and toggles the corresponding state for any logged-in user (including
 * the owner — there's nothing wrong with curating your own list and
 * also marking it as a favorite).
 *
 * Optimistically updates the count locally on toggle; the trigger keeps
 * the source-of-truth count on `lists` in sync server-side and a
 * router refresh pulls fresh data afterward.
 */
export default function ListSidebarActions({
  listId,
  isLoggedIn,
  initialLiked,
  initialSaved,
  initialLikeCount,
  initialSaveCount,
}: {
  listId: string;
  isLoggedIn: boolean;
  initialLiked: boolean;
  initialSaved: boolean;
  initialLikeCount: number;
  initialSaveCount: number;
}) {
  const router = useRouter();
  const [pendingLike, setPendingLike] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [saveCount, setSaveCount] = useState(initialSaveCount);

  async function onLike() {
    if (!isLoggedIn || pendingLike) return;
    setPendingLike(true);
    // Optimistic update — UI flips immediately, server reconciles.
    const previousLiked = liked;
    setLiked(!previousLiked);
    setLikeCount((c) => c + (previousLiked ? -1 : 1));
    try {
      await toggleListLike(listId);
      router.refresh();
    } catch (err) {
      console.error(err);
      setLiked(previousLiked);
      setLikeCount((c) => c + (previousLiked ? 1 : -1));
    } finally {
      setPendingLike(false);
    }
  }

  async function onSave() {
    if (!isLoggedIn || pendingSave) return;
    setPendingSave(true);
    const previousSaved = saved;
    setSaved(!previousSaved);
    setSaveCount((c) => c + (previousSaved ? -1 : 1));
    try {
      await toggleListSave(listId);
      router.refresh();
    } catch (err) {
      console.error(err);
      setSaved(previousSaved);
      setSaveCount((c) => c + (previousSaved ? 1 : -1));
    } finally {
      setPendingSave(false);
    }
  }

  return (
    <div className="space-y-2">
      <ActionRow
        icon={<Heart size={14} className={liked ? "fill-current" : ""} />}
        label={liked ? "Liked" : "Like This List"}
        count={likeCount}
        active={liked}
        clickable={isLoggedIn}
        pending={pendingLike}
        onClick={onLike}
      />
      <ActionRow
        icon={<Bookmark size={14} className={saved ? "fill-current" : ""} />}
        label={saved ? "Bookmarked" : "Bookmark This List"}
        count={saveCount}
        active={saved}
        clickable={isLoggedIn}
        pending={pendingSave}
        onClick={onSave}
      />
    </div>
  );
}

function ActionRow({
  icon,
  label,
  count,
  active,
  clickable,
  pending,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  clickable: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const baseClasses =
    "flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors";
  if (!clickable) {
    // Logged-out viewers see the icon + count only (no label) — no
    // sense advertising an action they can't take.
    return (
      <div
        className={`${baseClasses} border-surface-border bg-surface-overlay text-text-muted`}
      >
        {icon}
        <span className="ml-auto font-medium tabular-nums">{count}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`${baseClasses} disabled:opacity-50 ${
        active
          ? "border-brand bg-brand/10 text-brand"
          : "border-surface-border bg-surface-overlay text-text-secondary hover:border-brand/40 hover:text-text-primary"
      }`}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
      <span className="truncate">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{count}</span>
    </button>
  );
}
