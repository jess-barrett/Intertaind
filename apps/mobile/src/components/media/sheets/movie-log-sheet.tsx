/**
 * MovieLogSheet — the movie log/review bottom sheet, and the LOCKED
 * design reference for every log/review sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/movie-modal.tsx`
 * (opened from that page's action column). It now renders the SHARED
 * `LogForm` — the same form the quick-log (+) flow uses — so logging looks and
 * behaves identically everywhere. Fields top→bottom: Watched on (a slide-up
 * WHEEL date picker) · Rating + a right-aligned Loved heart · Review · two
 * dynamic toggles (First watch↔Rewatch, No spoilers↔Contains spoilers, the
 * latter disabled until the review has text).
 *
 * `LogForm` is rendered with `showStatus={false}` — this sheet is entered in a
 * fixed "log film" (completed) mode; status lives on the action strip. Its
 * review field is `BottomSheetTextInput` so it rides above the keyboard while
 * the @gorhom sheet is presented.
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation` call (web parity):
 *   status:       "completed"
 *   rating:       starsToRating(stars)         (display 0.5–5 → 1–10 DB)
 *   review:       the review text (trackMedia normalizes ""→null)
 *   is_favorite:  the Loved toggle
 *   progress:     buildLogProgress(existing, "movie", { date, isRepeat, hasSpoilers })
 *   completed_at: the watched-on date as an ISO timestamp
 * Then the sheet dismisses.
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column, so we
 * MUST merge from the viewer's CURRENT progress or we'd silently wipe a sibling
 * key (e.g. `custom_backdrop_url`). `buildLogProgress` is that merge. Its
 * `existing` arg is GUARDED against an `OPTIMISTIC_ID` row: an
 * optimistically-synthesized first-track row's progress isn't the real DB value
 * yet, so we treat it as null rather than merge from it.
 *
 * ── Seeding from an already-logged movie ──────────────────────────────
 * When the viewer already logged this movie, the sheet seeds its initial
 * rating / review / loved / watched-on / rewatch / spoilers from that row
 * (mirroring web's `initial`). State is seeded per-present via a `key` that
 * changes with the seed, so re-opening after an external change re-seeds.
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
  starsToRating,
  type ProgressRecord,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import {
  LogForm,
  buildLogProgress,
  fromISODateOnly,
  logFormValueDirty,
  toISODateOnly,
  type LogFormValue,
} from "@/components/media/log-form";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";

/**
 * The seed values for the form, derived from the viewer's row (mirroring
 * web's `initial`). All defaults match web: watched_on from the row's
 * progress → completed_at date → today; rewatch/spoilers from progress; rating
 * converted DB→stars; review "" when absent; loved false when absent.
 */
type Seed = {
  value: LogFormValue;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(viewerRow: Tables<"user_media"> | null): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const watchedOn =
    (progress?.watched_on as string | undefined) ??
    viewerRow?.completed_at?.split("T")[0] ??
    toISODateOnly(new Date());
  const isRepeat = (progress?.is_rewatch as boolean | undefined) ?? false;
  const hasSpoilers = (progress?.has_spoilers as boolean | undefined) ?? false;
  const rating =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const loved = viewerRow?.is_favorite ?? false;
  return {
    value: {
      date: fromISODateOnly(watchedOn),
      status: "completed",
      rating,
      review,
      loved,
      isRepeat,
      hasSpoilers,
    },
    seedKey: `${watchedOn}|${isRepeat}|${hasSpoilers}|${rating ?? ""}|${loved}|${review}`,
  };
}

/**
 * The form body. Split from the ref wrapper so its state is REMOUNTED
 * (via the `key` in the parent) whenever the seed changes — re-opening
 * the sheet after an external tracking change re-seeds the fields cleanly
 * rather than retaining stale local state.
 */
function MovieLogForm({
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
  const [value, setValue] = useState<LogFormValue>(seed.value);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trackMutation = useTrackMediaMutation();
  const saving = trackMutation.isPending;

  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));
  const dirty = logFormValueDirty(value, seed.value);

  async function handleSave() {
    if (!dirty || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys survive — but
    // NEVER merge from an optimistic row, whose progress isn't the real DB
    // value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? (viewerRow.progress ?? null)
        : null;
    const progress = buildLogProgress(existingProgress, "movie", {
      date: value.date,
      isRepeat: value.isRepeat,
      hasSpoilers: value.hasSpoilers,
    });

    // mutateAsync + await (not mutate + onSuccess): the optimistic write bumps
    // viewerRow → the parent recomputes `seed` → seedKey changes → this form
    // UNMOUNTS. A per-call onSuccess is DROPPED on that unmount; the awaited
    // continuation runs regardless, and onDismiss targets the OUTER sheet's
    // stable ref.
    try {
      await trackMutation.mutateAsync({
        mediaId: media.id,
        status: "completed",
        // Display stars → 1–10 DB scale (two-scale rule); null clears.
        rating: starsToRating(value.rating),
        review: value.review,
        is_favorite: value.loved,
        progress: progress as Tables<"user_media">["progress"],
        // completed_at = the watched-on DAY as an ISO timestamp (web parity).
        completed_at: value.date.toISOString(),
      });
      onDismiss();
    } catch (err) {
      setErrorMessage(trackingErrorMessage(err, "your log", "movie-log-sheet"));
    }
  }

  return (
    <View className="gap-5">
      {/* Header: title + close. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Log film
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

      {/* The shared log form (status hidden — this sheet is always a
          completed "log film"; review rides above the keyboard). */}
      <LogForm
        mediaType="movie"
        value={value}
        onChange={patch}
        showStatus={false}
        ReviewInput={BottomSheetTextInput}
      />

      {/* Save (brand, bottom-right). */}
      <View className="flex-row items-center justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save log"
          accessibilityState={{ disabled: saving || !dirty, busy: saving }}
          disabled={saving || !dirty}
          className={`rounded-sm bg-brand px-6 py-2.5 active:opacity-80 ${
            saving || !dirty ? "opacity-50" : ""
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
 * Ref-driven movie log/review sheet. Parent presents it via the
 * `AppSheetRef` (`present()`), the sheet dismisses itself on save. Only
 * meaningful for movies — mount it on the movie detail screen and wire
 * its `present()` to the action strip's `onOpenLog`.
 */
const MovieLogSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function MovieLogSheet({ media, viewerRow }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  // Seed the form from the viewer's row; the seedKey remounts the form
  // (fresh state) whenever the seed changes, so re-opening after an
  // external tracking change re-seeds cleanly. The save-time remount
  // (optimistic write → seedKey change) is why handleSave dismisses via
  // mutateAsync + await, not a per-call onSuccess (dropped on unmount).
  const seed = useMemo(() => deriveSeed(viewerRow), [viewerRow]);

  return (
    <AppSheet
      ref={sheetRef}
      accessibilityLabel={`Log ${media.title}`}
      // Content-panning off so the LogForm's drag-to-rate stars aren't swallowed
      // by the sheet's body-drag (handle + backdrop + close still dismiss).
      enableContentPanningGesture={false}
    >
      <MovieLogForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default MovieLogSheet;
