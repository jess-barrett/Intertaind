"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Ban } from "lucide-react";
import { blockUser } from "@/app/actions/social";

export default function FollowActionsMenu({
  targetId,
  targetUsername,
}: {
  targetId: string;
  targetUsername: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleBlock() {
    if (
      !window.confirm(
        `Block @${targetUsername}? They won't be able to see your profile and you won't see theirs.`
      )
    ) {
      return;
    }
    setOpen(false);
    startTransition(async () => {
      try {
        await blockUser(targetId);
        router.refresh();
      } catch {
        // no-op
      }
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-surface-border bg-surface-raised p-1 shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={handleBlock}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-accent-movie transition-colors hover:bg-surface-overlay"
          >
            <Ban size={12} />
            Block user
          </button>
        </div>
      )}
    </div>
  );
}
