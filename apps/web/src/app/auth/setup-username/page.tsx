import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetupUsernameForm from "./setup-username-form";

export default async function SetupUsernamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Already has a profile → send them home
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect("/");

  const suggested =
    (user.user_metadata?.name as string | undefined)
      ?.toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 20) ??
    (user.email?.split("@")[0] ?? "").toLowerCase().slice(0, 20);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-bold text-text-primary">
          Pick a username
        </h1>
        <p className="mb-6 text-text-secondary">
          This is how people will find and follow you on Intertaind.
        </p>
        <SetupUsernameForm suggested={suggested} />
      </div>
    </div>
  );
}
