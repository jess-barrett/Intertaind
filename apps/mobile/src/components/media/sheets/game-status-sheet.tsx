/**
 * GameStatusSheet — the video-game play-status picker bottom sheet.
 *
 * The RN mirror of web's game status dropdown
 * (`apps/web/src/app/media/[id]/media-detail-client.tsx` — GameStatusDropdown).
 * Web renders a full-width `<select>`-style dropdown; on mobile the action
 * strip shows a labeled status PILL (games have 6 statuses, so a bare icon
 * can't convey which is set) and tapping it presents THIS sheet — a
 * tap-to-apply radio list, the native analogue of the web dropdown.
 *
 * ── The six statuses collapse to four DB values ───────────────────────
 * `GAME_STATUSES` (tracking-config.ts) is the source of truth: Completed
 * and Played both map to `completed`; Shelved and Retired both to
 * `on_hold`. So the DB `status` column alone can't distinguish them — the
 * real selection lives in `progress.sub_status`. Picking a status writes
 * BOTH: `status = entry.tracking` and `progress.sub_status = entry.key`.
 *
 * ── One write on select (web parity) ──────────────────────────────────
 * A single `useTrackMediaMutation` (web's handler fires one `trackMedia`):
 *   status:   entry.tracking
 *   progress: buildGameProgress(existing, { sub_status: entry.key })
 * `useTrackMediaMutation` derives started_at/completed_at from the status
 * (web `trackMedia` parity) and is optimistic on the viewer row, so the
 * strip's pill updates the instant a status is tapped; the sheet then
 * dismisses. Hours-played / rating / review are the separate "Log game…"
 * flow (a later sheet), NOT this quick picker.
 *
 * ── The progress-merge landmine ───────────────────────────────────────
 * `useTrackMediaMutation`'s progress payload REPLACES the JSONB column, so
 * `buildGameProgress` MUST merge from the viewer's CURRENT progress or a
 * sibling key (`hours_played`, `custom_backdrop_url`) is silently wiped.
 * The `existing` base is GUARDED against an `OPTIMISTIC_ID` row (its
 * progress isn't the real DB value yet) exactly as the movie log sheet.
 *
 * Chrome mirrors the movie log sheet: AppSheet surface + grab handle, a
 * label + title + close header, tokens only, mapped (never raw) errors.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { buildGameProgress, type GameSubStatus } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import { OPTIMISTIC_ID, useTrackMediaMutation } from "@/queries/tracking";
import { GAME_STATUSES, type GameStatusOption } from "../tracking-config";

/** Read the current `progress.sub_status` off a viewer row, or null. */
function readSubStatus(
  viewerRow: Tables<"user_media"> | null,
): GameSubStatus | null {
  const progress = viewerRow?.progress as { sub_status?: GameSubStatus } | null;
  return progress?.sub_status ?? null;
}

/** One selectable status row — icon + label + description, checked when current. */
function StatusRow({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: GameStatusOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = option.icon;
  const accent = colors[option.accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.label} — ${option.desc}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-sm px-3 py-3 active:opacity-70 ${
        selected ? "bg-surface-overlay" : ""
      } ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
    >
      <Icon size={20} color={accent} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-text-primary">
          {option.label}
        </Text>
        <Text className="text-xs text-text-muted">{option.desc}</Text>
      </View>
      {selected ? (
        <Check size={18} color={colors.brand} />
      ) : null}
    </Pressable>
  );
}

/**
 * Ref-driven game status picker. Parent presents it via `AppSheetRef`
 * (`present()`); the sheet dismisses itself once a status is applied. Only
 * meaningful for video games — mount it on the detail screen and wire its
 * `present()` to the action strip's `onOpenStatusPicker`.
 */
const GameStatusSheet = forwardRef<
  AppSheetRef,
  {
    media: MediaDetailItem;
    /** The viewer's tracking row (null = untracked), from useViewerTracking. */
    viewerRow: Tables<"user_media"> | null;
  }
>(function GameStatusSheet({ media, viewerRow }, ref) {
  const sheetRef = useRef<AppSheetRef>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trackMutation = useTrackMediaMutation();

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  );

  const current = readSubStatus(viewerRow);
  const saving = trackMutation.isPending;

  function selectStatus(option: GameStatusOption) {
    // Re-tapping the active status is a no-op — just close.
    if (option.key === current) {
      sheetRef.current?.dismiss();
      return;
    }
    setErrorMessage(null);

    // Merge onto the viewer's CURRENT progress so sibling keys
    // (hours_played, custom_backdrop_url) survive — never from an
    // optimistic row, whose progress isn't the real DB value yet.
    const existingProgress =
      viewerRow && viewerRow.id !== OPTIMISTIC_ID
        ? (viewerRow.progress as Record<string, unknown> | null)
        : null;
    const progress = buildGameProgress(existingProgress, {
      sub_status: option.key,
    });

    trackMutation.mutate(
      {
        mediaId: media.id,
        status: option.tracking,
        progress: progress as Tables<"user_media">["progress"],
      },
      {
        onSuccess: () => sheetRef.current?.dismiss(),
        onError: (err) =>
          setErrorMessage(
            trackingErrorMessage(err, "your status", "game-status-sheet"),
          ),
      },
    );
  }

  return (
    <AppSheet ref={sheetRef} accessibilityLabel={`Set status for ${media.title}`}>
      <View className="gap-4">
        {/* Header: label + title + close. */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Game status
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
            onPress={() => sheetRef.current?.dismiss()}
          >
            <X size={22} color={colors["text-muted"]} />
          </Pressable>
        </View>

        {/* The six statuses. */}
        <View className="gap-0.5">
          {GAME_STATUSES.map((option) => (
            <StatusRow
              key={option.key}
              option={option}
              selected={option.key === current}
              disabled={saving}
              onPress={() => selectStatus(option)}
            />
          ))}
        </View>

        {/* Inline, mapped error (never the raw Supabase error). */}
        {errorMessage ? (
          <View className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
            <Text className="text-sm text-accent-movie">{errorMessage}</Text>
          </View>
        ) : null}
      </View>
    </AppSheet>
  );
});

export default GameStatusSheet;
