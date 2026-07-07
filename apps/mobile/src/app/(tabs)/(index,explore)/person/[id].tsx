/**
 * Person / Filmography screen — the RN mirror of web's person page
 * (apps/web/src/app/person/[id]/page.tsx).
 *
 * SHARED route inside the tab navigator: this file lives in the array-group
 * folder `(tabs)/(index,explore)/person/[id].tsx`, so it's extrapolated
 * into BOTH per-tab Stacks (`(index)` and `(explore)`), exactly like
 * `media/[id].tsx`. `router.push("/person/<tmdbId>")` therefore pushes it
 * onto the CURRENT tab's Stack, beneath the persistent bottom navbar.
 *
 * Unlike media/[id] this screen has NO hero backdrop, so its `<Stack.Screen>`
 * header is OPAQUE (`surface-default`) rather than transparent — the native
 * back button sits on the page background and the content scrolls beneath it.
 *
 * The screen delegates scrolling to `FilmographyList` (a single FlatList
 * that owns the whole page's scroll — the person header is passed in as its
 * `ListHeaderComponent`), so there is no ScrollView here: nesting the grid
 * FlatList in a ScrollView would break virtualization.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react-native";
import { tmdbImageUrl } from "@intertaind/media";
import { colors } from "@intertaind/design-system";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";
import { useAuth } from "@/components/auth-provider";
import { BiographyText } from "@/components/media/biography-text";
import { FilmographyList } from "@/components/media/filmography-list";
import { queryKeys } from "@/queries/keys";
import {
  usePerson,
  usePersonMediaMeta,
  usePersonTracking,
  type PersonTrackingEntry,
} from "@/queries/person";

/**
 * Format an ISO date for the Born/Died meta rows — the RN port of web's
 * `formatDate` (person page). Falls back to the raw string if unparseable.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tmdbId = Number(id);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const detail = usePerson(tmdbId);

  // After a card quick-action writes, the batched per-person tracking map
  // (and the community media-meta map, if a rating shifted an aggregate) is
  // now stale — invalidate both so every card's active states + fallback
  // rating refresh. Keyed exactly as usePersonTracking / usePersonMediaMeta.
  const onMutated = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.person.tracking(user?.id ?? "anon", tmdbId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.person.mediaMeta(tmdbId),
    });
  };

  // Hooks can't be conditional — derive the catalog-linked ids from whatever
  // data is loaded (empty until then) and call the tracking/meta hooks
  // unconditionally. Both are `enabled`-gated on a non-empty id list, so a
  // pre-load empty list is a no-op.
  const credits = detail.data?.credits ?? [];
  const castCredits = credits.filter((c) => c.credit_type === "cast");
  const total = castCredits.length;
  // ALL credits, not just cast: any card (crew titles too) may be cataloged
  // and wants its viewer-rating/heart/community-avg on the poster.
  const linkedIds = Array.from(
    new Set(
      credits.map((c) => c.media_item_id).filter((x): x is string => !!x)
    )
  );

  const tracking = usePersonTracking(tmdbId, linkedIds);
  const mediaMeta = usePersonMediaMeta(tmdbId, linkedIds);
  const trackingMap =
    tracking.data ?? new Map<string, PersonTrackingEntry>();
  const mediaMetaMap = mediaMeta.data ?? new Map<string, number | null>();

  // "X of Y watched" — Y is the cast-credit count (as before); X is the
  // number of DISTINCT cast credits whose catalog id has a tracking entry in
  // a watched status (completed/in_progress). Distinct via a Set so a title
  // credited twice (e.g. two roles merged) can't double-count.
  const watchedCount = new Set(
    castCredits
      .map((c) => c.media_item_id)
      .filter((id): id is string => {
        if (!id) return false;
        const status = trackingMap.get(id)?.status;
        return status === "completed" || status === "in_progress";
      })
  ).size;

  // Invalid route param → the same error treatment as a failed load.
  if (Number.isNaN(tmdbId)) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-default px-6">
        <Stack.Screen options={personHeaderOptions} />
        <Text className="text-center text-text-primary">
          Couldn&apos;t load this person.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-default">
      <Stack.Screen options={personHeaderOptions} />

      {detail.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-text-primary">
            Couldn&apos;t load this person.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading this person"
            className="rounded-sm bg-brand px-4 py-3 active:opacity-70"
            onPress={() => detail.refetch()}
          >
            <Text className="font-semibold text-text-primary">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FilmographyList
          credits={detail.data.credits}
          tracking={trackingMap}
          mediaMeta={mediaMetaMap}
          onMutated={onMutated}
          header={
            <PersonHeader
              person={detail.data.person}
              total={total}
              watchedCount={watchedCount}
              // The tracked-% box is signed-in-only (web gates on `user`).
              showTracked={!!user}
            />
          }
        />
      )}
    </View>
  );
}

/**
 * Opaque native header — no hero backdrop on this screen, so the back
 * button sits on the page background and content scrolls below it.
 */
const personHeaderOptions = {
  headerShown: true,
  title: "",
  headerStyle: { backgroundColor: colors["surface-default"] },
  headerTintColor: colors["text-primary"],
  headerShadowVisible: false,
} as const;

/**
 * The person header — portrait + name/meta in a row, the tracked-% chip,
 * and the biography full-width below. Mirrors web's INFORMATION (portrait,
 * name, Born/Died/From, "{watched} of {total}" + "{pct}% watched",
 * biography); the LAYOUT is adapted to a phone (portrait beside a stacked
 * name/meta column, bio spanning the full width beneath).
 */
function PersonHeader({
  person,
  total,
  watchedCount,
  showTracked,
}: {
  person: Tables<"people">;
  total: number;
  watchedCount: number;
  showTracked: boolean;
}) {
  const portraitUrl = tmdbImageUrl(person.profile_path, "w500");
  const pct = total > 0 ? Math.round((watchedCount / total) * 100) : 0;

  return (
    <View className="px-4 pt-4">
      <View className="flex-row gap-4">
        {/* Portrait — 2:3 profile art, sharp corners + hairline border,
            lucide User fallback (matching web). */}
        <View className="aspect-[2/3] w-28 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
          {portraitUrl ? (
            <Image
              source={{ uri: portraitUrl }}
              className="h-full w-full"
              contentFit="cover"
              accessible
              accessibilityLabel={person.name}
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <User size={40} color={colors["text-muted"]} />
            </View>
          )}
        </View>

        {/* Name + Born/Died/From meta + tracked-% chip. */}
        <View className="flex-1 justify-center gap-3">
          <Text className="text-2xl font-bold text-text-primary">
            {person.name}
          </Text>

          {person.birthday || person.deathday || person.place_of_birth ? (
            <View className="gap-1.5">
              {person.birthday ? (
                <MetaRow label="Born" value={formatDate(person.birthday)} />
              ) : null}
              {person.deathday ? (
                <MetaRow label="Died" value={formatDate(person.deathday)} />
              ) : null}
              {person.place_of_birth ? (
                <MetaRow label="From" value={person.place_of_birth} />
              ) : null}
            </View>
          ) : null}

          {/* Tracked-% — signed-in-only AND only when the person has cast
              credits (total > 0). Mirrors web's aside box. */}
          {showTracked && total > 0 ? (
            <View className="rounded-sm border border-surface-border bg-surface-raised p-3">
              <Text className="text-sm font-medium text-text-primary">
                {watchedCount} of {total}
              </Text>
              <Text className="text-xs text-text-muted">{pct}% watched</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Biography — full-width beneath the portrait/name row. */}
      {person.biography ? (
        <View className="mt-4">
          <BiographyText text={person.biography} />
        </View>
      ) : null}
    </View>
  );
}

/** One Born/Died/From meta row — uppercase muted label over the value. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </Text>
      <Text className="text-sm text-text-secondary">{value}</Text>
    </View>
  );
}
