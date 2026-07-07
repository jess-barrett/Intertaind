/**
 * TanStack Query hooks for the Person / Filmography page.
 *
 * These read the PERSISTED `people` + `person_credits` tables — both
 * populated by the `person` Edge Function, a get-or-enrich endpoint that
 * holds the TMDB secret server-side (mobile never sees it). The tables are
 * anon-readable via RLS; only enrichment (the write path) needs the secret.
 *
 *   - `usePerson` reads the person's catalog data. When the row is missing
 *     or its `enriched_at` is stale (>30d), it triggers enrichment via
 *     `supabase.functions.invoke("person", ...)` (which forwards the anon
 *     JWT), waits for it, then re-reads. The UI can pass the returned
 *     `credits` straight to `mergeCredits`/`filterCredits`/`sortCredits`
 *     from `@intertaind/media`.
 *   - `usePersonTracking` is the viewer's tracking map — status + rating +
 *     is_favorite per media_id among this person's catalog-linked titles.
 *     The screen derives the watched set AND each card's rating/heart from
 *     it. USER-specific; disabled while signed out or with no catalog-linked
 *     titles to check.
 *   - `usePersonMediaMeta` is the catalog aggregate (community avg_rating)
 *     per catalog-linked title — the fallback a card shows when the viewer
 *     hasn't rated it. Public catalog data (no user in the key).
 *
 * Conventions (same as ./media.ts and ./tracking.ts): keys come from
 * ./keys.ts (never inline arrays); throw raw Supabase errors inside
 * `queryFn` (TanStack surfaces them via `error` for a retry treatment);
 * `useAuth()` supplies the viewer; `select` columns stay explicit.
 */

import { useQuery } from "@tanstack/react-query";
import type { PersonCreditInput } from "@intertaind/media";
import type { Tables } from "@intertaind/supabase";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/** How old a `people` row may be before `usePerson` re-enriches it. */
const STALE_AFTER_DAYS = 30;

/**
 * A `people`/`person_credits` row is stale when it's missing entirely
 * (`enrichedAt` null/undefined) or was last enriched more than `days` ago —
 * the trigger for `usePerson` to invoke the `person` Edge Function. An
 * unparseable timestamp is treated as stale (re-enrich rather than trust
 * garbage).
 */
function isStale(
  enrichedAt: string | null | undefined,
  days = STALE_AFTER_DAYS
): boolean {
  if (!enrichedAt) return true;
  const enrichedMs = Date.parse(enrichedAt);
  if (Number.isNaN(enrichedMs)) return true;
  const ageMs = Date.now() - enrichedMs;
  return ageMs > days * 24 * 60 * 60 * 1000;
}

/**
 * The columns `PersonCreditInput` needs, mirrored as the `.select()` string
 * below. Kept in one place so the select and the map can't drift.
 */
const PERSON_CREDIT_COLUMNS =
  "media_tmdb_id, media_type, title, release_date, poster_path, overview, character, billing_order, job, department, credit_type, vote_average, vote_count, genre_ids, media_item_id";

/** The subset of a `person_credits` row we read for the filmography. */
type PersonCreditRow = Pick<
  Tables<"person_credits">,
  | "media_tmdb_id"
  | "media_type"
  | "title"
  | "release_date"
  | "poster_path"
  | "overview"
  | "character"
  | "billing_order"
  | "job"
  | "department"
  | "credit_type"
  | "vote_average"
  | "vote_count"
  | "genre_ids"
  | "media_item_id"
>;

export type PersonDetail = {
  person: Tables<"people">;
  credits: PersonCreditInput[];
};

/**
 * One person's catalog data — bio row + every credit — for the Person page.
 *
 * No user in the key: this is public catalog data (RLS allows anon reads on
 * both tables), so it's shared across viewers and works pre-auth.
 *
 * queryFn is get-or-enrich, mirroring the Edge Function's contract:
 *   1. Read the `people` row by `tmdb_id`.
 *   2. If it's missing or stale (>30d), invoke the `person` Edge Function
 *      (which holds the TMDB secret) to enrich, then re-read. An enrichment
 *      error is thrown so the screen can show a retry.
 *   3. If there's still no row, the person genuinely doesn't exist → throw.
 *   4. Read `person_credits` and map to `PersonCreditInput[]`.
 */
export function usePerson(tmdbId: number) {
  return useQuery({
    queryKey: queryKeys.person.detail(tmdbId),
    queryFn: async (): Promise<PersonDetail> => {
      const readPerson = async (): Promise<Tables<"people"> | null> => {
        const { data, error } = await supabase
          .from("people")
          .select("*")
          .eq("tmdb_id", tmdbId)
          .maybeSingle();
        if (error) throw error;
        return data;
      };

      let person = await readPerson();

      if (isStale(person?.enriched_at)) {
        // Missing or stale → get-or-enrich. `functions.invoke` is the
        // supabase-js Edge Function client; it forwards the anon JWT
        // automatically. A failed enrichment is thrown so the screen can
        // offer a retry rather than render a half-populated page.
        const { error: invokeError } = await supabase.functions.invoke(
          "person",
          { body: { tmdb_id: tmdbId } }
        );
        if (invokeError) throw invokeError;
        person = await readPerson();
      }

      if (!person) throw new Error("Person not found.");

      const { data: creditRows, error: creditsError } = await supabase
        .from("person_credits")
        .select(PERSON_CREDIT_COLUMNS)
        .eq("person_tmdb_id", tmdbId)
        .returns<PersonCreditRow[]>();
      if (creditsError) throw creditsError;

      // `media_type`/`credit_type` are `string` on the generated Row type
      // (Postgres CHECK columns don't generate unions), but the table's
      // CHECK constraints guarantee the only stored values are
      // 'movie'|'tv' and 'cast'|'crew' — the exact unions PersonCreditInput
      // declares. Narrowing here is safe and lets the UI hand `credits`
      // straight to mergeCredits() without a further cast.
      const credits: PersonCreditInput[] = (creditRows ?? []).map((row) => ({
        ...row,
        media_type: row.media_type as "movie" | "tv",
        credit_type: row.credit_type as "cast" | "crew",
      }));

      return { person, credits };
    },
  });
}

/** One catalog-linked title's tracking state for the viewer. */
export type PersonTrackingEntry = {
  status: string;
  rating: number | null;
  is_favorite: boolean;
};

/**
 * The viewer's tracking rows among this person's catalog-linked titles —
 * a `Map<media_id, { status, rating, is_favorite }>` over the
 * `media_item_id`s the Person page resolved from the credits. The screen
 * derives BOTH the "X of Y watched" stat (statuses) AND each card's
 * viewer-rating/loved-heart from this one map, so it replaces the old
 * watched-only `Set`.
 *
 * USER-specific and RLS'd to the owner, so it's disabled while signed out;
 * also disabled when there are no catalog-linked ids to check (nothing to
 * fetch). Mirrors `useViewerTracking`'s signed-out handling: the key uses
 * `user?.id ?? "anon"` to stay stable, and `enabled` gates the fetch so
 * every fetched entry is keyed by a real `user.id`.
 */
export function usePersonTracking(tmdbId: number, mediaItemIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.person.tracking(user?.id ?? "anon", tmdbId),
    enabled: !!user && mediaItemIds.length > 0,
    queryFn: async (): Promise<Map<string, PersonTrackingEntry>> => {
      const { data, error } = await supabase
        .from("user_media")
        .select("media_id, status, rating, is_favorite")
        .eq("user_id", user!.id)
        .in("media_id", mediaItemIds);
      if (error) throw error;
      return new Map(
        (data ?? []).map((row) => [
          row.media_id,
          {
            status: row.status,
            rating: row.rating,
            // `is_favorite` is nullable in the DB row; a null favorite means
            // "not favorited", so normalize to a strict boolean here.
            is_favorite: row.is_favorite ?? false,
          },
        ])
      );
    },
  });
}

/**
 * The community aggregate rating per catalog-linked title — a
 * `Map<media_id, avg_rating>` where `avg_rating` is the 0–5 display scale
 * (migration 025, no ÷2). This is the fallback a card shows beneath its
 * poster when the viewer hasn't rated the title themselves.
 *
 * Public catalog data (RLS allows anon reads on `media_items`), so NO user
 * in the key — shared across viewers and works pre-auth. Disabled when
 * there are no catalog-linked ids to fetch. `avg_rating` can come back as a
 * numeric string from PostgREST, so it's coerced with `Number()` (null
 * stays null).
 */
export function usePersonMediaMeta(tmdbId: number, mediaItemIds: string[]) {
  return useQuery({
    queryKey: queryKeys.person.mediaMeta(tmdbId),
    enabled: mediaItemIds.length > 0,
    queryFn: async (): Promise<Map<string, number | null>> => {
      const { data, error } = await supabase
        .from("media_items")
        .select("id, avg_rating")
        .in("id", mediaItemIds);
      if (error) throw error;
      return new Map(
        (data ?? []).map((row) => [
          row.id,
          row.avg_rating == null ? null : Number(row.avg_rating),
        ])
      );
    },
  });
}
