/**
 * Config-driven per-type action strip for the media detail screen — the
 * write-side UI that REPLACES the domain-wrong `tracking-panel.tsx`
 * (removed in M2). ONE component whose controls vary by
 * `media.media_type`, driven by `TRACKING_CONFIG` in `./tracking-config`.
 *
 * This is the RN mirror of web's action column in
 * `apps/web/src/app/media/[id]/media-detail-client.tsx`, restructured per
 * the plan's locked "inline action strip under the hero" grammar
 * (docs/plans/2026-07-01-mobile-media-tracking.md).
 *
 * ── The locked one-tap-vs-sheet split ──────────────────────────────────
 * ONE-TAP actions are wired NOW to the existing `queries/tracking.ts`
 * mutations (no sheets involved):
 *   - Status toggle (movie/TV `Watched` → completed) → `useTrackMediaMutation`.
 *   - List (Watchlist / Add to TBR / Wishlist → want) → `useTrackMediaMutation`.
 *   - Loved (♥) → `useToggleFavoriteMutation` (optimistic flip).
 *   - Inline stars → `useRateMediaMutation` (display stars ↔ 1–10 DB scale
 *     via starsToRating/ratingToStars at this boundary — two-scale rule).
 * All four are optimistic, so their controls stay enabled while pending.
 * Tapping the ALREADY-active status is a deliberate no-op (matching the
 * old panel's touch-safety divergence from web's untrack-and-delete;
 * destructive untrack will route through a confirmed flow later).
 *
 * SHEET-OPENER actions (movie `Review or log…`, TV `Watching` /
 * `Log Season` / `Log Episode`, book `Read` / `Reading` / `Review…`,
 * game status dropdown + `Log game…`, `Intertain`, `Show activity`,
 * `Change backdrop/cover`) open bottom sheets that DON'T EXIST YET (Tasks
 * 2.4–2.7 / M4). So this strip renders each as a correctly-labeled button
 * whose press handler is a CALLBACK PROP the parent supplies. In Task 2.3
 * the parent (`media/[id].tsx`) passes stub no-ops; Tasks 2.4–2.7 wire
 * these same props to real sheet refs. This callback seam is the whole
 * point — the strip never imports `@gorhom/bottom-sheet` (no sheet is
 * mounted here), keeping 2.3 reload-testable without a babel `--clear`.
 *
 * ── State seeding + the OPTIMISTIC_ID guard ────────────────────────────
 * Current state (active status, is_favorite, rating) seeds from the
 * viewer's `user_media` row via `useViewerTracking`. A row synthesized by
 * an optimistic first-track carries `id: OPTIMISTIC_ID`, which must NEVER
 * reach a byId mutation — every byId param funnels through `safeId`
 * (undefined while optimistic → rate/favorite fall back to their lazy
 * lookup path), mirroring the old panel.
 *
 * ── Colors (locked grammar; from design tokens, not eyeballed) ─────────
 * Web has no semantic state token — active states reuse the media-type
 * accents, exactly as web does (see StatusAccent in ./tracking-config):
 *   - Active status  → the action's `activeAccent`: GREEN (accent-book,
 *                       web's universal "completed") for Watched/Read,
 *                       PURPLE (accent-tv) for TV "Watching", GOLD
 *                       (accent-game) for book "Reading".
 *   - Loved active   → accent-movie (#FF3D71, a red-pink — distinct from
 *                       the brand hot-pink below).
 *   - List active    → brand-light (web's "want").
 *   - Stars          → GOLD (StarRating owns this).
 *   - Intertain CTA  → HOT-PINK, solid `bg-brand` (#FF006E), prominent (the
 *                       headline cross-media feature — never buried).
 * Icons color via the `color` PROP (react-native-svg), not className.
 *
 * Errors: mutations reject with raw Supabase/network errors; those are
 * NEVER rendered (they leak internals). `trackingErrorMessage` maps them
 * to two friendly strings, `console.warn`s the raw error, and the strip
 * shows the mapped line inline with a Dismiss affordance (salvaged from
 * the old panel). Optimistic mutations also roll back on failure.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Bookmark,
  Heart,
  History,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  ratingToStars,
  starsToRating,
  type MediaType,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import StarRating from "@/components/star-rating";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import type { MediaDetailItem } from "@/queries/media";
import {
  OPTIMISTIC_ID,
  useRateMediaMutation,
  useToggleFavoriteMutation,
  useTrackMediaMutation,
} from "@/queries/tracking";
import {
  CHANGE_ART_ICON,
  TRACKING_CONFIG,
  type LogButton as LogButtonConfig,
  type StatusAccent,
  type StatusAction,
} from "./tracking-config";

/**
 * The sheet-opener callback seam. Tasks 2.4–2.7 / M4 replace the parent's
 * stub no-ops with real sheet-ref opens; the strip only ever calls these.
 * All are optional so a screen can mount the strip before every sheet
 * exists (the strip renders the button either way, and a missing callback
 * simply does nothing on press).
 */
export type ActionStripHandlers = {
  /** movie "Review or log…" · book "Review…" · game "Log game…" (2.4/2.5/2.7). */
  onOpenLog?: () => void;
  /** tv "Log Season" (2.6). */
  onOpenLogSeason?: () => void;
  /** tv "Log Episode" (2.6). */
  onOpenLogEpisode?: () => void;
  /** tv "Watching" → current-episode sheet (2.6). */
  onOpenWatching?: () => void;
  /** book "Reading" → current-reading sheet (2.5). */
  onOpenReading?: () => void;
  /** book "Read" → book-log (finished/dnf) sheet (2.5). */
  onOpenReadFinished?: () => void;
  /** game status dropdown sheet (2.7). */
  onOpenStatusPicker?: () => void;
  /** headline "Intertain friends" recommend sheet (M4). */
  onIntertain?: () => void;
  /** "Show activity" screen/sheet (M4). */
  onShowActivity?: () => void;
  /** book "Change cover" · movie/tv/game "Change backdrop" (M4). */
  onChangeArt?: () => void;
};

/** Resolve which parent callback a config `opener` maps to. */
function openerCallback(
  opener: string,
  handlers: ActionStripHandlers
): (() => void) | undefined {
  switch (opener) {
    case "log":
      return handlers.onOpenLog;
    case "logSeason":
      return handlers.onOpenLogSeason;
    case "logEpisode":
      return handlers.onOpenLogEpisode;
    case "watching":
      return handlers.onOpenWatching;
    case "reading":
      return handlers.onOpenReading;
    case "readFinished":
      return handlers.onOpenReadFinished;
    case "gameStatus":
      return handlers.onOpenStatusPicker;
    case "showActivity":
      return handlers.onShowActivity;
    case "changeCover":
    case "changeBackdrop":
      return handlers.onChangeArt;
    default:
      return undefined;
  }
}

/** Accent token keys an IconAction can light up in. */
type IconAccent = StatusAccent | "accent-movie" | "brand-light";

/**
 * Active-state background tints as LITERAL class strings (dynamic
 * `bg-${accent}/15` can't be scanned by the content globber). Covers the
 * per-type status accents (green completed / purple TV-watching / gold
 * book-reading) plus Loved (pink accent-movie) and List (brand).
 */
const ICON_ACTIVE_BG: Record<IconAccent, string> = {
  "accent-book": "bg-accent-book/15",
  "accent-tv": "bg-accent-tv/15",
  "accent-game": "bg-accent-game/15",
  "accent-movie": "bg-accent-movie/15",
  "brand-light": "bg-brand/15",
};

/**
 * An ICON-ONLY action button for the compact primary row (status / Loved /
 * List). Active → the accent glyph on a subtle accent/15 tint; inactive →
 * a muted glyph on the overlay surface. `fillWhenActive` fills the glyph
 * (Heart/Bookmark) when active. Icons color via the `color` prop, never a
 * className. The a11y label carries the meaning the missing text would.
 */
function IconAction({
  icon: Icon,
  active,
  accent,
  fillWhenActive,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  active: boolean;
  accent: IconAccent;
  fillWhenActive?: boolean;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      className={`items-center justify-center rounded-sm p-2.5 active:opacity-70 ${
        active ? ICON_ACTIVE_BG[accent] : "bg-surface-overlay"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
    >
      <Icon
        size={20}
        color={active ? colors[accent] : colors["text-secondary"]}
        fill={fillWhenActive && active ? colors[accent] : "none"}
      />
    </Pressable>
  );
}

/** A full-width secondary-row action (log / activity / change-art). */
function RowButton({
  label,
  icon: Icon,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: LogButtonConfig["icon"];
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={`flex-row items-center gap-2.5 rounded-sm px-3 py-2.5 active:opacity-70 ${
        disabled ? "opacity-50" : ""
      }`}
      onPress={onPress}
    >
      <Icon size={16} color={colors["text-secondary"]} />
      <Text className="text-sm text-text-secondary">{label}</Text>
    </Pressable>
  );
}

export function ActionStrip({
  media,
  viewerRow,
  trackingPending,
  handlers,
}: {
  media: MediaDetailItem;
  /** The viewer's tracking row (null = untracked), from useViewerTracking. */
  viewerRow: Tables<"user_media"> | null;
  /** True while the viewer's row is still loading — freeze to a skeleton. */
  trackingPending: boolean;
  /** Parent-supplied sheet openers (stubbed in 2.3; wired in 2.4–2.7/M4). */
  handlers: ActionStripHandlers;
}) {
  const trackMutation = useTrackMediaMutation();
  const favoriteMutation = useToggleFavoriteMutation();
  const rateMutation = useRateMediaMutation();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The media DB enum is a superset of MediaType (board_game). Fall back
  // to the movie grammar for unknown types so the strip still renders a
  // sensible one-tap "Watched"/list/loved set rather than crashing.
  const mediaType: MediaType =
    media.media_type in TRACKING_CONFIG
      ? (media.media_type as MediaType)
      : "movie";
  const config = TRACKING_CONFIG[mediaType];

  // Sentinel guard: never hand OPTIMISTIC_ID to a byId mutation — the row
  // doesn't exist in Postgres under that id yet.
  const safeId =
    viewerRow && viewerRow.id !== OPTIMISTIC_ID ? viewerRow.id : undefined;

  const status = viewerRow?.status ?? null;
  const isFavorite = viewerRow?.is_favorite ?? false;
  const isWant = status === "want";
  // rating is the 1–10 DB scale; null-guard BEFORE Number() (Number(null)
  // is 0, which ratingToStars would clamp to half a star).
  const stars =
    viewerRow?.rating != null ? ratingToStars(Number(viewerRow.rating)) : null;

  const reportError = (err: unknown) =>
    setErrorMessage(trackingErrorMessage(err, "your changes", "action-strip"));

  function trackStatus(next: TrackingStatus) {
    // No-op re-tapping the active status (touch fat-finger safety — the
    // old panel's deliberate divergence from web's untrack-and-delete;
    // destruction will route through a confirmed flow later).
    if (status === next) return;
    setErrorMessage(null);
    trackMutation.mutate(
      { mediaId: media.id, status: next },
      { onError: reportError }
    );
  }

  function handleFavorite() {
    setErrorMessage(null);
    favoriteMutation.mutate(
      { mediaId: media.id, userMediaId: safeId },
      { onError: reportError }
    );
  }

  function handleRate(next: number | null) {
    setErrorMessage(null);
    rateMutation.mutate(
      { mediaId: media.id, rating: starsToRating(next), userMediaId: safeId },
      { onError: reportError }
    );
  }

  /** Fire a sheet opener; sheets are stubbed by the parent in 2.3. */
  function open(opener: string) {
    setErrorMessage(null);
    openerCallback(opener, handlers)?.();
  }

  // Viewer row still in flight — the same "…" freeze the M1 badge used,
  // so a tracked item never flashes untracked controls before it loads.
  if (trackingPending) {
    return (
      <View className="items-center rounded-sm border border-surface-border bg-surface-raised px-4 py-6">
        <Text className="text-sm text-text-muted">…</Text>
      </View>
    );
  }

  const statusActionActive = (action: StatusAction): boolean =>
    status != null && action.activeWhen.includes(status);

  return (
    <View className="gap-2.5 rounded-sm border border-surface-border bg-surface-raised p-3">
      {/* ── Primary action row ───────────────────────────────────────
          Icon-only status / Loved / List, then the log button(s) WITH
          text, a vertical divider, then the inline stars — all on one
          line. movie: [Watched][Loved][Watchlist][Review or log…] │ ★★★★★
          tv/book/game vary the status + log slots via the config. */}
      <View className="flex-row items-center gap-1.5">
        {/* Status: icon-only toggle(s), or the game status dropdown. */}
        {config.statusDropdown ? (
          <IconAction
            icon={config.statusDropdown.icon}
            active={status != null}
            accent="accent-game"
            accessibilityLabel="Set game status"
            onPress={() => open(config.statusDropdown!.opener)}
          />
        ) : (
          config.statusActions.map((action) => (
            <IconAction
              key={action.label}
              icon={action.icon}
              active={statusActionActive(action)}
              accent={action.activeAccent}
              accessibilityLabel={action.label}
              disabled={trackMutation.isPending}
              onPress={() =>
                action.kind === "toggle"
                  ? trackStatus(action.status)
                  : open(action.opener)
              }
            />
          ))
        )}

        {/* Loved (pink) — disabled while pending (flip-flop race). */}
        <IconAction
          icon={Heart}
          active={isFavorite}
          accent="accent-movie"
          fillWhenActive
          accessibilityLabel={isFavorite ? "Remove from Loved" : "Mark as Loved"}
          disabled={favoriteMutation.isPending}
          onPress={handleFavorite}
        />

        {/* List (Watchlist / Add to TBR / Wishlist → want). */}
        <IconAction
          icon={Bookmark}
          active={isWant}
          accent="brand-light"
          fillWhenActive
          accessibilityLabel={config.listLabel}
          disabled={trackMutation.isPending}
          onPress={() => trackStatus("want")}
        />

        {/* Log / Review button(s) WITH text — flex to fill the remaining
            width (truncates); TV supplies two. Sheet openers. */}
        {config.logButtons.map((btn) => (
          <LogButton key={btn.label} btn={btn} onPress={() => open(btn.opener)} />
        ))}

        {/* Vertical divider before the rating. */}
        <View className="mx-0.5 h-7 w-px bg-surface-border" />

        {/* Inline star rating (gold; StarRating owns the color). */}
        <StarRating value={stars} onChange={handleRate} size={20} />
      </View>

      {/* ── Intertain friends — the headline hot-pink CTA (M4 sheet). ── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Intertain friends — recommend this to a friend"
        className="mt-0.5 flex-row items-center justify-center gap-2 rounded-sm bg-brand px-3 py-3 active:opacity-80"
        onPress={() => {
          setErrorMessage(null);
          handlers.onIntertain?.();
        }}
      >
        <Sparkles size={18} color={colors["text-primary"]} />
        <Text className="text-base font-semibold text-text-primary">
          Intertain friends
        </Text>
      </Pressable>

      {/* ── Secondary row: Show activity · Change backdrop/cover (M4). ─ */}
      <View className="border-t border-surface-border pt-1">
        <RowButton
          label="Show activity"
          icon={History}
          onPress={() => open("showActivity")}
        />
        <RowButton
          label={config.changeArt.label}
          icon={CHANGE_ART_ICON}
          onPress={() => open(config.changeArt.opener)}
        />
      </View>

      {/* Inline, dismissible error line (mapped message, never raw). */}
      {errorMessage ? (
        <View className="flex-row items-center gap-3 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
          <Text className="flex-1 text-sm text-accent-movie">
            {errorMessage}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
            hitSlop={8}
            onPress={() => setErrorMessage(null)}
          >
            <Text className="text-xs text-text-muted">Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The log/review button that sits inline in the primary row (WITH text) —
 * the one text-labeled control in that row. Flexes to fill the width left
 * between the icon buttons and the rating, truncating its label if the row
 * is tight; TV supplies two, which share the flex space. `surface-overlay`
 * raised bg so it reads as the row's prominent action. Sheet opener.
 */
function LogButton({
  btn,
  onPress,
}: {
  btn: LogButtonConfig;
  onPress: () => void;
}) {
  const Icon = btn.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={btn.label}
      className="min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-sm bg-surface-overlay px-2.5 py-2.5 active:opacity-70"
      onPress={onPress}
    >
      <Icon size={16} color={colors["text-primary"]} />
      <Text numberOfLines={1} className="text-sm font-medium text-text-primary">
        {btn.label}
      </Text>
    </Pressable>
  );
}
