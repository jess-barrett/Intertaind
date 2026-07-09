/**
 * BookLogSheet — the book "Read" / "Review" bottom sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/book-modal.tsx`
 * (opened from the book detail page's "Read" action and its "Review…" log
 * button). Now renders the SHARED `LogForm` (the same form quick-log + the
 * movie sheet use) for the common fields, with ONE book-specific extra kept
 * above it: the Finished / Didn't-finish shelf toggle.
 *
 * Fields top→bottom: Shelf (Finished vs DNF) · then LogForm — Read on (wheel
 * date) · Rating + Loved · Review · First read↔Reread + spoiler toggles.
 * `LogForm` is `showStatus={false}` (the shelf toggle owns the book's status)
 * and gets `BottomSheetTextInput` for the review; the AppSheet disables
 * content-panning so the drag-to-rate stars aren't swallowed.
 *
 * ── Finished vs DNF ↔ status/sub_shelf (web book-modal parity) ────────
 *   Finished     → status "completed", progress.sub_shelf "finished"
 *   Didn't finish→ status "dropped",   progress.sub_shelf "dnf"
 * `initialDnf` biases the default when opened via a DNF-specific entry.
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation` call:
 *   status:       finished ? "completed" : "dropped"
 *   rating:       starsToRating(stars)         (display 0.5–5 → 1–10 DB)
 *   review:       the review text (trackMedia normalizes ""→null)
 *   is_favorite:  the Loved toggle
 *   progress:     buildBookProgress(existing, { sub_shelf }) THEN
 *                 buildLogProgress(…, "book", { isRepeat→is_reread, hasSpoilers })
 *   completed_at: the Read-on date when Finished, null for DNF (web parity).
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column, so
 * the builders MUST merge from the viewer's CURRENT progress or a sibling key
 * (`custom_cover_url`, a saved `total_pages`) is silently wiped. The `existing`
 * base is GUARDED against an `OPTIMISTIC_ID` row (its progress isn't the real
 * DB value yet).
 *
 * ── Seeding from an already-logged book ───────────────────────────────
 * Seeds finished/dnf from `progress.sub_shelf`, the Read-on date from
 * `completed_at`, reread from `progress.is_reread`, spoilers from
 * `progress.has_spoilers`, rating DB→stars, review, loved from the row. State
 * is seeded per-present via a `key` that changes with the seed, so re-opening
 * after an external change re-seeds.
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
import { BookOpenCheck, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildBookProgress,
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
  type LogFormValue,
} from "@/components/media/log-form";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";

type Seed = {
  finished: boolean;
  value: LogFormValue;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(
  viewerRow: Tables<"user_media"> | null,
  initialDnf: boolean,
): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const subShelf = progress?.sub_shelf as string | undefined;
  // If the row is already on a book shelf, honour it; else default to Finished
  // unless the opener biased toward DNF.
  const finished =
    subShelf === "dnf" ? false : subShelf === "finished" ? true : !initialDnf;
  const rating =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const loved = viewerRow?.is_favorite ?? false;
  const isRepeat = (progress?.is_reread as boolean | undefined) ?? false;
  const hasSpoilers = (progress?.has_spoilers as boolean | undefined) ?? false;
  return {
    finished,
    value: {
      date: fromISODateOnly(viewerRow?.completed_at),
      // Placeholder — the shelf toggle owns the book's real status; LogForm
      // hides its status chips (showStatus={false}).
      status: finished ? "completed" : "dropped",
      rating,
      review,
      loved,
      isRepeat,
      hasSpoilers,
    },
    seedKey: `${finished}|${rating ?? ""}|${loved}|${isRepeat}|${hasSpoilers}|${review}`,
  };
}

/** One segment of the Finished/DNF toggle — selected reads in its accent. */
function ShelfSegment({
  label,
  icon: Icon,
  accent,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: typeof BookOpenCheck;
  accent: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-sm border px-3 py-2.5 active:opacity-70 ${
        selected ? "border-brand bg-surface-overlay" : "border-surface-border"
      }`}
      onPress={onPress}
    >
      <Icon size={16} color={selected ? accent : colors["text-muted"]} />
      <Text
        className={`text-sm font-medium ${
          selected ? "text-text-primary" : "text-text-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The form body. Split from the ref wrapper so its state is REMOUNTED (via the
 * `key` in the parent) whenever the seed changes — re-opening the sheet after
 * an external tracking change re-seeds cleanly rather than retaining stale
 * local state.
 */
function BookLogForm({
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
  const [finished, setFinished] = useState(seed.finished);
  const [value, setValue] = useState<LogFormValue>(seed.value);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trackMutation = useTrackMediaMutation();
  const saving = trackMutation.isPending;

  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));
  const dirty =
    finished !== seed.finished || logFormValueDirty(value, seed.value);

  async function handleSave() {
    if (!dirty || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys (custom_cover_url,
    // a saved total_pages) survive — but NEVER merge from an optimistic row.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    // Book base (sub_shelf) → then the shared log flags (is_reread + spoilers).
    const base = buildBookProgress(existingProgress, {
      sub_shelf: finished ? "finished" : "dnf",
    });
    const progress = buildLogProgress(
      base as Tables<"user_media">["progress"],
      "book",
      {
        date: value.date,
        isRepeat: value.isRepeat,
        hasSpoilers: value.hasSpoilers,
      },
    );

    try {
      await trackMutation.mutateAsync({
        mediaId: media.id,
        status: finished ? "completed" : "dropped",
        rating: starsToRating(value.rating),
        review: value.review,
        is_favorite: value.loved,
        progress,
        // completed_at = the Read-on day when Finished, null for DNF (web parity).
        completed_at: finished ? value.date.toISOString() : null,
      });
      onDismiss();
    } catch (err) {
      setErrorMessage(trackingErrorMessage(err, "your log", "book-log-sheet"));
    }
  }

  return (
    <View className="gap-5">
      {/* Header: label + title + close. */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Log book
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

      {/* Shelf — Finished vs Didn't finish, a two-option segmented toggle (the
          native analogue of web's shelf-picker step). This owns the book's
          status, so LogForm's own status chips are hidden below. */}
      <View>
        <Text className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          Shelf
        </Text>
        <View className="flex-row gap-2">
          <ShelfSegment
            label="Finished"
            icon={BookOpenCheck}
            accent={colors["accent-book"]}
            selected={finished}
            accessibilityLabel="Finished"
            onPress={() => setFinished(true)}
          />
          <ShelfSegment
            label="Didn't finish"
            icon={X}
            accent={colors["accent-movie"]}
            selected={!finished}
            accessibilityLabel="Didn't finish"
            onPress={() => setFinished(false)}
          />
        </View>
      </View>

      {/* The shared log form (status hidden — the shelf toggle owns it). */}
      <LogForm
        mediaType="book"
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
 * Ref-driven book log/review sheet (serves "Read" + "Review"). Parent presents
 * it via the `AppSheetRef` (`present()`), the sheet dismisses itself on save.
 * Only meaningful for books — mount it on the book detail screen and wire its
 * `present()` to the action strip's `onOpenReadFinished` / `onOpenLog`.
 */
const BookLogSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
    /** Bias the default shelf to DNF when opened via a DNF-specific entry. */
    initialDnf?: boolean;
  }
>(function BookLogSheet({ media, viewerRow, initialDnf = false }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  // Seed from the viewer's row; the seedKey remounts the form whenever the seed
  // changes, so re-opening after an external tracking change re-seeds cleanly.
  const seed = useMemo(
    () => deriveSeed(viewerRow, initialDnf),
    [viewerRow, initialDnf],
  );

  return (
    <AppSheet
      ref={sheetRef}
      accessibilityLabel={`Log ${media.title}`}
      // Content-panning off so LogForm's drag-to-rate stars aren't swallowed by
      // the sheet's body-drag (handle + backdrop + close still dismiss).
      enableContentPanningGesture={false}
    >
      <BookLogForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default BookLogSheet;
