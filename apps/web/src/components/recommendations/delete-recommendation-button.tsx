"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteRecommendation } from "@/app/actions/recommendations";

/**
 * Owner-only delete for a recommendation. A tiny client island so the
 * server-rendered `ProfileRecommendationCard` stays a server component — it
 * confirms, calls the `deleteRecommendation` server action, then refreshes the
 * route so the pairing drops out of the list.
 */
export default function DeleteRecommendationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (
      !window.confirm(
        "Delete this pairing? This removes your recommendation.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteRecommendation(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      aria-label="Delete pairing"
      className="shrink-0 rounded-sm p-2 text-text-muted transition-colors hover:text-accent-movie disabled:opacity-50"
    >
      <Trash2 size={16} />
    </button>
  );
}
