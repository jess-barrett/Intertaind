import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@intertaind/types";
import ActivityItem from "@/components/activity/activity-item";
import { listMyActivityForMedia } from "@/app/actions/activity";

export default async function MediaActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: media } = await supabase
    .from("media_items")
    .select("id, title")
    .eq("id", id)
    .single();
  if (!media) notFound();

  const typedMedia = media as Pick<MediaItem, "id" | "title">;
  const activity = (await listMyActivityForMedia(id, 100)) ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/media/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-secondary"
      >
        <ChevronLeft size={14} />
        Back to {typedMedia.title}
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-text-primary">
        Your activity for{" "}
        <span className="text-brand">{typedMedia.title}</span>
      </h1>

      {activity.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-muted">
          You haven&apos;t logged anything for this yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {activity.map((a) => (
            <ActivityItem key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}
