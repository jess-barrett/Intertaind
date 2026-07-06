/**
 * MovieLogSheet — the movie log/review bottom sheet, and the LOCKED
 * design reference for every M2 log/review sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/movie-modal.tsx`
 * (opened from that page's action column). Fields top→bottom, matching
 * web exactly: Watched on (date) · "I've watched this before" (rewatch)
 * · Rating (StarRating) · Review (multiline) · a Loved toggle · Save.
 *
 * ── One write on Save ─────────────────────────────────────────────────
 * A single `useTrackMediaMutation` call (web parity — web's modal fires
 * one `trackMedia`):
 *   status:       "completed"
 *   rating:       starsToRating(stars)         (display 0.5–5 → 1–10 DB)
 *   review:       the review text (trackMedia normalizes ""→null)
 *   is_favorite:  the Loved toggle
 *   progress:     buildMovieProgress(existing, { watched_on, is_rewatch })
 *   completed_at: the watched-on date as an ISO timestamp
 * Then the sheet dismisses.
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column,
 * so we MUST merge from the viewer's CURRENT progress or we'd silently
 * wipe a sibling key (movie progress's only sibling is
 * `custom_backdrop_url`). `buildMovieProgress` is that merge. Its
 * `existing` arg is sourced from the viewer row, GUARDED against an
 * `OPTIMISTIC_ID` row: an optimistically-synthesized first-track row's
 * progress isn't the real DB value yet, so we treat it as null rather
 * than merge from it. (No fresh-read-inside-mutation is needed for
 * movies — that's the book/TV concurrent-write case in 2.5/2.6.)
 *
 * ── Watched-on without a native picker ────────────────────────────────
 * A native date picker (`@react-native-community/datetimepicker`) is a
 * new native module → a full dev-client rebuild, which M2 avoids (this
 * sheet ships on a Metro `--clear` only). So Watched on defaults to
 * TODAY (local `YYYY-MM-DD`, like web) and renders as a labeled read-only
 * value for now. See the TODO on the field.
 *
 * ── Seeding from an already-logged movie ──────────────────────────────
 * When the viewer already logged this movie, the sheet seeds its initial
 * rating / review / loved / watched-on / rewatch from that row (mirroring
 * web's `initial`). State is seeded per-present via a `key` that changes
 * with the seed, so re-opening after an external change re-seeds.
 *
 * ── Design grammar (LOCKED) ───────────────────────────────────────────
 * Near-black AppSheet surface + grab handle (AppSheet chrome), a
 * title + close header, labeled sections, the gold StarRating with its
 * numeric value + Clear, the review as a `BottomSheetTextInput`
 * ("What did you think?") so the sheet rides above the keyboard, a pink
 * `accent-movie` Loved toggle bottom-left (mirroring the action strip's
 * Loved), and a prominent `bg-brand` Save bottom-right. Tokens only (no
 * raw hex; style-prop colors read from the `colors` object). a11y labels
 * throughout. Supabase errors are mapped to a friendly line, never
 * rendered raw.
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
import { Heart, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildMovieProgress,
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

/** Local `YYYY-MM-DD` for today — web defaults `watched_on` to this too. */
function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The seed values for the form, derived from the viewer's row (mirroring
 * web's `initial`). All defaults match web: watched_on from the row's
 * progress → completed_at date → today; rewatch from progress; rating
 * converted DB→stars; review "" when absent; loved false when absent.
 */
type Seed = {
  watchedOn: string;
  isRewatch: boolean;
  stars: number | null;
  review: string;
  isFavorite: boolean;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(viewerRow: Tables<"user_media"> | null): Seed {
  const today = todayLocalDate();
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  const watchedOn =
    (progress?.watched_on as string | undefined) ??
    viewerRow?.completed_at?.split("T")[0] ??
    today;
  const isRewatch = (progress?.is_rewatch as boolean | undefined) ?? false;
  const stars =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const isFavorite = viewerRow?.is_favorite ?? false;
  return {
    watchedOn,
    isRewatch,
    stars,
    review,
    isFavorite,
    seedKey: `${watchedOn}|${isRewatch}|${stars ?? ""}|${isFavorite}|${review}`,
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
  const [watchedOn] = useState(seed.watchedOn);
  const [isRewatch, setIsRewatch] = useState(seed.isRewatch);
  const [stars, setStars] = useState<number | null>(seed.stars);
  const [review, setReview] = useState(seed.review);
  const [isFavorite, setIsFavorite] = useState(seed.isFavorite);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  // Dirty check (mirrors web's modal): Save is disabled until something
  // changes vs the seed, so re-saving an unchanged log can't fire a no-op
  // upsert. A bare "mark watched" is the action strip's one-tap Watched;
  // this sheet is for adding/changing detail.
  const isDirty =
    watchedOn !== seed.watchedOn ||
    isRewatch !== seed.isRewatch ||
    stars !== seed.stars ||
    review !== seed.review ||
    isFavorite !== seed.isFavorite;

  function handleSave() {
    if (!isDirty) return;
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys (e.g.
    // custom_backdrop_url) survive — but NEVER merge from an optimistic
    // row, whose progress isn't the real DB value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    const progress = buildMovieProgress(existingProgress, {
      watched_on: watchedOn,
      is_rewatch: isRewatch,
    });

    trackMutation.mutate(
      {
        mediaId: media.id,
        status: "completed",
        // Display stars → 1–10 DB scale (two-scale rule); null clears.
        rating: starsToRating(stars),
        review,
        is_favorite: isFavorite,
        // Json is the column type; ProgressRecord is a plain object.
        progress: progress as Tables<"user_media">["progress"],
        // completed_at = the watched-on DAY as an ISO timestamp (web
        // parity: `new Date(watchedOn).toISOString()`).
        completed_at: new Date(watchedOn).toISOString(),
      },
      {
        onSuccess: () => onDismiss(),
        onError: (err) =>
          setErrorMessage(
            trackingErrorMessage(err, "your log", "movie-log-sheet"),
          ),
      },
    );
  }

  const saving = trackMutation.isPending;

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

      {/* Watched on — read-only value for now (no native date picker in
          M2; see file header). */}
      {/* TODO: interactive date picker (needs @react-native-community/datetimepicker → batch with a future native rebuild) */}
      <Field label="Watched on">
        <View className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
          <Text
            className="text-sm text-text-primary"
            accessibilityLabel={`Watched on ${watchedOn}`}
          >
            {watchedOn}
          </Text>
        </View>
      </Field>

      {/* Rewatch — "I've watched this before". */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="I've watched this before"
        accessibilityState={{ checked: isRewatch }}
        className="flex-row items-center gap-2.5 active:opacity-70"
        onPress={() => setIsRewatch((v) => !v)}
      >
        <View
          className={`h-5 w-5 items-center justify-center rounded-sm border ${
            isRewatch
              ? "border-brand bg-brand"
              : "border-surface-border bg-surface-overlay"
          }`}
        >
          {isRewatch ? (
            <X size={14} color={colors["text-primary"]} strokeWidth={3} />
          ) : null}
        </View>
        <Text className="text-sm text-text-secondary">
          I&apos;ve watched this before
        </Text>
      </Pressable>

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
          placeholder="What did you think?"
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
  // external tracking change re-seeds cleanly.
  //
  // Caveat for longer-lived sheets (2.6 TV): the remount discards
  // in-progress edits if `viewerRow` changes WHILE the sheet is open. Safe
  // for movies — the only such change is this sheet's own
  // save-then-dismiss — but the TV sheets stay open across pickers, so they
  // should guard a mid-edit remount rather than key on the live seed.
  const seed = useMemo(() => deriveSeed(viewerRow), [viewerRow]);

  return (
    // Dynamic sizing (no snapPoints): this is a SHORT form, so fitting the
    // content reads better than a fixed-height sheet with empty space. The
    // 2.1 review noted a keyboard-raising form can be smoother pinned to
    // snapPoints — a deliberate trade-off, validated on-device: if the
    // review-field keyboard interaction jitters, add snapPoints={["90%"]}.
    <AppSheet ref={sheetRef} accessibilityLabel={`Log ${media.title}`}>
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
