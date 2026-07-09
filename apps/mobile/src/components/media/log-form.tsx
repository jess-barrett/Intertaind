/**
 * LogForm — the shared "log a title" form used by BOTH the quick-log (+) flow
 * and (going forward) the per-type detail log sheets, so logging looks and
 * behaves identically everywhere. Pure, CONTROLLED UI: the caller owns a
 * `LogFormValue` + `onChange`, and owns the submit button + the actual write
 * (LogForm never touches Supabase).
 *
 * Fields, top → bottom (matching the agreed design):
 *   1. Date  — a "watched/read/played on" date, edited via a slide-up WHEEL
 *      picker (the native `DateTimePicker` in `display="spinner"`, Letterboxd
 *      style). Can't be in the future.
 *   2. Status — the type's "done" primary (Watched/Read/Played) vs its backlog
 *      (Watchlist/TBR/Wishlist).
 *   3. Rating + Loved — one row: stars on the left, a right-aligned Loved heart
 *      with its label above it.
 *   4. Review — a multiline note.
 *   5. Repeat + Spoilers — two dynamic toggles: First-time↔Repeat (per type),
 *      and No spoilers↔Contains spoilers (DISABLED until the review has text).
 *
 * Per-type wording (labels only) comes from `LOG_LABELS`. Persistence mapping
 * (which progress field the repeat flag / spoilers land in) is the CALLER's job.
 *
 * Ratings are the two-scale rule: the stars here are the 0.5–5 DISPLAY scale;
 * the caller converts with `starsToRating` at the write boundary.
 */
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Heart } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import type { Tables, TablesInsert } from "@intertaind/supabase";
import type { MediaType, TrackingStatus } from "@intertaind/types";

import StarRating from "@/components/star-rating";

/** The full set of values the log form edits. `rating` is DISPLAY stars (0.5–5)
 *  or null (unrated); `date` is the "watched/read/played on" day. */
export type LogFormValue = {
  date: Date;
  status: TrackingStatus;
  rating: number | null;
  review: string;
  loved: boolean;
  /** Repeat viewing/reading/playthrough (maps to is_rewatch/is_reread/… by the
   *  caller, per type). */
  isRepeat: boolean;
  hasSpoilers: boolean;
};

/** Per-type wording for the date label, the two status chips, and the repeat
 *  toggle's two states. */
const LOG_LABELS: Record<
  MediaType,
  {
    date: string;
    completed: string;
    want: string;
    first: string;
    repeat: string;
  }
> = {
  movie: {
    date: "Watched on",
    completed: "Watched",
    want: "Watchlist",
    first: "First watch",
    repeat: "Rewatch",
  },
  tv_show: {
    date: "Watched on",
    completed: "Watched",
    want: "Watchlist",
    first: "First watch",
    repeat: "Rewatch",
  },
  book: {
    date: "Read on",
    completed: "Read",
    want: "Want to Read",
    first: "First read",
    repeat: "Reread",
  },
  video_game: {
    date: "Played on",
    completed: "Played",
    want: "Wishlist",
    first: "First play",
    repeat: "Replay",
  },
};

/** The date as numerals, e.g. "6/12/2026" — always the real date, never "Today". */
function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

/** A day as a LOCAL `YYYY-MM-DD` string (not UTC — matches the day the user
 *  picked on the wheel, and web's `<input type="date">` value shape). */
export function toISODateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a LOCAL `YYYY-MM-DD` (or the date part of an ISO timestamp) back to a
 *  Date at local midnight (inverse of `toISODateOnly`; used by the detail
 *  sheets to seed the wheel from a stored `watched_on` / `completed_at`). Falls
 *  back to today on a malformed/empty string. */
export function fromISODateOnly(value: string | null | undefined): Date {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whether two form values differ (the detail sheets' Save gate). Compares the
 *  date by DAY (the wheel is day-granular). */
export function logFormValueDirty(a: LogFormValue, b: LogFormValue): boolean {
  return (
    toISODateOnly(a.date) !== toISODateOnly(b.date) ||
    a.status !== b.status ||
    a.rating !== b.rating ||
    a.review !== b.review ||
    a.loved !== b.loved ||
    a.isRepeat !== b.isRepeat ||
    a.hasSpoilers !== b.hasSpoilers
  );
}

/**
 * Map the form's generic repeat/spoiler/date into the per-type `progress`
 * JSONB, MERGED over the existing progress so unrelated siblings survive
 * (the read-merge landmine: upsert REPLACES progress wholesale). Shared by
 * quick-log and the detail log sheets so both write the same shape.
 *
 *   - repeat flag → `is_rewatch` (movie/tv), `is_reread` (book), `is_replay`
 *     (game) — matching web's per-type wording.
 *   - `has_spoilers` → generic, all types.
 *   - `watched_on` (the picked day) → movie/tv only, mirroring web's movie
 *     modal so web reads the same field.
 */
export function buildLogProgress(
  existing: Tables<"user_media">["progress"],
  mediaType: MediaType,
  opts: { date: Date; isRepeat: boolean; hasSpoilers: boolean },
): TablesInsert<"user_media">["progress"] {
  // Only merge into an OBJECT progress; a primitive/array/null starts fresh.
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};
  const repeatField =
    mediaType === "book"
      ? "is_reread"
      : mediaType === "video_game"
        ? "is_replay"
        : "is_rewatch";
  const watched =
    mediaType === "movie" || mediaType === "tv_show"
      ? { watched_on: toISODateOnly(opts.date) }
      : {};
  return {
    ...base,
    ...watched,
    [repeatField]: opts.isRepeat,
    has_spoilers: opts.hasSpoilers,
  };
}

/** Small uppercase section label. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
      {children}
    </Text>
  );
}

/** A `TextInput`-compatible component; the detail sheets inject
 *  `BottomSheetTextInput` so the review field rides above the keyboard while
 *  presented in a @gorhom sheet. Quick-log (a full-screen modal) uses the
 *  default plain `TextInput`. */
type ReviewInputComponent = React.ComponentType<
  React.ComponentProps<typeof TextInput>
>;

export function LogForm({
  mediaType,
  value,
  onChange,
  showStatus = true,
  showDate = true,
  showLoved = true,
  showRepeat = true,
  showSpoiler = true,
  ReviewInput = TextInput,
}: {
  mediaType: MediaType;
  value: LogFormValue;
  onChange: (patch: Partial<LogFormValue>) => void;
  /** Show the Watched/Watchlist status chips. Off for the detail log sheets,
   *  which are entered in a fixed mode (the action strip owns status). */
  showStatus?: boolean;
  /** Show the watched/read/played-on date wheel. Off where a date doesn't
   *  apply (e.g. a TV show's overall log, or a game shelf add). */
  showDate?: boolean;
  /** Show the Loved heart in the rating row. Off for per-season/episode logs
   *  (loved is show-level). */
  showLoved?: boolean;
  /** Show the First-time↔Repeat toggle. Off where a repeat flag doesn't apply. */
  showRepeat?: boolean;
  /** Show the No-spoilers↔Contains-spoilers toggle. */
  showSpoiler?: boolean;
  /** Override the review field's input component (see ReviewInputComponent). */
  ReviewInput?: ReviewInputComponent;
}) {
  const labels = LOG_LABELS[mediaType];
  const hasReview = value.review.trim().length > 0;

  return (
    <View className="gap-6">
      {/* Date — slide-up wheel picker. */}
      {showDate ? (
        <View>
          <FieldLabel>{labels.date}</FieldLabel>
          <DateWheel value={value.date} onChange={(date) => onChange({ date })} />
        </View>
      ) : null}

      {/* Status — completed (primary) vs backlog. */}
      {showStatus ? (
        <View>
          <FieldLabel>Status</FieldLabel>
          <View className="flex-row gap-2">
            <Chip
              label={labels.completed}
              active={value.status === "completed"}
              onPress={() => onChange({ status: "completed" })}
            />
            <Chip
              label={labels.want}
              active={value.status === "want"}
              onPress={() => onChange({ status: "want" })}
            />
          </View>
        </View>
      ) : null}

      {/* Rating (left) + Loved (right, label above the heart). */}
      <View className="flex-row items-start justify-between">
        <View>
          <FieldLabel>Rating</FieldLabel>
          <StarRating
            value={value.rating}
            onChange={(rating) => onChange({ rating })}
            size={28}
            starsOnly
          />
        </View>
        {showLoved ? (
          <View className="items-center">
            <FieldLabel>Loved</FieldLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: value.loved }}
              accessibilityLabel={
                value.loved ? "Remove from Loved" : "Mark as Loved"
              }
              hitSlop={8}
              className="active:opacity-70"
              onPress={() => onChange({ loved: !value.loved })}
            >
              <Heart
                size={28}
                color={colors["accent-movie"]}
                fill={value.loved ? colors["accent-movie"] : "none"}
              />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Review. */}
      <View>
        <FieldLabel>Review</FieldLabel>
        <ReviewInput
          value={value.review}
          onChangeText={(review) => onChange({ review })}
          placeholder="Write a review…"
          placeholderTextColor={colors["text-muted"]}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Review"
          className="min-h-24 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
          style={{ color: colors["text-primary"], minHeight: 96 }}
        />
      </View>

      {/* Repeat + spoilers toggles (omitted entirely when neither applies). */}
      {showRepeat || showSpoiler ? (
        <View className="flex-row gap-2">
          {showRepeat ? (
            <Toggle
              label={value.isRepeat ? labels.repeat : labels.first}
              active={value.isRepeat}
              onPress={() => onChange({ isRepeat: !value.isRepeat })}
            />
          ) : null}
          {showSpoiler ? (
            <SpoilerToggle
              value={value.hasSpoilers}
              onChange={(hasSpoilers) => onChange({ hasSpoilers })}
              // Only meaningful once there's a review to hide.
              disabled={!hasReview}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The "No spoilers ↔ Contains spoilers" dynamic toggle, extracted so the TV
 * season/episode sheets (which don't use the full LogForm) present the exact
 * same control. `disabled` when there's no review to hide.
 */
export function SpoilerToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Toggle
      label={value ? "Contains spoilers" : "No spoilers"}
      active={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
    />
  );
}

/**
 * The date control: a field showing the current date; tapping it expands the
 * native wheel (`DateTimePicker` spinner) INLINE right beneath the field,
 * pushing the rest of the form down. No modal — the earlier slide-up sheet
 * fought the layout on iOS. Future dates are blocked (can't watch tomorrow).
 *
 * iOS renders the spinner inline and fires `onValueChange` live as it scrolls,
 * so we commit each change immediately (it needs an explicit height to lay out
 * inline). Android has no inline mode: mounting the picker pops the OS dialog —
 * `onValueChange` fires once on select (commit + close), `onDismiss` on cancel.
 * (v9 deprecated the single `onChange` in favor of these listeners.)
 */
function DateWheel({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Date: ${formatDate(value)}`}
        className={`border border-surface-border bg-surface-overlay px-3 py-2.5 active:opacity-70 ${
          open ? "rounded-t-sm border-b-0" : "rounded-sm"
        }`}
        onPress={() => setOpen((o) => !o)}
      >
        <Text className="text-sm text-text-primary">{formatDate(value)}</Text>
      </Pressable>

      {open ? (
        <View className="overflow-hidden rounded-b-sm border border-surface-border bg-surface-overlay">
          <DateTimePicker
            value={value}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onValueChange={(_event, date) => {
              onChange(date);
              // Android's dialog is one-shot — close after a selection.
              if (Platform.OS === "android") setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
            // Dark wheel text on iOS (the spinner renders native; a className
            // can't reach it).
            themeVariant="dark"
            textColor={colors["text-primary"]}
            // iOS spinner needs an explicit height to lay out inline.
            style={{ height: 216, backgroundColor: colors["surface-overlay"] }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A selectable status chip — brand fill when active. */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`rounded-sm px-4 py-2 active:opacity-70 ${
        active ? "bg-brand" : "border border-surface-border"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-medium ${
          active ? "text-text-primary" : "text-text-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A dynamic-label toggle (repeat / spoilers); accent outline when active. */
function Toggle({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      className={`flex-1 items-center rounded-sm border px-3 py-2 active:opacity-70 ${
        active ? "border-brand bg-brand/15" : "border-surface-border"
      } ${disabled ? "opacity-40" : ""}`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-medium ${
          active ? "text-brand" : "text-text-secondary"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
