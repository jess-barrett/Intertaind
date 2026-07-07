import { notFound } from "next/navigation";
import { User } from "lucide-react";
import { tmdbImageUrl } from "@intertaind/media";
import type { PersonCreditInput } from "@intertaind/media";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import BiographyText from "@/components/media/biography-text";
import FilmographyList from "@/components/media/filmography-list";
import type { MediaItem, UserMedia } from "@intertaind/types";

/**
 * The `people` columns this page renders. Web's Supabase client is untyped
 * (it doesn't depend on `@intertaind/supabase` the way mobile does), so —
 * like the existing `MediaItem`/`UserMedia` casts below — we assert the
 * shape of the read. These fields map 1:1 to the `people` table.
 */
type Person = {
  tmdb_id: number;
  enriched_at: string;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
};

/** How old a `people` row may be before we re-enrich it. */
const STALE_AFTER_DAYS = 30;

/**
 * A `people` row is stale when it was last enriched more than `days` ago.
 * An unparseable timestamp is treated as stale (re-enrich rather than trust
 * garbage). Mirrors mobile's `isStale` in `apps/mobile/src/queries/person.ts`.
 */
function isStale(enrichedAt: string, days = STALE_AFTER_DAYS): boolean {
  const enrichedMs = Date.parse(enrichedAt);
  if (Number.isNaN(enrichedMs)) return true;
  return Date.now() - enrichedMs > days * 24 * 60 * 60 * 1000;
}

// The `person_credits` columns `PersonCreditInput` needs. Kept as one
// select string so it can't drift from the read below. Mirrors mobile's
// `PERSON_CREDIT_COLUMNS`. The row's `media_type`/`credit_type` are stored
// as CHECK-constrained text ('movie'|'tv', 'cast'|'crew') — exactly the
// unions `PersonCreditInput` declares — so the cast below is safe.
const PERSON_CREDIT_COLUMNS =
  "media_tmdb_id, media_type, title, release_date, poster_path, overview, character, billing_order, job, department, credit_type, vote_average, vote_count, genre_ids, media_item_id";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number.parseInt(id, 10);
  if (Number.isNaN(personId)) notFound();

  const supabase = await createClient();

  // Read the persisted catalog data (the single source of truth shared with
  // mobile), enriching via the `person` Edge Function when the row is
  // missing or stale. The get-or-enrich flow mirrors mobile's `usePerson`.
  const readPerson = async (): Promise<Person | null> => {
    const { data } = await supabase
      .from("people")
      .select(
        "tmdb_id, enriched_at, name, biography, birthday, deathday, place_of_birth, profile_path"
      )
      .eq("tmdb_id", personId)
      .maybeSingle();
    return (data as Person | null) ?? null;
  };

  let person = await readPerson();

  if (!person || isStale(person.enriched_at)) {
    // Missing or stale → get-or-enrich. `functions.invoke` forwards the
    // server client's session (anon or authed JWT); the function holds the
    // TMDB secret and does the write. On any invoke error we fall through
    // to the re-read: if a stale-but-present row failed to refresh we can
    // still render it, and a genuinely-missing person 404s below.
    await supabase.functions.invoke("person", { body: { tmdb_id: personId } });
    person = await readPerson();
  }

  if (!person) notFound();

  const { data: creditRows } = await supabase
    .from("person_credits")
    .select(PERSON_CREDIT_COLUMNS)
    .eq("person_tmdb_id", personId);

  // These rows ARE the filmography input. The `person_credits` columns map
  // 1:1 to `PersonCreditInput`; web's untyped client returns them loosely,
  // so we assert the row shape (the CHECK-constrained text columns yield the
  // declared unions). Mirrors mobile's `usePerson` narrowing.
  const credits = (creditRows ?? []) as unknown as PersonCreditInput[];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Batch-lookup existing media_items rows for every credit's tmdb_id.
  // Found ones get rendered as full MediaCards (slide-out + tracking);
  // the rest fall back to a simpler poster card.
  const allTmdbIds = Array.from(new Set(credits.map((c) => c.media_tmdb_id)));

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
  const castCredits = credits.filter((c) => c.credit_type === "cast");
  let tracked: { watched: number; total: number } | null = null;
  if (user && castCredits.length > 0) {
    const totalCastCredits = castCredits.length;
    let watched = 0;
    const seen = new Set<string>();
    for (const c of castCredits) {
      const matchedItem = mediaItemsByKey.get(
        `${c.media_type === "movie" ? "movie" : "tv_show"}-${c.media_tmdb_id}`
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
