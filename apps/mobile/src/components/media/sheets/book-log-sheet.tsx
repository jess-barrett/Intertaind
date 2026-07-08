/**
 * BookLogSheet — the book "Read" / "Review" bottom sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/book-modal.tsx`
 * (opened from the book detail page's "Read" action and its "Review…" log
 * button). Serves BOTH entry points: the shelf choice (Finished vs Didn't
 * finish) + the rating/review/loved fields on one sheet. Fields top→bottom:
 * Finished/DNF · Rating (StarRating) · Review (multiline) · a Loved toggle
 * · Save.
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, `isDirty` gate,
 * `BottomSheetTextInput` review, one `useTrackMediaMutation` write on Save,
 * mapped inline errors, and the progress-merge OPTIMISTIC_ID guard.
 *
 * ── Finished vs DNF ↔ status/sub_shelf (web book-modal parity) ────────
 * Web's modal is a two-step (pick shelf → fields); mobile collapses to one
 * sheet with a two-option segmented toggle at the top:
 *   Finished     → status "completed", progress.sub_shelf "finished"
 *   Didn't finish→ status "dropped",   progress.sub_shelf "dnf"
 * `initialDnf` biases the default when opened via a DNF-specific entry, but
 * we keep it simple: default to Finished (unless the row is already dnf),
 * and let the user pick DNF.
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation` call (web's modal fires one `onSave`):
 *   status:       finished ? "completed" : "dropped"
 *   progress:     buildBookProgress(existing, { sub_shelf: finished
 *                   ? "finished" : "dnf" })
 *   rating:       starsToRating(stars)         (display 0.5–5 → 1–10 DB)
 *   review:       the review text (trackMedia normalizes ""→null)
 *   is_favorite:  the Loved toggle
 *   completed_at: today's ISO timestamp when Finished, null for DNF (web
 *                 sets `completed_at` = now for finished, null for dnf).
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column, so
 * `buildBookProgress` MUST merge from the viewer's CURRENT progress or a
 * sibling key (e.g. `custom_cover_url`, or a saved `total_pages` from the
 * reading sheet) is silently wiped. The `existing` base is GUARDED against
 * an `OPTIMISTIC_ID` row (its progress isn't the real DB value yet).
 *
 * ── Finished date without a native picker ─────────────────────────────
 * Web sets `completed_at` = `new Date().toISOString()` at save time (no
 * user-facing date field), so there's nothing to surface — the sheet just
 * stamps NOW on save (following the movie-log no-native-picker precedent).
 *
 * ── Seeding from an already-logged book ───────────────────────────────
 * Seeds finished/dnf from `progress.sub_shelf`, rating DB→stars, review,
 * loved from the row (mirroring web's `initial`). State is seeded
 * per-present via a `key` that changes with the seed, so re-opening after
 * an external change re-seeds.
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
import { BookOpenCheck, Heart, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildBookProgress,
  ratingToStars,
  starsToRating,
  type ProgressRecord,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import StarRating from "@/components/star-rating";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";

/**
 * The seed values for the form, derived from the viewer's row (mirroring
 * web's `initial`). `finished` defaults true (web's Finished shelf) unless
 * the row is already on the dnf shelf; `initialDnf` biases the default when
 * the sheet is opened via a DNF-specific entry point. Rating converted
 * DB→stars; review "" when absent; loved false when absent.
 */
type Seed = {
  finished: boolean;
  stars: number | null;
  review: string;
  isFavorite: boolean;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(
  viewerRow: Tables<"user_media"> | null,
  initialDnf: boolean,
): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const subShelf = progress?.sub_shelf as string | undefined;
  // If the row is already on a book shelf, honour it; else default to
  // Finished unless the opener biased toward DNF.
  const finished =
    subShelf === "dnf" ? false : subShelf === "finished" ? true : !initialDnf;
  const stars =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const isFavorite = viewerRow?.is_favorite ?? false;
  return {
    finished,
    stars,
    review,
    isFavorite,
    seedKey: `${finished}|${stars ?? ""}|${isFavorite}|${review}`,
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
 * The form body. Split from the ref wrapper so its state is REMOUNTED
 * (via the `key` in the parent) whenever the seed changes — re-opening
 * the sheet after an external tracking change re-seeds the fields cleanly
 * rather than retaining stale local state.
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
  const [stars, setStars] = useState<number | null>(seed.stars);
  const [review, setReview] = useState(seed.review);
  const [isFavorite, setIsFavorite] = useState(seed.isFavorite);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  // Dirty check (mirrors web's modal): Save is disabled until something
  // changes vs the seed, so re-saving an unchanged log can't fire a no-op
  // upsert.
  const isDirty =
    finished !== seed.finished ||
    stars !== seed.stars ||
    review !== seed.review ||
    isFavorite !== seed.isFavorite;

  function handleSave() {
    if (!isDirty) return;
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys (e.g.
    // custom_cover_url, a saved total_pages) survive — but NEVER merge from
    // an optimistic row, whose progress isn't the real DB value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    const progress = buildBookProgress(existingProgress, {
      sub_shelf: finished ? "finished" : "dnf",
    });

    trackMutation.mutate(
      {
        mediaId: media.id,
        status: finished ? "completed" : "dropped",
        // Display stars → 1–10 DB scale (two-scale rule); null clears.
        rating: starsToRating(stars),
        review,
        is_favorite: isFavorite,
        // Json is the column type; ProgressRecord is a plain object.
        progress: progress as Tables<"user_media">["progress"],
        // completed_at = now when Finished, null for DNF (web parity:
        // `shelf === "finished" ? new Date().toISOString() : null`).
        completed_at: finished ? new Date().toISOString() : null,
      },
      {
        onSuccess: () => onDismiss(),
        onError: (err) =>
          setErrorMessage(
            trackingErrorMessage(err, "your log", "book-log-sheet"),
          ),
      },
    );
  }

  const saving = trackMutation.isPending;

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

      {/* Shelf — Finished vs Didn't finish, a two-option segmented toggle
          (the native analogue of web's shelf-picker step). Finished reads
          green (accent-book), DNF pink (accent-movie), matching web's icon
          colors. */}
      <Field label="Shelf">
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
          placeholder="Your thoughts on this book..."
          placeholderTextColor={colors["text-muted"]}
          multiline
          accessibilityLabel="Review"
          className="min-h-[88px] rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{
            color: colors["text-primary"],
            textAlignVertical: "top",
          }}
        />
      </Field>

      {/* Footer: Loved (pink, bottom-left) + Save (brand, bottom-right). */}
      <View className="flex-row items-center justify-between pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? "Loved" : "Love it?"}
          accessibilityState={{ selected: isFavorite }}
          className={`flex-row items-center gap-1.5 rounded-sm px-3 py-2.5 active:opacity-70 ${
            isFavorite ? "bg-accent-movie/15" : ""
          }`}
          onPress={() => setIsFavorite((v) => !v)}
        >
          <Heart
            size={16}
            color={isFavorite ? colors["accent-movie"] : colors["text-muted"]}
            fill={isFavorite ? colors["accent-movie"] : "none"}
          />
          <Text
            className={`text-sm ${
              isFavorite ? "font-semibold text-accent-movie" : "text-text-muted"
            }`}
          >
            {isFavorite ? "Loved" : "Love it?"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save log"
          accessibilityState={{ disabled: saving || !isDirty, busy: saving }}
          disabled={saving || !isDirty}
          className={`rounded-sm bg-brand px-6 py-2.5 active:opacity-80 ${
            saving || !isDirty ? "opacity-50" : ""
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
 * Ref-driven book log/review sheet (serves "Read" + "Review"). Parent
 * presents it via the `AppSheetRef` (`present()`), the sheet dismisses
 * itself on save. Only meaningful for books — mount it on the book detail
 * screen and wire its `present()` to the action strip's `onOpenReadFinished`
 * and (routed by type) `onOpenLog`.
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

  // Seed the form from the viewer's row; the seedKey remounts the form
  // (fresh state) whenever the seed changes, so re-opening after an
  // external tracking change re-seeds cleanly. (Same movie-log caveat: the
  // remount would discard in-progress edits if `viewerRow` changed WHILE
  // the sheet is open — safe here, the only such change is this sheet's own
  // save-then-dismiss.)
  const seed = useMemo(
    () => deriveSeed(viewerRow, initialDnf),
    [viewerRow, initialDnf],
  );

  return (
    <AppSheet ref={sheetRef} accessibilityLabel={`Log ${media.title}`}>
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
