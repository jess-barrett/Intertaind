import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";
import BackButton from "@/components/back-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <BackButton />
      <h1 className="mb-8 mt-4 text-2xl font-bold text-text-primary">Settings</h1>
      <SettingsForm profile={profile} email={user.email ?? ""} />
    </div>
  );
}
