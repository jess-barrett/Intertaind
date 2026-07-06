/**
 * Per-media-type action grammar for the detail-screen action strip — the
 * data table that drives `action-strip.tsx`. This is the RN mirror of
 * web's `ACTION_CONFIG` / `GAME_STATUSES` in
 * `apps/web/src/app/media/[id]/media-detail-client.tsx`, restructured
 * around the "Design decisions (locked)" invariant table in
 * `docs/plans/2026-07-01-mobile-media-tracking.md`.
 *
 * ONE config-driven component: the strip's controls VARY by
 * `media.media_type`, but the wiring is uniform. Each media type declares
 * its status control(s), its list-label, and its log button(s); the strip
 * reads this table and renders the right grammar. Slots that are the same
 * for every type (Loved · inline stars · Intertain · Show activity) are
 * NOT in the table — the strip renders them unconditionally.
 *
 * Two kinds of status action (the locked one-tap-vs-sheet-opener split):
 *   - `kind: "toggle"` — a ONE-TAP action wired NOW. Tapping tracks the
 *     given `status` via `useTrackMediaMutation` (optimistic). Movie/TV
 *     `Watched` → completed; every type's List → want.
 *   - `kind: "sheet"` — a sheet-OPENER. The sheet doesn't exist yet
 *     (Tasks 2.4–2.7 / M4), so the strip renders the labeled button and
 *     calls a parent-supplied callback prop (`onOpen…`). Its `opener`
 *     field names which callback fires. No `@gorhom/bottom-sheet` import
 *     lives here or in the strip — the sheets mount later.
 *
 * `activeWhen` lets a status button read as "active" against the viewer's
 * current `user_media.status`, in its per-action `activeAccent` color
 * (green=completed, purple=TV "Watching", gold=book "Reading" — see
 * StatusAccent, mirroring web). Movie `Watched` is active when
 * status === "completed"; TV `Watching`/book `Reading` when
 * "in_progress"; etc. Games have no single toggle — their status slot is
 * one dropdown sheet, so games declare no `statusActions` and instead a
 * `statusDropdown` descriptor.
 *
 * Icons are lucide-react-native components (colored via the `color` prop,
 * never className — see status-badge.tsx). Icon COMPONENTS can't live in
 * `@intertaind/types` (the lucide-react vs lucide-react-native split), so
 * they're imported here directly, matching web's glyph choices.
 *
 * Colors: the strip owns the color grammar (Loved pink, List brand,
 * Intertain hot-pink) — this table is layout/labels only. The one
 * exception is each status action's `activeAccent` token KEY (not a
 * class), which names the per-type active color the strip then applies.
 */
import {
  BookOpen,
  BookOpenCheck,
  Clapperboard,
  Eye,
  Gamepad2,
  GalleryHorizontalEnd,
  ImageIcon,
  MessageSquare,
  TvMinimalPlay,
  type LucideIcon,
} from "lucide-react-native";
import type { MediaType, TrackingStatus } from "@intertaind/types";

/**
 * Names of the parent-supplied sheet-opener callbacks. A `sheet`-kind
 * status action or a log button references one of these; the strip looks
 * up the matching `on…` prop and calls it on press. The sheets these open
 * are built in Tasks 2.4–2.7 (log/status flows) and M4 (activity, change
 * cover/backdrop) — until then the parent passes stub no-ops.
 */
export type SheetOpener =
  | "log" // movie/book "Review or log…" · game "Log game…"
  | "logSeason" // tv "Log Season"
  | "logEpisode" // tv "Log Episode"
  | "watching" // tv "Watching" → current-episode sheet
  | "reading" // book "Reading" → current-reading sheet
  | "readFinished" // book "Read" → book-log sheet (finished/dnf)
  | "gameStatus" // game status dropdown sheet
  | "showActivity" // "Show activity" (M4)
  | "changeCover" // book "Change cover" (M4)
  | "changeBackdrop"; // movie/tv/game "Change backdrop" (M4)

/**
 * A status control in the strip's primary row.
 *
 *  - `toggle`: one-tap, wired now — tracks `status` via track mutation.
 *    Reads "active" (green) when the viewer's status is in `activeWhen`.
 *  - `sheet`: opens a sheet via the named `opener` callback (stubbed for
 *    now). Also carries `activeWhen` so e.g. TV "Watching" highlights
 *    while the show is in progress.
 */
/**
 * Design-token key for a status action's ACTIVE-state accent, mirroring
 * web's per-type active colors (media-detail-client.tsx): a completed
 * "Watched"/"Read" reads GREEN (`accent-book`, web's universal "done"
 * color across all types); TV "Watching" reads PURPLE (`accent-tv`); book
 * "Reading" reads GOLD (`accent-game`). Web has no dedicated semantic
 * state token — these ARE the media-type accents, reused exactly as web
 * does, so mobile and web stay in lockstep.
 */
export type StatusAccent = "accent-book" | "accent-tv" | "accent-game";

export type StatusAction =
  | {
      kind: "toggle";
      label: string;
      icon: LucideIcon;
      /** The tracking status this one-tap writes. */
      status: TrackingStatus;
      /** Statuses under which this button reads as active. */
      activeWhen: TrackingStatus[];
      /** Token accent for the active state (see StatusAccent). */
      activeAccent: StatusAccent;
    }
  | {
      kind: "sheet";
      label: string;
      icon: LucideIcon;
      /** Which parent callback opens this action's sheet. */
      opener: SheetOpener;
      /** Statuses under which this button reads as active. */
      activeWhen: TrackingStatus[];
      /** Token accent for the active state (see StatusAccent). */
      activeAccent: StatusAccent;
    };

/** A full-width log/review button that opens a sheet via `opener`. */
export type LogButton = {
  label: string;
  icon: LucideIcon;
  opener: SheetOpener;
};

/**
 * The status slot for games: a single dropdown (rendered as a sheet
 * opener) rather than one-or-two toggle pills. The 6 sub-statuses and
 * their `user_media.status` mapping live in the game flow (Task 2.7) —
 * this only declares the button that opens it. `activeWhen` is every
 * trackable status because ANY tracked game shows its chosen sub-status.
 */
export type StatusDropdown = {
  label: string;
  icon: LucideIcon;
  opener: SheetOpener;
};

export type TrackingConfig = {
  /**
   * The primary status control(s). Movie: one `Watched` toggle. TV:
   * `Watched` toggle + `Watching` sheet. Book: `Read` sheet + `Reading`
   * sheet. Game: none here — see `statusDropdown`.
   */
  statusActions: StatusAction[];
  /** Game-only single status dropdown (sheet). Undefined for others. */
  statusDropdown?: StatusDropdown;
  /** The list ("bookmark") action label — Watchlist / Add to TBR / Wishlist. */
  listLabel: string;
  /** Full-width log/review button(s). TV has two (Season + Episode). */
  logButtons: LogButton[];
  /**
   * Secondary-row "change art" action — books change a cover, everything
   * else a backdrop. Label + opener differ; both are M4 sheets.
   */
  changeArt: { label: string; opener: SheetOpener };
};

/**
 * The per-type grammar. Labels + status semantics mirror web's
 * `ACTION_CONFIG`; the movie/TV `Watched`→completed and every
 * `list`→want are the wired one-taps, the rest are sheet openers.
 */
export const TRACKING_CONFIG: Record<MediaType, TrackingConfig> = {
  movie: {
    statusActions: [
      {
        kind: "toggle",
        label: "Watched",
        icon: Eye,
        status: "completed",
        activeWhen: ["completed"],
        activeAccent: "accent-book",
      },
    ],
    listLabel: "Watchlist",
    logButtons: [
      { label: "Review or log…", icon: MessageSquare, opener: "log" },
    ],
    changeArt: { label: "Change backdrop", opener: "changeBackdrop" },
  },
  tv_show: {
    statusActions: [
      {
        kind: "toggle",
        label: "Watched",
        icon: Eye,
        status: "completed",
        activeWhen: ["completed"],
        activeAccent: "accent-book",
      },
      {
        kind: "sheet",
        label: "Watching",
        icon: TvMinimalPlay,
        opener: "watching",
        activeWhen: ["in_progress"],
        activeAccent: "accent-tv",
      },
    ],
    listLabel: "Watchlist",
    logButtons: [
      { label: "Log Season", icon: Clapperboard, opener: "logSeason" },
      {
        label: "Log Episode",
        icon: GalleryHorizontalEnd,
        opener: "logEpisode",
      },
    ],
    changeArt: { label: "Change backdrop", opener: "changeBackdrop" },
  },
  book: {
    statusActions: [
      {
        kind: "sheet",
        label: "Read",
        icon: BookOpenCheck,
        opener: "readFinished",
        activeWhen: ["completed", "dropped"],
        activeAccent: "accent-book",
      },
      {
        kind: "sheet",
        label: "Reading",
        icon: BookOpen,
        opener: "reading",
        activeWhen: ["in_progress"],
        activeAccent: "accent-game",
      },
    ],
    listLabel: "Add to TBR",
    logButtons: [{ label: "Review…", icon: MessageSquare, opener: "log" }],
    changeArt: { label: "Change cover", opener: "changeCover" },
  },
  video_game: {
    statusActions: [],
    statusDropdown: {
      label: "Set status…",
      icon: Gamepad2,
      opener: "gameStatus",
    },
    listLabel: "Wishlist",
    logButtons: [{ label: "Log game…", icon: Gamepad2, opener: "log" }],
    changeArt: { label: "Change backdrop", opener: "changeBackdrop" },
  },
};

/** The change-art icon is shared (both cover + backdrop use the image glyph). */
export const CHANGE_ART_ICON = ImageIcon;
