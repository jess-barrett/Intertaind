/**
 * TvLogEpisodeSheet — the "Log an episode" bottom sheet for TV shows.
 *
 * The RN mirror of web's
 * `apps/web/src/components/modals/log-episode-modal.tsx` + its `onSave`
 * (`logEpisodeModalOpen` in `media-detail-client.tsx`, and
 * `handleLogEpisodeSave` in `tv-progress-header.tsx`). Opened from the
 * action strip's "Log Episode" button (`onOpenLogEpisode`).
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, `isDirty` gate,
 * `BottomSheetTextInput` review, one `useTrackMediaMutation` write on
 * Save, mapped inline errors, and the progress-merge OPTIMISTIC_ID guard.
 *
 * ── Pickers + fields ──────────────────────────────────────────────────
 * Season picker (chip row) · Episode picker (chip row, already-logged
 * episodes hinted) · Rating (StarRating) · Review (multiline). Seeds
 * Rating / Review from `episode_logs[season][episode]` when already
 * logged.
 *
 * ── WHERE the rating/review go (web log-episode parity — read carefully)
 * Web stores the episode's rating/review ONLY in the per-episode log
 * `progress.episode_logs[s][e] = { rating, review }` (rating on the 1–10
 * DB scale, i.e. `stars * 2`; review verbatim) and marks the episode
 * watched. It does NOT write a top-level `user_media.rating` / `review`
 * (those go only to the activity row, which mobile skips). We mirror
 * that: `setEpisodeLog` (which sets the log AND marks watched), and we
 * OMIT top-level rating/review from the mutation so those columns are
 * left untouched.
 *
 * ── Pointer advance + finale rule (web parity, replicated EXACTLY) ─────
 * After logging S{season}E{episode}, advance the "currently on" pointer:
 *   - normally: current_episode = episode + 1 (same season).
 *   - season finale (episode >= that season's episode_count): if the
 *     NEXT season has episodes → jump to next-season E1; if there is no
 *     next season (series finale) → keep the pointer on this episode and
 *     move status to "completed" (completed_at = now).
 *   - otherwise status is unchanged (existing status, else "in_progress").
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation`:
 *   status:       series-finale ? "completed" : (existing ?? "in_progress")
 *   progress:     setEpisodeLog(existing, season, episode, { rating,
 *                 review }) + current_season / current_episode advance
 *   completed_at: series-finale ? now : null
 * rating / review / is_favorite are omitted (left untouched — the log
 * carries the episode's rating/review).
 */
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  ratingToStars,
  type EpisodeLog,
  type ProgressRecord,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import StarRating from "@/components/star-rating";
import { SpoilerToggle } from "@/components/media/log-form";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { buildEpisodeLogVars } from "@/lib/tv-log";
import { parseTvSeasons } from "@/lib/tv-metadata";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";
import { EpisodeChips, SeasonChips } from "./tv-pickers";

/** Read the per-season × per-episode log map off a progress blob. */
function readEpisodeLogs(
  progress: ProgressRecord | null,
): Record<string, Record<string, EpisodeLog>> {
  return (
    (progress?.episode_logs as
      | Record<string, Record<string, EpisodeLog>>
      | undefined) ?? {}
  );
}

/** Read the watched-episodes map off a progress blob. */
function readWatched(
  progress: ProgressRecord | null,
): Record<string, number[]> {
  return (
    (progress?.watched_episodes as Record<string, number[]> | undefined) ?? {}
  );
}

/** The seed values, derived from the viewer's pointer. */
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

function TvLogEpisodeForm({
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

  const existingProgress =
    viewerRow && viewerRow.id !== OPTIMISTIC_ID
      ? ((viewerRow.progress ?? null) as ProgressRecord | null)
      : null;
  const episodeLogs = readEpisodeLogs(existingProgress);
  const watchedEpisodes = readWatched(existingProgress);

  /** The stored log for a given season/episode (undefined when unlogged). */
  const storedLog = (s: number, e: number): EpisodeLog | undefined =>
    episodeLogs[String(s)]?.[String(e)];

  const [season, setSeason] = useState(seed.season);
  const [episode, setEpisode] = useState<number | null>(seed.episode);
  const seedLog =
    episode != null ? storedLog(seed.season, seed.episode) : undefined;
  const [stars, setStars] = useState<number | null>(
    seedLog?.rating != null ? ratingToStars(seedLog.rating) : null,
  );
  const [review, setReview] = useState(seedLog?.review ?? "");
  const [hasSpoilers, setHasSpoilers] = useState(seedLog?.has_spoilers ?? false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  const episodeCount = seasonMeta.episodeCountFor(season);

  // Dirty check: an episode must be selected, and either it's unlogged or
  // its rating/review changed vs what's stored.
  const currentStored = episode != null ? storedLog(season, episode) : undefined;
  const storedStars =
    currentStored?.rating != null ? ratingToStars(currentStored.rating) : null;
  const storedReview = currentStored?.review ?? "";
  const storedHasSpoilers = currentStored?.has_spoilers ?? false;
  const isDirty =
    episode != null &&
    (!currentStored ||
      stars !== storedStars ||
      review !== storedReview ||
      hasSpoilers !== storedHasSpoilers);

  function handleSelectSeason(next: number) {
    setSeason(next);
    setEpisode(null);
    setStars(null);
    setReview("");
    setHasSpoilers(false);
  }

  function handleSelectEpisode(next: number) {
    setEpisode(next);
    // Reseed rating/review/spoiler from any existing log for this episode.
    const existing = storedLog(season, next);
    setStars(existing?.rating != null ? ratingToStars(existing.rating) : null);
    setReview(existing?.review ?? "");
    setHasSpoilers(existing?.has_spoilers ?? false);
  }

  async function handleSave() {
    if (!isDirty || episode == null || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Shared episode-log rules (per-episode log + watched mark + the pointer
    // advance / season-&-series-finale handling). No top-level rating/review —
    // those live in episode_logs (web parity). See lib/tv-log.
    const vars = buildEpisodeLogVars({
      existingProgress,
      seasonMeta,
      currentStatus: (viewerRow?.status as TrackingStatus | undefined) ?? null,
      season,
      episode,
      stars,
      review,
      hasSpoilers,
    });

    // Use mutateAsync + await rather than mutate(vars, { onSuccess }): the
    // optimistic write bumps viewerRow → the parent recomputes `seed` →
    // `seedKey` changes → React UNMOUNTS this form, and TanStack Query v5
    // DROPS a per-call `onSuccess` when the caller unmounts before the
    // mutation settles. The awaited continuation still runs, and onDismiss
    // targets the OUTER sheet's stable ref (which does not remount).
    try {
      await trackMutation.mutateAsync({ mediaId: media.id, ...vars });
      onDismiss();
    } catch (err) {
      setErrorMessage(
        trackingErrorMessage(err, "your episode log", "tv-log-episode-sheet"),
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
            Log episode
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

      {/* Episode picker — horizontal scroll of episode chips; already-logged
          episodes carry a subtle watched hint. */}
      <Field label="Episode">
        <EpisodeChips
          episodeCount={episodeCount}
          selected={episode}
          watchedEpisodes={watchedEpisodes[String(season)]}
          onSelect={handleSelectEpisode}
        />
      </Field>

      {/* Rating + review only once an episode is chosen (web parity: the
          rating/review block appears after episode selection). */}
      {episode != null ? (
        <>
          <Field label="Episode rating">
            <StarRating value={stars} onChange={setStars} size={30} />
          </Field>

          <Field label="Review">
            <BottomSheetTextInput
              value={review}
              onChangeText={setReview}
              placeholder="Thoughts on this episode..."
              placeholderTextColor={colors["text-muted"]}
              multiline
              accessibilityLabel="Episode review"
              className="min-h-[88px] rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
              style={{
                color: colors["text-primary"],
                textAlignVertical: "top",
              }}
            />
          </Field>

          {/* Spoiler toggle — disabled until the review has text (same control
              as the shared LogForm). */}
          <View className="flex-row">
            <SpoilerToggle
              value={hasSpoilers}
              onChange={setHasSpoilers}
              disabled={review.trim().length === 0}
            />
          </View>
        </>
      ) : null}

      {/* Footer: Save (brand, bottom-right). */}
      <View className="flex-row items-center justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save episode log"
          accessibilityState={{
            disabled: saving || !isDirty,
            busy: saving,
          }}
          disabled={saving || !isDirty}
          className={`rounded-sm bg-brand px-6 py-2.5 active:opacity-80 ${
            saving || !isDirty ? "opacity-50" : ""
          }`}
          onPress={handleSave}
        >
          <Text className="text-sm font-semibold text-text-primary">
            {saving ? "Saving…" : "Save episode"}
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
 * Ref-driven "Log an episode" sheet. Parent presents it via the
 * `AppSheetRef` (`present()`); the sheet dismisses itself on save. Only
 * meaningful for TV shows — mount it on the detail screen and wire its
 * `present()` to the action strip's `onOpenLogEpisode`.
 */
const TvLogEpisodeSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function TvLogEpisodeSheet({ media, viewerRow }, ref) {
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
    <AppSheet
      ref={sheetRef}
      accessibilityLabel={`Log an episode of ${media.title}`}
      // Content-panning off so the drag-to-rate stars aren't swallowed by the
      // sheet's body-drag (handle + backdrop + close still dismiss).
      enableContentPanningGesture={false}
    >
      <TvLogEpisodeForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default TvLogEpisodeSheet;
