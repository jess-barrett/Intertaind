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
  MoreHorizontal,
  Share2,
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
 * A BARE icon-only action for the primary row (status / Loved / List) — no
 * background box, per the flat "buttons sit on the page" layout. Active →
 * the accent-colored glyph (filled for Heart/Bookmark via `fillWhenActive`);
 * inactive → a muted glyph. Icons color via the `color` prop (never a
 * className); the a11y label carries the meaning the missing text would.
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
      hitSlop={6}
      className={`p-1.5 active:opacity-60 ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
    >
      <Icon
        size={24}
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
  // The ⋯ overflow menu (Show activity · Change backdrop/cover).
  const [moreOpen, setMoreOpen] = useState(false);

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

  // Viewer row still in flight — a quiet "…" freeze (no container, matching
  // the flat layout) so a tracked item never flashes untracked controls.
  if (trackingPending) {
    return <Text className="py-2 text-sm text-text-muted">…</Text>;
  }

  const statusActionActive = (action: StatusAction): boolean =>
    status != null && action.activeWhen.includes(status);

  return (
    // Flat — no container card/border/bg; the buttons sit on the page.
    <View className="gap-3">
      {/* ── Row 1: a fixed LEFT group (status / Loved / List icons + the
          divider) and an INDEPENDENT right zone for the stars. The left
          group is content-width, so the icons + line never move; the stars
          sit in a flex-1, right-aligned zone — so clearing/rating a rating
          only shifts the STARS within that zone, while the icons + line
          stay put. movie: 👁 ♥ 🔖 │ ★★★★★; tv/book/game vary the status
          slot. ─────────────────────────────────────────────────────── */}
      <View className="flex-row items-center rounded-sm border border-surface-border bg-surface-raised px-3 py-2">
        {/* Left HALF — icons spread with justify-between plus equal edge
            padding (px-3) so the eye and bookmark aren't flush to the ends.
            `min-w-0` forces this to be exactly half (otherwise the stars
            side, with wider content, steals width and smooshes the icons),
            so the icons get the full left half to spread across. */}
        <View className="min-w-0 flex-1 flex-row items-center justify-between px-3">
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
        </View>

        {/* Divider — dead center: it sits between two equal flex-1 halves
            with symmetric margins, so it splits the row exactly down the
            middle (2px surface-border via explicit style; NativeWind's `w-px`
            compiled to zero width). */}
        <View
          className="mx-3"
          style={{
            width: 2,
            height: 22,
            backgroundColor: colors["surface-border"],
          }}
        />

        {/* Right HALF — the stars are CENTERED in it (justify-center). The ✕
            (clear) is absolutely positioned in the GAP to the right of the
            centered stars, so rating/clearing only adds/removes the ✕ in
            that gap — the stars never move. `min-w-0` makes this exactly
            half; `starsOnly` drops StarRating's built-in value/clear so we
            own the ✕. */}
        <View className="min-w-0 flex-1 flex-row items-center justify-center">
          <StarRating value={stars} onChange={handleRate} size={20} starsOnly />
          {stars != null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear rating"
              hitSlop={10}
              className="absolute inset-y-0 right-0 justify-center active:opacity-70"
              onPress={() => handleRate(null)}
            >
              <Text className="text-base leading-none text-text-muted">✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Row 2: Review/Log + Intertain are EQUAL width (both flex-1);
          the ⋯ overflow is pinned right. ─────────────────────────────── */}
      <View className="flex-row items-center gap-2">
        {/* Log / Review button(s) — same size as Intertain (outline). TV: two. */}
        {config.logButtons.map((btn) => (
          <LogButton key={btn.label} btn={btn} onPress={() => open(btn.opener)} />
        ))}

        {/* Intertain friends — the headline hot-pink CTA (M4 sheet); same
            size as Review/Log (flex-1). Web's button uses the Share2 glyph. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Intertain friends — recommend this to a friend"
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-sm border border-brand bg-brand px-3 py-2 active:opacity-80"
          onPress={() => {
            setErrorMessage(null);
            setMoreOpen(false);
            handlers.onIntertain?.();
          }}
        >
          <Share2 size={16} color={colors["text-primary"]} />
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-text-primary"
          >
            Intertain friends
          </Text>
        </Pressable>

        {/* ⋯ overflow → Show activity + Change backdrop/cover (M4). Same
            bordered surface-raised box as the Review/Log button. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityState={{ expanded: moreOpen }}
          className="items-center justify-center rounded-sm border border-surface-border bg-surface-raised px-4 py-2 active:opacity-70"
          onPress={() => setMoreOpen((v) => !v)}
        >
          <MoreHorizontal size={18} color={colors["text-secondary"]} />
        </Pressable>
      </View>

      {/* ── ⋯ overflow menu — the M4 secondary actions, right-aligned. ── */}
      {moreOpen ? (
        <View className="gap-1 self-end rounded-sm border border-surface-border bg-surface-overlay p-1">
          <RowButton
            label="Show activity"
            icon={History}
            onPress={() => {
              setMoreOpen(false);
              open("showActivity");
            }}
          />
          <RowButton
            label={config.changeArt.label}
            icon={CHANGE_ART_ICON}
            onPress={() => {
              setMoreOpen(false);
              open(config.changeArt.opener);
            }}
          />
        </View>
      ) : null}

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
 * The log/review button in row 2 (WITH text). An OUTLINE button (bordered,
 * no fill) per the flat "no gray backgrounds" layout. `flex-1` so it fills
 * the row width alongside the Intertain CTA (with a small gap between them).
 * TV supplies two (Log Season / Log Episode), which share the flex space.
 * Sheet opener.
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
      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-sm border border-surface-border bg-surface-raised px-3 py-2 active:opacity-70"
      onPress={onPress}
    >
      <Icon size={16} color={colors["text-secondary"]} />
      <Text numberOfLines={1} className="text-sm font-medium text-text-secondary">
        {btn.label}
      </Text>
    </Pressable>
  );
}
