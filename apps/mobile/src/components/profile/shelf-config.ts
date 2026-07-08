/**
 * SHELF_CONFIG — the per-media-type status sections the profile Shelves tab
 * offers, mirroring web's per-type shelf pages (`apps/web/src/app/u/[username]/
 * {movies,tv-shows,books,games}/page.tsx`). Each entry is one selectable
 * section: a `key` (stable, used in the query key + as the React key), a `label`
 * (the section chip text), and EXACTLY ONE filter directive the shelf hook
 * applies to the `user_media` read:
 *
 *   - `status`    → `.eq("status", <value>)`         (movie/tv/book, + game wishlist)
 *   - `subStatus` → `.eq("progress->>sub_status", …)` (video_game play states)
 *
 * A section carries one OR the other, never both (a discriminated pair enforced
 * by the type). `useProfileShelf` branches on which is present.
 *
 * ── Web parity ────────────────────────────────────────────────────────────
 * movie / tv_show / book sections mirror web's `status`-based TABS verbatim
 * (same order, same status). Games mirror web's games TABS *order* with ONE
 * deliberate deviation: web's leading aggregate "Played" tab (all games EXCEPT
 * the wishlist — `status != 'want'`, NOT a `sub_status`) is DROPPED on mobile.
 * The mobile Shelves tab surfaces the discrete `sub_status` play-states only
 * (Playing · Completed · Wishlist · Shelved · Retired · Abandoned, in web's
 * order), so there's no aggregate roll-up section — every game section is a
 * single, unambiguous state. (Web's remaining `sub_status` value, `"played"`,
 * has no web TAB either, so it's likewise not surfaced here.)
 *
 * ── Deferred (web has these; v1 mobile does not) ────────────────────────────
 * Genre/decade/platform filters + sort — web's `MediaFilterBar`. v1 ships the
 * status sections only; filters/sort are a later task. Noted here + in the plan.
 */
import type { GameSubStatus, MediaType, TrackingStatus } from "@intertaind/types";

/**
 * One shelf section. A discriminated union on the filter directive: a section
 * filters EITHER by a top-level `status` (a `TrackingStatus`, so the value
 * flows straight into `.eq("status", …)` without a cast) OR by the
 * `progress->>sub_status` JSONB path (a `GameSubStatus`) — never both. `key`
 * is stable (query-key segment + React key); `label` is the section chip text.
 */
export type ShelfSection =
  | { key: string; label: string; status: TrackingStatus; subStatus?: never }
  | { key: string; label: string; subStatus: GameSubStatus; status?: never };

/**
 * The status sections per media type, in display order. The FIRST entry of each
 * type is the default section when that type is selected (see ShelvesTab's
 * reset-on-type-change).
 */
export const SHELF_CONFIG: Record<MediaType, ShelfSection[]> = {
  // Movies: web TABS verbatim — Watched (completed), Watchlist (want).
  movie: [
    { key: "watched", label: "Watched", status: "completed" },
    { key: "watchlist", label: "Watchlist", status: "want" },
  ],
  // TV: web TABS verbatim — Watched, Currently Watching (in_progress), Watchlist.
  tv_show: [
    { key: "watched", label: "Watched", status: "completed" },
    { key: "watching", label: "Currently Watching", status: "in_progress" },
    { key: "watchlist", label: "Watchlist", status: "want" },
  ],
  // Books: web TABS verbatim — Read, Reading, TBR (want), DNF (dropped).
  book: [
    { key: "read", label: "Read", status: "completed" },
    { key: "reading", label: "Reading", status: "in_progress" },
    { key: "tbr", label: "TBR", status: "want" },
    { key: "dnf", label: "DNF", status: "dropped" },
  ],
  // Games: web games TABS order MINUS the leading aggregate "Played" tab (which
  // is `status != want`, not a sub_status). The remaining sections are the
  // discrete play-states, keeping Wishlist in web's position (after Completed).
  video_game: [
    { key: "playing", label: "Playing", subStatus: "playing" },
    { key: "completed", label: "Completed", subStatus: "completed" },
    { key: "wishlist", label: "Wishlist", status: "want" },
    { key: "shelved", label: "Shelved", subStatus: "shelved" },
    { key: "retired", label: "Retired", subStatus: "retired" },
    { key: "abandoned", label: "Abandoned", subStatus: "abandoned" },
  ],
};
