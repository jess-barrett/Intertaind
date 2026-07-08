/**
 * TvWatchingSheet — the "Currently Watching / where are you?" bottom
 * sheet for TV shows.
 *
 * The RN mirror of web's
 * `apps/web/src/components/modals/current-episode-modal.tsx` + its
 * `onSave` in `media-detail-client.tsx` (the `currentEpisodeModalOpen`
 * branch). Opened from the action strip's "Watching" pill
 * (`onOpenWatching`).
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, one
 * `useTrackMediaMutation` write on Save, mapped inline errors, and the
 * progress-merge OPTIMISTIC_ID guard.
 *
 * ── What it sets (the pointer + bulk-fill) ────────────────────────────
 * The two pickers — Season + Episode — set the viewer's "where are you"
 * pointer (`current_season` / `current_episode`) and bulk-fill the
 * watched set. Web's rule, replicated EXACTLY:
 *   watched[String(season)] = [1 .. episode - 1]
 * i.e. the CHOSEN season's watched array is REPLACED with episodes
 * 1..(episode−1); the current episode itself is the pointer, not yet
 * "watched". Earlier full seasons are NOT auto-filled — web only touches
 * the chosen season's array — so we mirror that (a replacement, NOT an
 * iterative `addWatchedEpisode`, which couldn't shrink the array if the
 * user moves their pointer earlier). Every other progress key
 * (`episode_logs`, other seasons' `watched_episodes`, `seasons`,
 * `custom_backdrop_url`, …) is preserved via the merge base.
 *
 * ── Why no rating / review here ───────────────────────────────────────
 * Web's current-episode-modal DOES collect an optional season
 * rating/review, but its `onSave` only forwards them to the ACTIVITY row
 * (`activity_metadata_extra`) — it never writes `user_media.rating` /
 * `review` or a `progress` log. Mobile deliberately does NOT write
 * activity rows in M2 (see `queries/tracking.ts` header), so those fields
 * would persist to nowhere. Rather than surface write-to-nowhere inputs,
 * this sheet is scoped to what actually persists: the pointer + bulk-fill.
 * (Per-season rating/review lives in `TvLogSeasonSheet`; per-episode in
 * `TvLogEpisodeSheet`.)
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation`:
 *   status:   "in_progress"      (web: `trackMedia(id, "in_progress", …)`)
 *   progress: merged base → replaced watched[season] → current_season /
 *             current_episode
 * Then the sheet dismisses. rating / review / is_favorite are omitted, so
 * the upsert leaves those columns untouched (see tracking.ts merge rule).
 *
 * ── Seeding ───────────────────────────────────────────────────────────
 * Seeds Season / Episode from `progress.current_season` /
 * `current_episode` (S1E1 when untracked), remounting on seed change.
 */
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { ProgressRecord } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { parseTvSeasons } from "@/lib/tv-metadata";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";
import { EpisodeChips, SeasonChips } from "./tv-pickers";

/** The seed values, derived from the viewer's progress pointer. */
type Seed = {
  season: number;
  episode: number;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(
  viewerRow: Tables<"user_media"> | null,
  seasonNumbers: number[],
): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const firstSeason = seasonNumbers[0] ?? 1;
  const season = (progress?.current_season as number | undefined) ?? firstSeason;
  const episode = (progress?.current_episode as number | undefined) ?? 1;
  return { season, episode, seedKey: `${season}|${episode}` };
}

/** A labeled section — the locked field grammar (muted label + content). */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-text-secondary">{label}</Text>
      {children}
    </View>
  );
}

function TvWatchingForm({
  media,
  viewerRow,
  seed,
  onDismiss,
}: {
  media: MediaDetailItem;
  viewerRow: Tables<"user_media"> | null;
  seed: Seed;
  onDismiss: () => void;
}) {
  const seasonMeta = useMemo(
    () => parseTvSeasons(media.metadata),
    [media.metadata],
  );

  const [season, setSeason] = useState(seed.season);
  const [episode, setEpisode] = useState<number | null>(seed.episode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  const episodeCount = seasonMeta.episodeCountFor(season);

  // Dirty check (mirrors web's modals): Save disabled until the pointer
  // changes vs the seed, so re-saving the same position is a no-op.
  const isDirty = season !== seed.season || episode !== seed.episode;

  function handleSelectSeason(next: number) {
    setSeason(next);
    // Reset the episode when switching seasons — the old episode number
    // may not exist in the new season (web nulls it on season change).
    setEpisode(null);
  }

  async function handleSave() {
    if (!isDirty || episode == null || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys survive —
    // but NEVER merge from an optimistic row (its progress isn't the real
    // DB value yet).
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;

    // Web's exact bulk-fill: REPLACE the chosen season's watched array
    // with 1..(episode-1); the current episode is the pointer, not yet
    // watched. Earlier full seasons are untouched (web parity).
    const prevWatched =
      (existingProgress?.watched_episodes as
        | Record<string, number[]>
        | undefined) ?? {};
    const watched: Record<string, number[]> = { ...prevWatched };
    watched[String(season)] = Array.from(
      { length: episode - 1 },
      (_, i) => i + 1,
    );

    const progress: ProgressRecord = {
      ...(existingProgress ?? {}),
      current_season: season,
      current_episode: episode,
      watched_episodes: watched,
    };

    const vars = {
      mediaId: media.id,
      status: "in_progress" as const,
      progress: progress as Tables<"user_media">["progress"],
    };

    // Use mutateAsync + await rather than mutate(vars, { onSuccess }): the
    // optimistic write bumps viewerRow → the parent recomputes `seed` →
    // `seedKey` changes → React UNMOUNTS this form, and TanStack Query v5
    // DROPS a per-call `onSuccess` when the caller unmounts before the
    // mutation settles. The awaited continuation still runs, and onDismiss
    // targets the OUTER sheet's stable ref (which does not remount).
    try {
      await trackMutation.mutateAsync(vars);
      onDismiss();
    } catch (err) {
      setErrorMessage(
        trackingErrorMessage(err, "your progress", "tv-watching-sheet"),
      );
    }
  }

  const saving = trackMutation.isPending;

  return (
    <View className="gap-5">
      {/* Header: label + title + close. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Where are you?
          </Text>
          <Text
            className="text-lg font-bold text-text-primary"
            numberOfLines={2}
          >
            {media.title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="rounded-sm p-1 active:opacity-70"
          onPress={onDismiss}
        >
          <X size={22} color={colors["text-muted"]} />
        </Pressable>
      </View>

      {/* Season picker — horizontal scroll of season chips. */}
      <Field label="Season">
        <SeasonChips
          seasonNumbers={seasonMeta.seasonNumbers}
          selected={season}
          onSelect={handleSelectSeason}
        />
      </Field>

      {/* Episode picker — horizontal scroll of episode chips. */}
      <Field label="Current episode">
        <EpisodeChips
          episodeCount={episodeCount}
          selected={episode}
          onSelect={setEpisode}
        />
      </Field>

      {/* What the save will do — the pointer + bulk-fill hint (web parity). */}
      {episode != null ? (
        <Text className="text-xs text-text-muted">
          {episode > 1
            ? `Marking episodes 1–${episode - 1} watched; S${season}E${episode} is where you are now.`
            : `S${season}E${episode} is where you are now.`}
        </Text>
      ) : null}

      {/* Footer: Save (brand, bottom-right). No Loved toggle — the pointer
          sheet doesn't touch rating/favorite (see file header). */}
      <View className="flex-row items-center justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save progress"
          accessibilityState={{
            disabled: saving || !isDirty || episode == null,
            busy: saving,
          }}
          disabled={saving || !isDirty || episode == null}
          className={`rounded-sm bg-brand px-6 py-2.5 active:opacity-80 ${
            saving || !isDirty || episode == null ? "opacity-50" : ""
          }`}
          onPress={handleSave}
        >
          <Text className="text-sm font-semibold text-text-primary">
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      {/* Inline, mapped error (never the raw Supabase error). */}
      {errorMessage ? (
        <View className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
          <Text className="text-sm text-accent-movie">{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ref-driven "Currently Watching" sheet. Parent presents it via the
 * `AppSheetRef` (`present()`); the sheet dismisses itself on save. Only
 * meaningful for TV shows — mount it on the detail screen and wire its
 * `present()` to the action strip's `onOpenWatching`.
 */
const TvWatchingSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function TvWatchingSheet({ media, viewerRow }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  const seasonMeta = useMemo(
    () => parseTvSeasons(media.metadata),
    [media.metadata],
  );
  const seed = useMemo(
    () => deriveSeed(viewerRow, seasonMeta.seasonNumbers),
    [viewerRow, seasonMeta.seasonNumbers],
  );

  return (
    <AppSheet ref={sheetRef} accessibilityLabel={`Set progress for ${media.title}`}>
      <TvWatchingForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default TvWatchingSheet;
