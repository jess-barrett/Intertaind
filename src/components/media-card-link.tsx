"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertMediaItem } from "@/app/actions/media";
import type { SearchResult } from "@/lib/types";

/**
 * Click target for a media card. When the item already exists in our
 * database (mediaId provided) this is a plain Next Link. When we only
 * have a TMDb-shaped SearchResult, click triggers `upsertMediaItem`
 * (idempotent — looks up by external_ids first) and then navigates to
 * the resulting `/media/{id}` page. Lets us render full MediaCard
 * everywhere — filmography credits, search results, etc. — even when
 * the row hasn't been created yet.
 */
export default function MediaCardLink({
  mediaId,
  searchResult,
  className,
  children,
}: {
  mediaId?: string | null;
  searchResult?: SearchResult;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (mediaId) {
    return (
      <Link href={`/media/${mediaId}`} className={className}>
        {children}
      </Link>
    );
  }

  if (!searchResult) {
    return <div className={className}>{children}</div>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const id = await upsertMediaItem(searchResult);
            router.push(`/media/${id}`);
          } catch (err) {
            console.error(err);
          }
        });
      }}
      className={`${className ?? ""} text-left ${
        pending ? "cursor-wait opacity-70" : "cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}
