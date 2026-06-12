"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Heart, Loader2 } from "lucide-react";
import { toggleListLike, toggleListSave } from "@/app/actions/lists";

/**
 * Like + Save toggle pair shown on list detail pages to non-owner viewers.
 * Like is the public thumbs-up; Save is the private bookmark. Both fire
 * server actions that update the row's denormalized counts via DB
 * triggers, so we trigger a router refresh after to pull fresh totals.
 */
export default function ListLikeSaveButtons({
  listId,
  initialLiked,
  initialSaved,
}: {
  listId: string;
  initialLiked: boolean;
  initialSaved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);

  function onLike() {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await toggleListLike(listId);
        setLiked(next);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onSave() {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await toggleListSave(listId);
        setSaved(next);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onLike}
        disabled={pending}
        aria-label={liked ? "Unlike" : "Like"}
        className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
          liked
            ? "border-brand bg-brand/10 text-brand"
            : "border-surface-border text-text-secondary hover:border-brand/40 hover:text-text-primary"
        }`}
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Heart
            size={12}
            className={liked ? "fill-current" : ""}
          />
        )}
        {liked ? "Liked" : "Like"}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        aria-label={saved ? "Unsave" : "Save"}
        className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
          saved
            ? "border-brand bg-brand/10 text-brand"
            : "border-surface-border text-text-secondary hover:border-brand/40 hover:text-text-primary"
        }`}
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Bookmark
            size={12}
            className={saved ? "fill-current" : ""}
          />
        )}
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
