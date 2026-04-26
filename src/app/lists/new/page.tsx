import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import ListCreateForm from "@/components/lists/list-create-form";

export default async function NewListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/lists/new");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-2 text-3xl font-bold text-text-primary">New list</h1>
      <p className="mb-8 text-sm text-text-muted">
        Curate a cross-media list for the community. You can mix movies, TV,
        books, and games on the same list.
      </p>
      <ListCreateForm />
    </div>
  );
}
