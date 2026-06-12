import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import ListEditForm from "@/components/lists/list-edit-form";
import type { List, ListItem, MediaItem } from "@/lib/types";

export default async function EditListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/lists/${id}/edit`);

  const { data: list } = await supabase
    .from("lists")
    .select("*")
    .eq("id", id)
    .single();

  if (!list) notFound();
  if ((list as List).user_id !== user.id) redirect(`/lists/${id}`);

  const typedList = list as List;

  const [{ data: items }, { data: source }] = await Promise.all([
    supabase
      .from("list_items")
      .select("*, media_items(*)")
      .eq("list_id", id)
      .order("position"),
    typedList.source_media_id
      ? supabase
          .from("media_items")
          .select("*")
          .eq("id", typedList.source_media_id)
          .single()
      : Promise.resolve({ data: null as MediaItem | null }),
  ]);

  const typedItems =
    (items as (ListItem & { media_items: MediaItem })[] | null) ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-2 text-3xl font-bold text-text-primary">Edit list</h1>
      <p className="mb-8 text-sm text-text-muted">
        Changes to title, description, and metadata save when you click
        &quot;Save changes.&quot; Item changes save immediately.
      </p>
      <ListEditForm
        list={typedList}
        items={typedItems}
        sourceMedia={(source as MediaItem | null) ?? null}
      />
    </div>
  );
}
