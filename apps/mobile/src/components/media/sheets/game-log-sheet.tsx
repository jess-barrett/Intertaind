/**
 * GameLogSheet — the video-game log/review bottom sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/game-modal.tsx`
 * (opened from that page's action column). Fields top→bottom, matching
 * web exactly: Play status (6 sub-statuses) · Hours played (decimal) ·
 * Rating (StarRating) · Review (multiline) · a Loved toggle · Save.
 *
 * Built on the LOCKED movie-log-sheet template (`movie-log-sheet.tsx`) —
 * same AppSheet chrome, `deriveSeed` + `seedKey` remount, `isDirty` gate,
 * `BottomSheetTextInput` review, one `useTrackMediaMutation` write on
 * Save, mapped inline errors, and the progress-merge OPTIMISTIC_ID guard.
 *
 * ── One write on Save (web game-modal parity) ─────────────────────────
 * A single `useTrackMediaMutation` call (web's modal fires one `onSave`
 * → `trackMedia`):
 *   status:      the SELECTED status's `tracking` (GAME_STATUSES entry —
 *                the 6 sub-statuses collapse to 4 DB values)
 *   progress:    buildGameProgress(existing, { sub_status, hours_played? })
 *                — hours_played omitted when the field is blank (web parity)
 *   rating:      starsToRating(stars)          (display 0.5–5 → 1–10 DB)
 *   review:      the review text (trackMedia normalizes ""→null)
 *   is_favorite: the Loved toggle
 * We deliberately do NOT pass started_at/completed_at — web's game-modal
 * sets them explicitly from the status, but `useTrackMediaMutation` already
 * derives them from `status` (started_at=now when in_progress, completed_at
 * =now when completed), which lands the same end state for the game
 * sub-statuses without duplicating the derivation here.
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column, so
 * `buildGameProgress` MUST merge from the viewer's CURRENT progress or a
 * sibling key (e.g. `custom_backdrop_url`) is silently wiped. The
 * `existing` base is GUARDED against an `OPTIMISTIC_ID` row (its progress
 * isn't the real DB value yet) exactly as the movie log + game status
 * sheets do.
 *
 * ── Play status without a native <select> ─────────────────────────────
 * Web renders a `<select>` of the 6 statuses; mobile shows the same 6 as
 * a tap-to-select list (reusing the game-status-sheet row look — icon +
 * label + description), the selected one highlighted in its accent. This
 * is the inline in-form picker, distinct from the standalone
 * GameStatusSheet quick-picker (that one writes on tap; here the choice is
 * just local state applied on Save).
 *
 * ── Seeding from an already-logged game ───────────────────────────────
 * When the viewer already logged this game, the sheet seeds its initial
 * sub_status / hours / rating / review / loved from that row (mirroring
 * web's `initial`). State is seeded per-present via a `key` that changes
 * with the seed, so re-opening after an external change re-seeds.
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
import { Check, Heart, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildGameProgress,
  ratingToStars,
  starsToRating,
  type GameSubStatus,
  type ProgressRecord,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import StarRating from "@/components/star-rating";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";
import { GAME_STATUSES, type GameStatusOption } from "../tracking-config";

/**
 * The seed values for the form, derived from the viewer's row (mirroring
 * web's `initial`). Defaults: sub_status from progress → "playing";
 * hours_played from progress → "" (blank); rating converted DB→stars;
 * review "" when absent; loved false when absent.
 */
type Seed = {
  subStatus: GameSubStatus;
  hoursPlayed: string;
  stars: number | null;
  review: string;
  isFavorite: boolean;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(viewerRow: Tables<"user_media"> | null): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  // Default an untracked/no-sub_status game to "played" (web parity — the
  // app-wide default for "I engaged with this game"; "playing" would save an
  // untouched log as in_progress instead of completed).
  const subStatus =
    (progress?.sub_status as GameSubStatus | undefined) ?? "played";
  const hoursRaw = progress?.hours_played as number | undefined;
  const hoursPlayed = hoursRaw != null ? String(hoursRaw) : "";
  const stars =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const isFavorite = viewerRow?.is_favorite ?? false;
  return {
    subStatus,
    hoursPlayed,
    stars,
    review,
    isFavorite,
    seedKey: `${subStatus}|${hoursPlayed}|${stars ?? ""}|${isFavorite}|${review}`,
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
 * One selectable status row — icon + label + description, checked when
 * current. Mirrors the game-status-sheet StatusRow look; here selecting a
 * row only updates local state (applied on Save), so no per-row disabled.
 */
function StatusRow({
  option,
  selected,
  onPress,
}: {
  option: GameStatusOption;
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = option.icon;
  const accent = colors[option.accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.label} — ${option.desc}`}
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 rounded-sm px-3 py-3 active:opacity-70 ${
        selected ? "bg-surface-overlay" : ""
      }`}
      onPress={onPress}
    >
      <Icon size={20} color={accent} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-text-primary">
          {option.label}
        </Text>
        <Text className="text-xs text-text-muted">{option.desc}</Text>
      </View>
      {selected ? <Check size={18} color={colors.brand} /> : null}
    </Pressable>
  );
}

/**
 * The form body. Split from the ref wrapper so its state is REMOUNTED
 * (via the `key` in the parent) whenever the seed changes — re-opening
 * the sheet after an external tracking change re-seeds the fields cleanly
 * rather than retaining stale local state.
 */
function GameLogForm({
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
  const [subStatus, setSubStatus] = useState<GameSubStatus>(seed.subStatus);
  const [hoursPlayed, setHoursPlayed] = useState(seed.hoursPlayed);
  const [stars, setStars] = useState<number | null>(seed.stars);
  const [review, setReview] = useState(seed.review);
  const [isFavorite, setIsFavorite] = useState(seed.isFavorite);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackMutation = useTrackMediaMutation();

  // Dirty check (mirrors web's modal): Save is disabled until something
  // changes vs the seed, so re-saving an unchanged log can't fire a no-op
  // upsert / a noisy activity row.
  const isDirty =
    subStatus !== seed.subStatus ||
    hoursPlayed !== seed.hoursPlayed ||
    stars !== seed.stars ||
    review !== seed.review ||
    isFavorite !== seed.isFavorite;

  function handleSave() {
    if (!isDirty) return;
    setErrorMessage(null);

    // Parse hours: blank → omit (web parity); a non-finite parse also
    // omits rather than persisting NaN.
    const parsedHours = hoursPlayed.trim() === "" ? null : Number(hoursPlayed);
    const hours =
      parsedHours != null && Number.isFinite(parsedHours) ? parsedHours : null;

    // The selected status carries both the DB status and the sub_status.
    const selected =
      GAME_STATUSES.find((o) => o.key === subStatus) ?? GAME_STATUSES[0];

    // Merge onto the viewer's CURRENT progress so sibling keys (e.g.
    // custom_backdrop_url) survive — but NEVER merge from an optimistic
    // row, whose progress isn't the real DB value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    const progress = buildGameProgress(existingProgress, {
      sub_status: subStatus,
      ...(hours != null ? { hours_played: hours } : {}),
    });

    trackMutation.mutate(
      {
        mediaId: media.id,
        status: selected.tracking,
        // Display stars → 1–10 DB scale (two-scale rule); null clears.
        rating: starsToRating(stars),
        review,
        is_favorite: isFavorite,
        // Json is the column type; ProgressRecord is a plain object.
        progress: progress as Tables<"user_media">["progress"],
        // No completed_at/started_at: useTrackMediaMutation derives them
        // from `status` (web game-modal sets them explicitly, same result).
      },
      {
        onSuccess: () => onDismiss(),
        onError: (err) =>
          setErrorMessage(
            trackingErrorMessage(err, "your log", "game-log-sheet"),
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
            Log game
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

      {/* Play status — the six sub-statuses as a tap-to-select list (the
          native analogue of web's <select>). */}
      <Field label="Play status">
        <View className="gap-0.5">
          {GAME_STATUSES.map((option) => (
            <StatusRow
              key={option.key}
              option={option}
              selected={option.key === subStatus}
              onPress={() => setSubStatus(option.key)}
            />
          ))}
        </View>
      </Field>

      {/* Hours played — decimal input (web: number, step 0.5). Blank → omit. */}
      <Field label="Hours played">
        <BottomSheetTextInput
          value={hoursPlayed}
          onChangeText={setHoursPlayed}
          placeholder="0"
          placeholderTextColor={colors["text-muted"]}
          keyboardType="decimal-pad"
          accessibilityLabel="Hours played"
          className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{ color: colors["text-primary"] }}
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
 * Ref-driven game log/review sheet. Parent presents it via the
 * `AppSheetRef` (`present()`), the sheet dismisses itself on save. Only
 * meaningful for video games — mount it on the game detail screen and wire
 * its `present()` to the action strip's `onOpenLog`.
 */
const GameLogSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function GameLogSheet({ media, viewerRow }, ref) {
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
  const seed = useMemo(() => deriveSeed(viewerRow), [viewerRow]);

  return (
    <AppSheet ref={sheetRef} accessibilityLabel={`Log ${media.title}`}>
      <GameLogForm
        key={seed.seedKey}
        media={media}
        viewerRow={viewerRow}
        seed={seed}
        onDismiss={() => sheetRef.current?.dismiss()}
      />
    </AppSheet>
  );
});

export default GameLogSheet;
