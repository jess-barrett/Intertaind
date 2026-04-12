import { createClient } from "@/lib/supabase/server";
import type { MediaItem, MediaType } from "@/lib/types";
import BrowseClient from "./browse-client";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("media_items")
    .select("*")
    .order("tracking_count", { ascending: false })
    .limit(48);

  if (type && type !== "all") {
    query = query.eq("media_type", type as MediaType);
  }

  const { data: items } = await query;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-text-primary">Browse</h1>
      <BrowseClient
        items={(items as MediaItem[]) ?? []}
        activeType={(type as MediaType | undefined) ?? undefined}
      />
    </div>
  );
}
