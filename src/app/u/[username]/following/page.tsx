import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listFollowing } from "@/app/actions/social";
import UserRow from "@/components/social/user-row";

export default async function FollowingPage({
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

  const following = await listFollowing(profile.id);

  return (
    <div className="pt-8">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        Following
      </h2>
      {following.length === 0 ? (
        <p className="text-sm text-text-muted">
          Not following anyone yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {following.map((user) => (
            <li key={user.id}>
              <UserRow user={user} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
