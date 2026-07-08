/**
 * TvLogSeasonSheet — the "Log a season" bottom sheet for TV shows.
 *
 * The RN mirror of web's `apps/web/src/components/modals/tv-modal.tsx` +
 * its `onSave` (`handleModalSave` in `media-detail-client.tsx`, and the
 * end-of-season flow in `tv-progress-header.tsx`). Opened from the action
 * strip's "Log Season" button (`onOpenLogSeason`).
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, `isDirty` gate,
 * `BottomSheetTextInput` review, one `useTrackMediaMutation` write on
 * Save, mapped inline errors, and the progress-merge OPTIMISTIC_ID guard.
 *
 * ── Pickers + fields ──────────────────────────────────────────────────
 * Season picker (chip row) · Rating (StarRating) · Review (multiline).
 * Logging a season marks it `completed: true` (web's tv-modal
 * `handleSaveSeason` always sets `completed: true`). Seeds Rating /
 * Review from `seasons[chosenSeason]` when already logged.
 *
 * ── WHERE the rating/review go (web tv-modal parity — read carefully) ──
 * Web's tv-modal stores the season's own rating/review in the PER-SEASON
 * log object `progress.seasons[n] = { rating, review, completed }`
 * (rating on the 1–10 DB scale, i.e. `stars * 2`; review verbatim). It
 * ALSO writes a TOP-LEVEL `user_media.rating` = the AVERAGE of all rated
 * seasons (rounded, DB scale) and a TOP-LEVEL `review: ""` (web's
 * `commit()`: `rating: avgRating, review: ""`). We mirror BOTH:
 *   - per-season log via `setSeasonLog(existing, season, { rating, review,
 *     completed: true })`;
 *   - top-level `rating` = rounded average of every rated season in the
 *     merged map, `review` = "" (empty).
 *
 * ── Status + current_season (web parity) ──────────────────────────────
 * Web sets `status: allCompleted ? "completed" : "in_progress"` (all =
 * every season logged completed) and `completed_at` = now / null to
 * match, plus `progress.current_season = completedCount + 1`. We compute
 * the same from the MERGED seasons map (the existing map + this save).
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation`:
 *   status:       all ? "completed" : "in_progress"
 *   rating:       rounded average of rated seasons (DB scale) or null
 *   review:       ""                     (web parity — top-level review
 *                 stays empty; the season's review lives in the log)
 *   progress:     setSeasonLog(existing, season, { rating, review,
 *                 completed: true }) + current_season = completedCount + 1
 *   completed_at: all ? now : null
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
  setSeasonLog,
  starsToRating,
  type ProgressRecord,
  type SeasonLog,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import StarRating from "@/components/star-rating";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { parseTvSeasons } from "@/lib/tv-metadata";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";
import { SeasonChips } from "./tv-pickers";

/** Read the existing per-season log map off a progress blob. */
function readSeasons(
  progress: ProgressRecord | null,
): Record<string, SeasonLog> {
  return (progress?.seasons as Record<string, SeasonLog> | undefined) ?? {};
}

/** The seed values, derived from the viewer's row + chosen season. */
type Seed = {
  season: number;
  stars: number | null;
  review: string;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(
  viewerRow: Tables<"user_media"> | null,
  seasonNumbers: number[],
): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const seasons = readSeasons(progress);
  // Default the season to the current pointer, else the first season.
  const firstSeason = seasonNumbers[0] ?? 1;
  const season =
    (progress?.current_season as number | undefined) ?? firstSeason;
  const existing = seasons[String(season)];
  const stars = existing?.rating != null ? ratingToStars(existing.rating) : null;
  const review = existing?.review ?? "";
  return {
    season,
    stars,
    review,
    seedKey: `${season}|${stars ?? ""}|${review}`,
  };
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

function TvLogSeasonForm({
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
  const [stars, setStars] = useState<number | null>(seed.stars);
  const [review, setReview] = useState(seed.review);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  // The season's existing log (for the dirty check + season-switch reseed).
  const existingProgress =
    viewerRow && viewerRow.id !== OPTIMISTIC_ID
      ? ((viewerRow.progress ?? null) as ProgressRecord | null)
      : null;
  const existingSeasons = readSeasons(existingProgress);

  // Dirty check: Save enabled once the chosen season's rating/review
  // differs from what's stored (or the season was never logged). Mirrors
  // web's tv-modal, which disables Save until the seasons map changes.
  const storedForSeason = existingSeasons[String(season)];
  const storedStars =
    storedForSeason?.rating != null ? ratingToStars(storedForSeason.rating) : null;
  const storedReview = storedForSeason?.review ?? "";
  const isDirty =
    !storedForSeason || stars !== storedStars || review !== storedReview;

  function handleSelectSeason(next: number) {
    setSeason(next);
    const existing = existingSeasons[String(next)];
    setStars(existing?.rating != null ? ratingToStars(existing.rating) : null);
    setReview(existing?.review ?? "");
  }

  async function handleSave() {
    if (!isDirty || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Per-season log — rating on the 1–10 DB scale (stars → DB), review
    // verbatim, completed:true (web's tv-modal always marks completed).
    const progress = setSeasonLog(existingProgress, season, {
      rating: starsToRating(stars),
      review,
      completed: true,
    });

    // Recompute current_season + the completed set from the MERGED map
    // (web: `current_season = completed + 1`, `status = all ? completed`).
    const mergedSeasons = progress.seasons as Record<string, SeasonLog>;
    const seasonValues = Object.values(mergedSeasons);
    const completedCount = seasonValues.filter((s) => s.completed).length;
    const seasonCount = Math.max(seasonMeta.seasonNumbers.length, 1);
    const all = completedCount >= seasonCount;
    progress.current_season = completedCount + 1;

    // Top-level rating = rounded average of every RATED season (DB scale),
    // exactly like web's `commit()`. Null when no season carries a rating.
    const ratedSeasons = seasonValues.filter((s) => s.rating != null);
    const avgRating =
      ratedSeasons.length > 0
        ? Math.round(
            ratedSeasons.reduce((sum, s) => sum + (s.rating ?? 0), 0) /
              ratedSeasons.length,
          )
        : null;

    const vars = {
      mediaId: media.id,
      status: all ? ("completed" as const) : ("in_progress" as const),
      // Top-level rating = rated-season average; review stays empty
      // (web parity — the season's own review lives in the log object).
      rating: avgRating,
      review: "",
      progress: progress as Tables<"user_media">["progress"],
      completed_at: all ? new Date().toISOString() : null,
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
        trackingErrorMessage(err, "your season log", "tv-log-season-sheet"),
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
            Log season
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

      {/* Rating — gold StarRating (owns the color) + numeric value + Clear. */}
      <Field label="Rating">
        <StarRating value={stars} onChange={setStars} size={30} />
      </Field>

      {/* Review — BottomSheetTextInput so the field rides above the
          keyboard while the sheet stays presented. */}
      <Field label="Review">
        <BottomSheetTextInput
          value={review}
          onChangeText={setReview}
          placeholder="Thoughts on this season..."
          placeholderTextColor={colors["text-muted"]}
          multiline
          accessibilityLabel="Season review"
          className="min-h-[88px] rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{
            color: colors["text-primary"],
            textAlignVertical: "top",
          }}
        />
      </Field>

      {/* Footer: Save (brand, bottom-right). Marking a season complete is
          the whole action — no separate "completed" toggle (web always
          sets completed:true on a season log). */}
      <View className="flex-row items-center justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save season log"
          accessibilityState={{ disabled: saving || !isDirty, busy: saving }}
          disabled={saving || !isDirty}
          className={`rounded-sm bg-brand px-6 py-2.5 active:opacity-80 ${
            saving || !isDirty ? "opacity-50" : ""
          }`}
          onPress={handleSave}
        >
          <Text className="text-sm font-semibold text-text-primary">
            {saving ? "Saving…" : "Save season"}
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
 * Ref-driven "Log a season" sheet. Parent presents it via the
 * `AppSheetRef` (`present()`); the sheet dismisses itself on save. Only
 * meaningful for TV shows — mount it on the detail screen and wire its
 * `present()` to the action strip's `onOpenLogSeason`.
 */
const TvLogSeasonSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function TvLogSeasonSheet({ media, viewerRow }, ref) {
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
    <AppSheet ref={sheetRef} accessibilityLabel={`Log a season of ${media.title}`}>
      <TvLogSeasonForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default TvLogSeasonSheet;
