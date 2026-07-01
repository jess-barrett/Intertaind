import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActivityItem from "@/components/activity/activity-item";
import { listUserActivityPage } from "@/app/actions/activity";

const PAGE_SIZE = 20;
// Hard-cap how deep a viewer can paginate. Beyond this the query cost isn't
// worth it and nobody is scrolling 400 items in anyway.
const MAX_PAGES = 20;

function pageHref(username: string, n: number) {
  return n === 1 ? `/u/${username}/activity` : `/u/${username}/activity?page=${n}`;
}

/**
 * Build the list of page numbers to render:
 *   first, ...(maybe ellipsis), page-1, page, page+1, (maybe ellipsis)..., last
 * Edges collapse when the window already touches 1 or totalPages.
 */
function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 1) return [];
  const windowStart = Math.max(1, current - 1);
  const windowEnd = Math.min(total, current + 1);
  const out: (number | "ellipsis")[] = [];

  if (windowStart > 1) {
    out.push(1);
    if (windowStart > 2) out.push("ellipsis");
  }
  for (let i = windowStart; i <= windowEnd; i++) out.push(i);
  if (windowEnd < total) {
    if (windowEnd < total - 1) out.push("ellipsis");
    out.push(total);
  }
  return out;
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const rawPage = Number.parseInt(sp.page ?? "1", 10) || 1;
  const page = Math.min(MAX_PAGES, Math.max(1, rawPage));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();
  if (!profile) notFound();

  const { items, total } = await listUserActivityPage(profile.id, PAGE_SIZE, offset);
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const pageNumbers = getPageNumbers(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="pt-8">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Activity</h2>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-muted">
          {page === 1 ? "Nothing here yet." : "No more activity."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((a) => (
            <ActivityItem key={a.id} activity={a} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
          {hasPrev ? (
            <Link
              href={pageHref(username, page - 1)}
              aria-label="Previous page"
              className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <ChevronLeft size={14} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-sm border border-surface-border px-2.5 py-1.5 text-sm text-text-muted opacity-40">
              <ChevronLeft size={14} />
            </span>
          )}

          {pageNumbers.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`e-${i}`}
                className="px-2 text-sm text-text-muted"
                aria-hidden
              >
                …
              </span>
            ) : p === page ? (
              <span
                key={p}
                aria-current="page"
                className="min-w-8 rounded-sm bg-brand px-2.5 py-1.5 text-center text-sm font-medium text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={pageHref(username, p)}
                className="min-w-8 rounded-sm border border-surface-border bg-surface-raised px-2.5 py-1.5 text-center text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
              >
                {p}
              </Link>
            )
          )}

          {hasNext ? (
            <Link
              href={pageHref(username, page + 1)}
              aria-label="Next page"
              className="flex items-center gap-1 rounded-sm border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-sm border border-surface-border px-2.5 py-1.5 text-sm text-text-muted opacity-40">
              <ChevronRight size={14} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
