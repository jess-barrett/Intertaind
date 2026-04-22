import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActivityItem from "@/components/activity/activity-item";
import { listUserActivity } from "@/app/actions/activity";

const PAGE_SIZE = 20;

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();
  if (!profile) notFound();

  // Fetch one extra row so we can tell if there's a next page without a
  // separate count query.
  const fetched = await listUserActivity(profile.id, PAGE_SIZE + 1, offset);
  const hasNext = fetched.length > PAGE_SIZE;
  const items = fetched.slice(0, PAGE_SIZE);

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

      {(page > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between gap-2">
          {page > 1 ? (
            <Link
              href={
                page - 1 === 1
                  ? `/u/${username}/activity`
                  : `/u/${username}/activity?page=${page - 1}`
              }
              className="flex items-center gap-1.5 rounded-sm border border-surface-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <ChevronLeft size={14} />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-text-muted">Page {page}</span>
          {hasNext ? (
            <Link
              href={`/u/${username}/activity?page=${page + 1}`}
              className="flex items-center gap-1.5 rounded-sm border border-surface-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              Next
              <ChevronRight size={14} />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
