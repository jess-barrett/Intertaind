import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Film, ArrowLeft } from "lucide-react";
import type { MediaItem, UserMedia } from "@/lib/types";
import MediaCard from "@/components/media-card";
import ShelfSearch from "@/components/shelves/shelf-search";

export default async function MoviesShelfPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  const { data } = await supabase
    .from("user_media")
    .select("*, media_items!inner(*)")
    .eq("user_id", profile.id)
    .eq("media_items.media_type", "movie")
    .order("created_at", { ascending: false });

  const items =
    ((data as (UserMedia & { media_items: MediaItem })[]) ?? []).map(
      (um) => um.media_items
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center gap-4">
        <Link
          href={`/u/${username}`}
          className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
          Profile
        </Link>
        <div className="flex items-center gap-2">
          <Film size={20} className="text-accent-movie" />
          <h1 className="text-2xl font-bold text-text-primary">
            {profile.display_name || profile.username}&apos;s Movies
          </h1>
        </div>
        <span className="ml-auto text-sm text-text-muted">
          {items.length} movies
        </span>
      </div>

      {isOwner && (
        <div className="mb-6">
          <ShelfSearch mediaType="movie" />
        </div>
      )}

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-center">
          <Film size={32} className="mb-3 text-accent-movie opacity-40" />
          <p className="text-lg text-text-secondary">No movies yet</p>
          <p className="mt-1 text-sm text-text-muted">
            {isOwner
              ? "Search for movies above to add them to your collection."
              : "This user hasn\u0027t added any movies yet."}
          </p>
        </div>
      )}
    </div>
  );
}
