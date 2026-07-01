import { notFound } from "next/navigation";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ProfileRecommendationCard from "@/components/recommendations/profile-recommendation-card";
import { fetchUserRecommendations } from "@/app/actions/recommendations";

const RESULTS_LIMIT = 50;

/**
 * The user's recommendations surface — every pairing they've posted,
 * newest first. Owner-only copy on the empty state nudges them to a
 * media page; visitor copy stays neutral.
 *
 * Naming note: the brand verb is "Intertain" / "Intertaind" (used on
 * the action button + activity-feed copy), but the noun-collection
 * page is labeled "Recommendations" so the header doesn't compete
 * with the site's own name.
 *
 * RLS already filters private profiles' rows server-side, so for a
 * private profile the visitor view simply renders the empty state.
 */
export default async function UserRecommendationsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === profile.id;

  const { items: recs } = await fetchUserRecommendations(
    profile.id,
    RESULTS_LIMIT,
    0
  );

  return (
    <div className="pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Share2 size={16} className="text-brand" />
        <h2 className="text-lg font-semibold text-text-primary">
          Recommendations
        </h2>
      </div>

      {recs.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-muted">
          {isOwner
            ? "You haven't intertaind any pairings yet. Visit a media page and tap Intertain friends."
            : `${profile.username} hasn't intertaind any pairings yet.`}
        </p>
      ) : (
        <div>
          {recs.map((r) => (
            <ProfileRecommendationCard
              key={r.id}
              source={r.source_media}
              target={r.recommended_media}
              note={r.note}
              createdAt={r.created_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
