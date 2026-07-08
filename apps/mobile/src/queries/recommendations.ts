/**
 * TanStack Query hooks for `recommendations` — the cross-media "if you
 * liked X, try Y" pairings ("intertains").
 *
 * READ side mirrors web's `fetchRecommendationsForSource` /
 * `fetchRecommendationsForTarget`
 * (apps/web/src/app/actions/recommendations.ts): a single PostgREST round
 * trip that embeds the paired `media_items` row + the author `profiles`
 * row via FK hints. WRITE side mirrors web's `createRecommendation`.
 *
 * Two FK-embed subtleties, both handled by casting the result (web does
 * the same on its server client):
 *
 *   1. `author:profiles!recommendations_user_id_fkey` — the
 *      `recommendations.user_id` FK points at `auth.users(id)`, NOT
 *      `profiles(id)`, so this relationship is ABSENT from the generated
 *      `Database` Relationships. PostgREST resolves it fine at runtime
 *      (user_id → auth.users.id ← profiles.id), but the typed query
 *      builder can't infer the embed's shape. Web sidesteps this by
 *      casting `data as RecommendationWith…[]`; we do the same.
 *   2. We select an explicit COLUMN subset inside each embed (only what a
 *      card renders), so even the inferable media embed wouldn't match the
 *      full `MediaItem`/`Profile` shapes. The cast covers that too.
 *
 * Embed ALIASES match the shapes in `@intertaind/types`
 * (`RecommendationWithTarget` names the target `recommended_media` + the
 * author `profiles`; `RecommendationWithSource` names the source
 * `source_media` + `profiles`). Web aliases the media embed
 * (`recommended_media:` / `source_media:`) but leaves the profile embed
 * UNALIASED (`profiles!…`) so PostgREST names it `profiles` — which is
 * exactly the field the types declare. We keep that: alias the media,
 * leave the profile named `profiles`.
 *
 * RLS: `recommendations_select_public_or_owner` filters reads to public
 * authors (or the owner), so these anon-authed reads are safe and work
 * pre-auth — no Edge Function, no server secret.
 *
 * Column subsets: cards need the paired media's id / media_type / title /
 * cover_image_url / release_date and the author's id / username /
 * display_name / avatar_url. Add a column here AND to the embed string if
 * a card later renders more.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MediaItem,
  Profile,
  RecommendationWithSource,
  RecommendationWithTarget,
} from "@intertaind/types";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "./keys";

/** How many recs to pull per direction — web reads 20 (`limit` default). */
const RECS_LIMIT = 20;

/**
 * Card-facing subset of each embedded row. Narrower than the full
 * `MediaItem`/`Profile` the `@intertaind/types` shapes declare — the
 * recommendation card only renders these columns. Kept as the RETURN
 * shape (not the full types) so callers can't read a column the query
 * didn't fetch. Structurally a subset of `MediaItem`/`Profile`, so it
 * still satisfies those where the wider type is expected.
 */
export type RecommendationCardMedia = Pick<
  MediaItem,
  "id" | "media_type" | "title" | "cover_image_url" | "release_date"
>;
export type RecommendationCardAuthor = Pick<
  Profile,
  "id" | "username" | "display_name" | "avatar_url"
>;

/** Rec hydrated for the "Pairs with this" (source) direction. */
export type RecommendationForSource = Omit<
  RecommendationWithTarget,
  "recommended_media" | "profiles"
> & {
  recommended_media: RecommendationCardMedia;
  profiles: RecommendationCardAuthor;
};

/** Rec hydrated for the "Intertaind for this" (target) direction. */
export type RecommendationForTarget = Omit<
  RecommendationWithSource,
  "source_media" | "profiles"
> & {
  source_media: RecommendationCardMedia;
  profiles: RecommendationCardAuthor;
};

// Embedded-column selections, shared by the two reads. Media alias differs
// per direction; the author embed is identical (left named `profiles`).
const MEDIA_COLS = "id, media_type, title, cover_image_url, release_date";
const AUTHOR_EMBED =
  "profiles:profiles!recommendations_user_id_fkey(id, username, display_name, avatar_url)";

/**
 * Recs WHERE source = mediaId — the "Pairs with this" list: this media is
 * the source, so the recommended TARGET is the interesting side to render
 * (+ the author + note). Mirrors web `fetchRecommendationsForSource`.
 *
 * Public catalog read (RLS-scoped to public authors), so it works
 * pre-auth. Newest first, capped at 20 (web parity).
 */
export function useRecommendationsForSource(mediaId: string) {
  return useQuery({
    queryKey: queryKeys.recommendations.forSource(mediaId),
    queryFn: async (): Promise<RecommendationForSource[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          `*, recommended_media:media_items!recommendations_recommended_media_id_fkey(${MEDIA_COLS}), ${AUTHOR_EMBED}`,
        )
        .eq("source_media_id", mediaId)
        .order("created_at", { ascending: false })
        .limit(RECS_LIMIT);
      if (error) throw error;
      // Cast: the `profiles` embed traverses auth.users so the query
      // builder can't infer it, and both embeds are column subsets. See
      // the file header.
      return (data ?? []) as unknown as RecommendationForSource[];
    },
  });
}

/**
 * Recs WHERE target = mediaId — the inverse "Intertaind for this" list:
 * this media is the recommended target, so the SOURCE is the interesting
 * side to render (+ author + note). Mirrors web
 * `fetchRecommendationsForTarget`.
 */
export function useRecommendationsForTarget(mediaId: string) {
  return useQuery({
    queryKey: queryKeys.recommendations.forTarget(mediaId),
    queryFn: async (): Promise<RecommendationForTarget[]> => {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          `*, source_media:media_items!recommendations_source_media_id_fkey(${MEDIA_COLS}), ${AUTHOR_EMBED}`,
        )
        .eq("recommended_media_id", mediaId)
        .order("created_at", { ascending: false })
        .limit(RECS_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as RecommendationForTarget[];
    },
  });
}

export type CreateRecommendationVars = {
  sourceMediaId: string;
  recommendedMediaId: string;
  note?: string;
};

/**
 * Author a new "if you liked SOURCE, try RECOMMENDED" pairing. Mirrors
 * web `createRecommendation`, RLS-safe via `recommendations_insert_self`
 * (WITH CHECK user_id = auth.uid()).
 *
 * The DB enforces the invariants; we surface the two the user can trip:
 *   - `no_self_recommend` CHECK (source ≠ target) — we also short-circuit
 *     before the round trip with the same message web uses.
 *   - `unique_rec` UNIQUE(user_id, source, recommended) → Postgres 23505
 *     when the author already made this exact pairing. Mapped to a
 *     friendly Error the caller can show.
 * `note` is trimmed and stored `note || null`; the DB's ≤280 CHECK is the
 * backstop (the picker UI will cap input length when it lands).
 *
 * Activity feed: web ALSO inserts an `activity_log` row here so followers
 * see the rec. Mobile defers ALL activity logging to the M3 Postgres
 * trigger (per the tracking.ts convention) — do NOT port web's activity
 * block here; delete web's once the trigger lands.
 *
 * On success invalidates BOTH directions' lists for the affected media +
 * the source's media detail (the `recommendations_counts_trigger`
 * denormalizes `recommendations_count` / `recommended_for_count` onto
 * `media_items`, which the detail read shows).
 *
 * NOTE: not exercisable end-to-end yet — there's no media picker until the
 * search Edge Function lands. Built correct for when it does.
 */
export function useCreateRecommendationMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateRecommendationVars): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      if (vars.sourceMediaId === vars.recommendedMediaId) {
        throw new Error("Can't intertain a media with itself");
      }
      const { error } = await supabase.from("recommendations").insert({
        user_id: user.id,
        source_media_id: vars.sourceMediaId,
        recommended_media_id: vars.recommendedMediaId,
        note: vars.note?.trim() || null,
      });
      if (error) {
        // 23505 = unique-violation on (user_id, source, recommended):
        // this author already made this exact pairing.
        if (error.code === "23505") {
          throw new Error("You've already intertaind this pairing");
        }
        throw error;
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recommendations.forSource(vars.sourceMediaId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recommendations.forTarget(vars.recommendedMediaId),
      });
      // The counts trigger bumped the denormalized rec counts on the
      // source's media_items row — refetch its detail so they show.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detail(vars.sourceMediaId),
      });
    },
  });
}
