/**
 * BookReadingSheet — the "Currently Reading" bottom sheet for books.
 *
 * The RN mirror of web's
 * `apps/web/src/components/modals/current-reading-modal.tsx` (opened from
 * the book detail page's "Reading" action). Fields top→bottom, matching
 * web's fields that this template can express: Current page · Total pages.
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, `isDirty` gate,
 * `BottomSheetTextInput` numeric fields, one `useTrackMediaMutation` write
 * on Save, mapped inline errors, and the progress-merge OPTIMISTIC_ID
 * guard.
 *
 * ── One write on Save (web current-reading-modal parity) ──────────────
 * A single `useTrackMediaMutation` call:
 *   status:   "in_progress"
 *   progress: buildBookProgress(existing, {
 *               sub_shelf: "currently_reading",
 *               current_page?,          // omitted when the field is blank
 *               total_pages,            // ALWAYS keyed (incl. null) so
 *             })                        // clearing overwrites a saved value
 * `useTrackMediaMutation` derives `started_at = now` from the in_progress
 * status, so we don't pass it. (Web sets `started_at` from a Date-started
 * field + a `started_reading` activity override; mobile logs no activity —
 * see tracking.ts — and has no native date picker, so it defers to the
 * mutation's now-derivation.)
 *
 * ── total_pages: clear vs omit ────────────────────────────────────────
 * Web always emits `total_pages` (including null) so clearing the field
 * overwrites a previously-saved override rather than silently keeping the
 * old value. `buildBookProgress` uses KEYED presence for `total_pages`, so
 * we ALWAYS pass the key: a parsed number when the field has one, else
 * `null` to clear. `current_page` uses "provided-only" semantics, so we
 * omit it entirely when blank (matching the builder's contract).
 *
 * ── No native pickers / omitted fields ────────────────────────────────
 * Web's modal also has a Date started (native `<input type=date>`) and a
 * "This is a reread" checkbox. The date picker follows the movie-log
 * precedent — no `@react-native-community/datetimepicker` in M2 — so
 * started_at is left to the mutation's now-derivation and the field is
 * omitted (there's no read-only value to show for a fresh session). The
 * reread checkbox is omitted to keep this sheet the minimal current/total
 * pair the task specified; it can be layered on later without touching the
 * write shape (buildBookProgress already carries `is_reread` when provided).
 * No Loved toggle — web's current-reading-modal has none (Loved belongs on
 * the Read/Review sheet).
 *
 * ── Seeding from an in-progress book ──────────────────────────────────
 * Seeds Current page from `progress.current_page`; Total pages from
 * `progress.total_pages` ?? `metadata.page_count` ?? "" (the saved override
 * wins, else the book's catalog page count as a prefill). State is seeded
 * per-present via a `key` that changes with the seed, so re-opening after
 * an external change re-seeds cleanly.
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
import { buildBookProgress, type ProgressRecord } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";

/**
 * The seed values for the form, derived from the viewer's row (mirroring
 * web's `initial`). Current page from progress → "" (blank); total pages
 * from progress → the book's `metadata.page_count` → "" (blank). Both are
 * kept as strings for the numeric text inputs.
 */
type Seed = {
  currentPage: string;
  totalPages: string;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(
  viewerRow: Tables<"user_media"> | null,
  media: MediaDetailItem,
): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const currentRaw = progress?.current_page as number | undefined;
  const currentPage = currentRaw != null ? String(currentRaw) : "";
  // Prefer the saved override; otherwise fall back to the book's catalog
  // page count (metadata.page_count) so re-opening shows both fields
  // populated without the user having to retype (web parity).
  const savedTotal = progress?.total_pages as number | null | undefined;
  const metadata = (media.metadata ?? null) as Record<string, unknown> | null;
  const metaPages = metadata?.page_count as number | undefined;
  const totalPages =
    savedTotal != null
      ? String(savedTotal)
      : metaPages != null
        ? String(metaPages)
        : "";
  return {
    currentPage,
    totalPages,
    seedKey: `${currentPage}|${totalPages}`,
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

/**
 * The form body. Split from the ref wrapper so its state is REMOUNTED
 * (via the `key` in the parent) whenever the seed changes — re-opening
 * the sheet after an external tracking change re-seeds the fields cleanly
 * rather than retaining stale local state.
 */
function BookReadingForm({
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
  const [currentPage, setCurrentPage] = useState(seed.currentPage);
  const [totalPages, setTotalPages] = useState(seed.totalPages);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  // Dirty check (mirrors web's modal): Save is disabled until something
  // changes vs the seed. Unlike web's "fresh session always dirty" case,
  // this sheet is opened from the "Reading" action for both fresh and
  // already-reading books; a bare status transition to Reading is out of
  // scope here (this sheet is for entering page progress), so gate on a
  // real field change.
  const isDirty =
    currentPage !== seed.currentPage || totalPages !== seed.totalPages;

  function handleSave() {
    if (!isDirty) return;
    setErrorMessage(null);

    // current_page: blank → omit (builder's "provided-only" contract); a
    // non-finite parse also omits rather than persisting NaN.
    const parsedCurrent =
      currentPage.trim() === "" ? null : Number(currentPage);
    const current =
      parsedCurrent != null && Number.isFinite(parsedCurrent)
        ? parsedCurrent
        : null;

    // total_pages: ALWAYS keyed (web parity) so clearing overwrites a
    // saved override — a parsed number when present, else null to clear.
    const parsedTotal = totalPages.trim() === "" ? null : Number(totalPages);
    const total =
      parsedTotal != null && Number.isFinite(parsedTotal) ? parsedTotal : null;

    // Merge onto the viewer's CURRENT progress so sibling keys (e.g.
    // custom_cover_url) survive — but NEVER merge from an optimistic row,
    // whose progress isn't the real DB value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    const progress = buildBookProgress(existingProgress, {
      sub_shelf: "currently_reading",
      ...(current != null ? { current_page: current } : {}),
      // Keyed presence: passing the key (even null) clears a saved value.
      total_pages: total,
    });

    trackMutation.mutate(
      {
        mediaId: media.id,
        status: "in_progress",
        // Json is the column type; ProgressRecord is a plain object.
        progress: progress as Tables<"user_media">["progress"],
        // No started_at: useTrackMediaMutation derives it (now) from the
        // in_progress status (web sets it from a date field — omitted here,
        // no native date picker in M2).
      },
      {
        onSuccess: () => onDismiss(),
        onError: (err) =>
          setErrorMessage(
            trackingErrorMessage(
              err,
              "your reading progress",
              "book-reading-sheet",
            ),
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
            Currently reading
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

      {/* Current page — numeric input. Blank → omit. */}
      <Field label="Current page">
        <BottomSheetTextInput
          value={currentPage}
          onChangeText={setCurrentPage}
          placeholder="0"
          placeholderTextColor={colors["text-muted"]}
          keyboardType="number-pad"
          accessibilityLabel="Current page"
          className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{ color: colors["text-primary"] }}
        />
      </Field>

      {/* Total pages — numeric input, seeded from a saved override or the
          book's catalog page count. Clearing overwrites the saved value. */}
      <Field label="Total pages">
        <BottomSheetTextInput
          value={totalPages}
          onChangeText={setTotalPages}
          placeholder="0"
          placeholderTextColor={colors["text-muted"]}
          keyboardType="number-pad"
          accessibilityLabel="Total pages"
          className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{ color: colors["text-primary"] }}
        />
      </Field>

      {/* Footer: Save (brand, bottom-right). No Loved toggle — web's
          current-reading-modal has none (Loved lives on the Read sheet). */}
      <View className="flex-row items-center justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save reading progress"
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
 * Ref-driven "Currently Reading" sheet. Parent presents it via the
 * `AppSheetRef` (`present()`), the sheet dismisses itself on save. Only
 * meaningful for books — mount it on the book detail screen and wire its
 * `present()` to the action strip's `onOpenReading`.
 */
const BookReadingSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function BookReadingSheet({ media, viewerRow }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  // Seed the form from the viewer's row + book metadata; the seedKey
  // remounts the form (fresh state) whenever the seed changes, so
  // re-opening after an external tracking change re-seeds cleanly. (Same
  // movie-log caveat: the remount would discard in-progress edits if
  // `viewerRow` changed WHILE the sheet is open — safe here, the only such
  // change is this sheet's own save-then-dismiss.)
  const seed = useMemo(() => deriveSeed(viewerRow, media), [viewerRow, media]);

  return (
    <AppSheet ref={sheetRef} accessibilityLabel={`Currently reading ${media.title}`}>
      <BookReadingForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default BookReadingSheet;
