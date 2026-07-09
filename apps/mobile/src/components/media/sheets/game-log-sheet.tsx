/**
 * GameLogSheet — the video-game log/review bottom sheet.
 *
 * The RN mirror of web's `apps/web/src/components/modals/game-modal.tsx`
 * (opened from that page's action column). Now renders the SHARED `LogForm`
 * (the same form quick-log + the movie/book sheets use) for the common fields,
 * with TWO game-specific extras kept above it: the 6-status play list and the
 * Hours-played input.
 *
 * Fields top→bottom: Play status (6 sub-statuses) · Hours played · then
 * LogForm — Played on (wheel date) · Rating + Loved · Review · First
 * play↔Replay + spoiler toggles. `LogForm` is `showStatus={false}` (the play
 * list owns the game's status) and gets `BottomSheetTextInput` for the review;
 * the AppSheet disables content-panning so the drag-to-rate stars aren't
 * swallowed.
 *
 * ── One write on Save (web game-modal parity) ─────────────────────────
 * A single `useTrackMediaMutation` call:
 *   status:      the SELECTED status's `tracking` (GAME_STATUSES entry)
 *   progress:    buildGameProgress(existing, { sub_status, hours_played? })
 *                THEN buildLogProgress(…, "video_game", { isRepeat→is_replay,
 *                hasSpoilers }) — hours omitted when blank (web parity)
 *   rating:      starsToRating(stars)          (display 0.5–5 → 1–10 DB)
 *   review:      the review text (trackMedia normalizes ""→null)
 *   is_favorite: the Loved toggle
 *   completed_at: the Played-on date when the resolved status is "completed",
 *                 else omitted (the mutation derives started_at/completed_at
 *                 from `status`, matching web's explicit set).
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * The progress payload REPLACES the JSONB column, so the builders MUST merge
 * from the viewer's CURRENT progress or a sibling key (e.g. custom_backdrop_url)
 * is silently wiped. The `existing` base is GUARDED against an `OPTIMISTIC_ID`
 * row (its progress isn't the real DB value yet).
 *
 * ── Seeding from an already-logged game ───────────────────────────────
 * Seeds sub_status / hours from progress, the Played-on date from completed_at,
 * replay from progress.is_replay, spoilers from progress.has_spoilers, rating
 * DB→stars, review, loved from the row. State is seeded per-present via a `key`
 * that changes with the seed, so re-opening after an external change re-seeds.
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
import { Check, X } from "lucide-react-native";
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
import { GAME_STATUSES, type GameStatusOption } from "../tracking-config";

/** The DB tracking status for a game sub_status (for the LogForm value seed). */
function trackingFor(subStatus: GameSubStatus) {
  return GAME_STATUSES.find((o) => o.key === subStatus)?.tracking ?? "completed";
}

type Seed = {
  subStatus: GameSubStatus;
  hoursPlayed: string;
  value: LogFormValue;
  /** Serialized seed identity so re-seeding remounts the form state. */
  seedKey: string;
};

function deriveSeed(viewerRow: Tables<"user_media"> | null): Seed {
  const progress = (viewerRow?.progress ?? null) as ProgressRecord | null;
  // Default an untracked/no-sub_status game to "played" (web parity).
  const subStatus =
    (progress?.sub_status as GameSubStatus | undefined) ?? "played";
  const hoursRaw = progress?.hours_played as number | undefined;
  const hoursPlayed = hoursRaw != null ? String(hoursRaw) : "";
  const rating =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;
  const review = viewerRow?.review ?? "";
  const loved = viewerRow?.is_favorite ?? false;
  const isRepeat = (progress?.is_replay as boolean | undefined) ?? false;
  const hasSpoilers = (progress?.has_spoilers as boolean | undefined) ?? false;
  return {
    subStatus,
    hoursPlayed,
    value: {
      date: fromISODateOnly(viewerRow?.completed_at),
      // Placeholder — the play list owns the game's real status; LogForm hides
      // its status chips (showStatus={false}).
      status: trackingFor(subStatus),
      rating,
      review,
      loved,
      isRepeat,
      hasSpoilers,
    },
    seedKey: `${subStatus}|${hoursPlayed}|${rating ?? ""}|${loved}|${isRepeat}|${hasSpoilers}|${review}`,
  };
}

/** A small uppercase section label — matches LogForm's field labels. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
      {children}
    </Text>
  );
}

/**
 * One selectable status row — icon + label + description, checked when current.
 * Selecting a row only updates local state (applied on Save).
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
 * The form body. Split from the ref wrapper so its state is REMOUNTED (via the
 * `key` in the parent) whenever the seed changes — re-opening the sheet after
 * an external tracking change re-seeds cleanly rather than retaining stale
 * local state.
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
  const [value, setValue] = useState<LogFormValue>(seed.value);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trackMutation = useTrackMediaMutation();
  const saving = trackMutation.isPending;

  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));
  const dirty =
    subStatus !== seed.subStatus ||
    hoursPlayed !== seed.hoursPlayed ||
    logFormValueDirty(value, seed.value);

  async function handleSave() {
    if (!dirty || saving) return; // saving guard prevents a double-fire mid-await
    setErrorMessage(null);

    // Parse hours: blank → omit (web parity); a non-finite parse also omits.
    const parsedHours = hoursPlayed.trim() === "" ? null : Number(hoursPlayed);
    const hours =
      parsedHours != null && Number.isFinite(parsedHours) ? parsedHours : null;

    // The selected status carries both the DB status and the sub_status.
    const selected =
      GAME_STATUSES.find((o) => o.key === subStatus) ?? GAME_STATUSES[0];

    // Merge onto the viewer's CURRENT progress so sibling keys survive — but
    // NEVER merge from an optimistic row. Game base (sub_status + hours) → then
    // the shared log flags (is_replay + spoilers).
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? ((viewerRow.progress ?? null) as ProgressRecord | null)
        : null;
    const base = buildGameProgress(existingProgress, {
      sub_status: subStatus,
      ...(hours != null ? { hours_played: hours } : {}),
    });
    const progress = buildLogProgress(
      base as Tables<"user_media">["progress"],
      "video_game",
      {
        date: value.date,
        isRepeat: value.isRepeat,
        hasSpoilers: value.hasSpoilers,
      },
    );

    try {
      await trackMutation.mutateAsync({
        mediaId: media.id,
        status: selected.tracking,
        rating: starsToRating(value.rating),
        review: value.review,
        is_favorite: value.loved,
        progress,
        // Stamp the Played-on date only when the resolved status is completed;
        // otherwise let the mutation derive started_at/completed_at from status.
        ...(selected.tracking === "completed"
          ? { completed_at: value.date.toISOString() }
          : {}),
      });
      onDismiss();
    } catch (err) {
      setErrorMessage(trackingErrorMessage(err, "your log", "game-log-sheet"));
    }
  }

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

      {/* Play status — the six sub-statuses as a tap-to-select list. Owns the
          game's status, so LogForm's status chips are hidden below. */}
      <View>
        <FieldLabel>Play status</FieldLabel>
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
      </View>

      {/* Hours played — decimal input (web: number, step 0.5). Blank → omit. */}
      <View>
        <FieldLabel>Hours played</FieldLabel>
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
      </View>

      {/* The shared log form (status hidden — the play list owns it). */}
      <LogForm
        mediaType="video_game"
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
 * Ref-driven game log/review sheet. Parent presents it via the `AppSheetRef`
 * (`present()`), the sheet dismisses itself on save. Only meaningful for video
 * games — mount it on the game detail screen and wire its `present()` to the
 * action strip's `onOpenLog`.
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

  // Seed from the viewer's row; the seedKey remounts the form whenever the seed
  // changes, so re-opening after an external tracking change re-seeds cleanly.
  const seed = useMemo(() => deriveSeed(viewerRow), [viewerRow]);

  return (
    <AppSheet
      ref={sheetRef}
      accessibilityLabel={`Log ${media.title}`}
      // Content-panning off so LogForm's drag-to-rate stars aren't swallowed by
      // the sheet's body-drag (handle + backdrop + close still dismiss).
      enableContentPanningGesture={false}
    >
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
