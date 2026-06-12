import { notFound } from "next/navigation";
import { User } from "lucide-react";
import {
  getPersonDetails,
  getPersonCombinedCredits,
  tmdbImageUrl,
} from "@/lib/api/tmdb";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import BiographyText from "@/components/media/biography-text";
import FilmographyList from "@/components/media/filmography-list";
import type { MediaItem, UserMedia } from "@/lib/types";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number.parseInt(id, 10);
  if (Number.isNaN(personId)) notFound();

  let person, credits;
  try {
    [person, credits] = await Promise.all([
      getPersonDetails(personId),
      getPersonCombinedCredits(personId),
    ]);
  } catch {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Batch-lookup existing media_items rows for every credit's tmdb_id.
  // Found ones get rendered as full MediaCards (slide-out + tracking);
  // the rest fall back to a simpler poster card.
  const allTmdbIds = Array.from(
    new Set([
      ...credits.cast.map((c) => c.id),
      ...credits.crew.map((c) => c.id),
    ])
  );

  const mediaItemsByKey = new Map<string, MediaItem>();
  if (allTmdbIds.length > 0) {
    const { data: rows } = await supabase
      .from("media_items")
      .select("*")
      .in(
        "external_ids->>tmdb_id",
        allTmdbIds.map(String)
      );
    for (const row of (rows as MediaItem[] | null) ?? []) {
      const tmdbId = (row.external_ids as Record<string, unknown> | null)
        ?.tmdb_id;
      if (tmdbId == null) continue;
      // Key by media_type so a movie and TV show with the same tmdb_id
      // (rare) don't collide.
      mediaItemsByKey.set(`${row.media_type}-${tmdbId}`, row);
    }
  }

  // Viewer's tracking rows for the matched media so the hover slide-out
  // shows the correct watched/loved/rated state.
  const viewerTracking: Record<string, UserMedia> = {};
  if (user && mediaItemsByKey.size > 0) {
    const matchedIds = Array.from(mediaItemsByKey.values()).map((m) => m.id);
    const { data: vmRows } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .in("media_id", matchedIds);
    for (const row of (vmRows as UserMedia[] | null) ?? []) {
      viewerTracking[row.media_id] = row;
    }
  }

  // Tracked-percentage (cast credits only — what Letterboxd surfaces).
  let tracked: { watched: number; total: number } | null = null;
  if (user && credits.cast.length > 0) {
    const totalCastCredits = credits.cast.length;
    let watched = 0;
    const seen = new Set<string>();
    for (const c of credits.cast) {
      const matchedItem = mediaItemsByKey.get(
        `${c.media_type === "movie" ? "movie" : "tv_show"}-${c.id}`
      );
      if (!matchedItem) continue;
      if (seen.has(matchedItem.id)) continue;
      const um = viewerTracking[matchedItem.id];
      if (um && (um.status === "completed" || um.status === "in_progress")) {
        watched++;
        seen.add(matchedItem.id);
      }
    }
    tracked = { watched, total: totalCastCredits };
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Left column: portrait + bio + tracked % */}
        <aside className="w-full shrink-0 md:w-56">
          <div className="aspect-2/3 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
            {person.profile_path ? (
              <img
                src={tmdbImageUrl(person.profile_path, "w500") ?? ""}
                alt={person.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                <User size={48} className="opacity-40" />
              </div>
            )}
          </div>

          {(person.birthday || person.deathday || person.place_of_birth) && (
            <dl className="mt-4 space-y-2 text-xs">
              {person.birthday && (
                <Field label="Born" value={formatDate(person.birthday)} />
              )}
              {person.deathday && (
                <Field label="Died" value={formatDate(person.deathday)} />
              )}
              {person.place_of_birth && (
                <Field label="From" value={person.place_of_birth} />
              )}
            </dl>
          )}

          {tracked && (
            <div className="mt-4 rounded-sm border border-surface-border bg-surface-raised/40 p-3 text-xs">
              <div className="font-medium text-text-primary">
                {tracked.watched} of {tracked.total}
              </div>
              <div className="text-text-muted">
                {tracked.total > 0
                  ? `${Math.round((tracked.watched / tracked.total) * 100)}% watched`
                  : ""}
              </div>
            </div>
          )}
        </aside>

        {/* Right column: name, bio, filmography */}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-text-primary">
            {person.name}
          </h1>

          {person.biography && <BiographyText text={person.biography} />}

          <h2 className="mt-8 mb-3 text-lg font-semibold text-text-primary">
            Filmography
          </h2>

          <FilmographyList
            credits={credits}
            mediaItemsByKey={Object.fromEntries(mediaItemsByKey.entries())}
            viewerTracking={viewerTracking}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-text-secondary">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
