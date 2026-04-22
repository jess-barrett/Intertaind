import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listFollowers } from "@/app/actions/social";
import UserRow from "@/components/social/user-row";

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .single();
  if (!profile) notFound();

  const followers = await listFollowers(profile.id);

  return (
    <div className="pt-8">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        Followers
      </h2>
      {followers.length === 0 ? (
        <p className="text-sm text-text-muted">
          No followers yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {followers.map((user) => (
            <li key={user.id}>
              <UserRow user={user} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
