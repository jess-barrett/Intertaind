/**
 * `formatActivity` — a PURE `activity_log` row → human sentence formatter,
 * shared so both apps render the same phrasing from the same source of truth.
 *
 * Web's `apps/web/src/components/activity/activity-item.tsx` builds RICH JSX
 * (inline stars, cover thumbnails, links). Mobile's Overview only needs a
 * one-line SENTENCE, so this helper distills web's `switch (activity_type)`
 * into plain text — mirroring web's EXACT `activity_type` values and phrasing
 * (added_to_shelf / completed / status_changed / reviewed / rated / favorited /
 * removed / logged_episode / logged_season / started_reading / added_to_top /
 * removed_from_top / created_list / liked_list / saved_list / recommended) so
 * the two surfaces read consistently. Unknown types fall back to a generic
 * "Updated {title}" so a future `activity_type` never renders blank.
 *
 * It lives in `@intertaind/types` (NOT `apps/mobile`) because the types package
 * is the only workspace here with a vitest runner — this keeps the mapping
 * unit-testable (see `format-activity.test.ts`). The title is threaded into the
 * sentence directly; the mobile `ActivityRow` renders the returned string as-is
 * (the cover thumbnail + relative time are chrome around it).
 *
 * Kept in sync with web's `ActivityItem`: when the web renderer's phrasing
 * changes, update this + its test.
 */
import type { ActivityType, MediaType } from "./index.ts";

/**
 * The minimal shape `formatActivity` reads — a subset of an `activity_log`
 * row + its embedded media. Structurally compatible with mobile's
 * `ProfileActivityRow` and web's `ActivityWithMedia`, so either can be passed.
 *
 * `metadata` is `unknown` (not `Record<string, unknown>`) on purpose: the
 * generated `activity_log.metadata` is `Json | null` (which includes scalars),
 * so a narrower type would reject the DB row. `formatActivity` treats a
 * non-object metadata as empty and reads every field defensively, so `unknown`
 * is safe and lets a raw DB row be passed without a cast.
 */
export interface ActivityLike {
  activity_type: ActivityType | string;
  metadata: unknown;
  media: { title: string | null; media_type: MediaType | string } | null;
}

/** Per-type status labels — mirrors web's `STATUS_LABELS`. */
const STATUS_LABELS: Record<MediaType, Record<string, string>> = {
  movie: {
    completed: "Watched",
    in_progress: "Watching",
    want: "Watchlist",
    dropped: "Dropped",
    on_hold: "On Hold",
  },
  tv_show: {
    completed: "Watched",
    in_progress: "Currently Watching",
    want: "Watchlist",
    dropped: "Dropped",
    on_hold: "On Hold",
  },
  book: {
    completed: "Read",
    in_progress: "Reading",
    want: "TBR",
    dropped: "DNF",
    on_hold: "On Hold",
  },
  video_game: {
    completed: "Completed",
    in_progress: "Playing",
    want: "Wishlist",
    dropped: "Abandoned",
    on_hold: "Shelved",
  },
};

/** Game sub-status labels — mirrors web's `GAME_SUB_STATUS_LABELS`. */
const GAME_SUB_STATUS_LABELS: Record<string, string> = {
  playing: "Playing",
  completed: "Completed",
  played: "Played",
  shelved: "Shelved",
  retired: "Retired",
  abandoned: "Abandoned",
};

/** Pluralized type names for the Top-N sentences — web's `TYPE_PLURAL`. */
const TYPE_PLURAL: Record<MediaType, string> = {
  movie: "Movies",
  tv_show: "Shows",
  book: "Books",
  video_game: "Games",
};

const MEDIA_TYPES: MediaType[] = ["movie", "tv_show", "book", "video_game"];

function isMediaType(v: unknown): v is MediaType {
  return typeof v === "string" && (MEDIA_TYPES as string[]).includes(v);
}

function statusLabel(type: MediaType | undefined, status: string): string {
  if (!type) return status;
  return STATUS_LABELS[type]?.[status] ?? status;
}

function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" ? v : null;
}

/**
 * Render one `activity_log` row as a plain-text sentence. Threads the media
 * title into the message (falling back to "Untitled"). Mirrors the message
 * arm of web's `ActivityItem` per `activity_type`; the inline stars / covers
 * web adds are chrome the caller layers on separately.
 */
export function formatActivity(row: ActivityLike): string {
  // metadata is `unknown` (DB `Json | null`) — treat anything that isn't a
  // plain object as empty so every field read below is safe.
  const meta: Record<string, unknown> =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const title = row.media?.title ?? "Untitled";
  const mediaType = isMediaType(row.media?.media_type)
    ? (row.media!.media_type as MediaType)
    : undefined;

  switch (row.activity_type) {
    case "added_to_shelf": {
      const status = String(meta.status ?? "want");
      const gameSub =
        mediaType === "video_game" ? str(meta, "sub_status") : null;
      const label =
        (gameSub && GAME_SUB_STATUS_LABELS[gameSub]) ||
        statusLabel(mediaType, status);
      // "want" reads better as "Added X to Watchlist/TBR/Wishlist"; every
      // other status reads "Added X to Shelf as {label}" (web parity).
      return status === "want"
        ? `Added ${title} to ${label}`
        : `Added ${title} to Shelf as ${label}`;
    }
    case "completed": {
      if (mediaType === "book") {
        return `Added ${title} to Shelf as ${meta.rating != null ? "Finished" : "Read"}`;
      }
      if (mediaType === "tv_show" || mediaType === "movie") {
        return `Added ${title} to Shelf as Watched`;
      }
      if (mediaType === "video_game") {
        const sub = str(meta, "sub_status");
        const label = (sub && GAME_SUB_STATUS_LABELS[sub]) || "Played";
        return `Added ${title} to Shelf as ${label}`;
      }
      return `Finished ${title}`;
    }
    case "status_changed": {
      const to = String(meta.to_status ?? meta.status ?? "");
      const gameSub =
        mediaType === "video_game" ? str(meta, "sub_status") : null;
      const label =
        (gameSub && GAME_SUB_STATUS_LABELS[gameSub]) ||
        statusLabel(mediaType, to);
      return mediaType === "video_game"
        ? `Changed ${title} Status to ${label}`
        : `Moved ${title} to ${label}`;
    }
    case "reviewed":
      return `Reviewed ${title}`;
    case "rated":
      return `Rated ${title}`;
    case "favorited":
      return `Loved ${title}`;
    case "started_reading": {
      const isReread = meta.is_reread === true;
      return `Started ${isReread ? "Rereading" : "Reading"} ${title}`;
    }
    case "removed": {
      if (mediaType === "video_game") return `Removed ${title} from Shelf`;
      const prev = String(meta.previous_status ?? "");
      return prev
        ? `Removed ${title} from ${statusLabel(mediaType, prev)}`
        : `Removed ${title}`;
    }
    case "logged_episode": {
      const s = String(meta.season ?? "?");
      const e = String(meta.episode ?? "?");
      return `Finished Season ${s} Episode ${e} of ${title}`;
    }
    case "logged_season": {
      const s = String(meta.season ?? "?");
      return meta.rating != null
        ? `Rated ${title} Season ${s}`
        : `Watched Season ${s} of ${title}`;
    }
    case "added_to_top": {
      const t = isMediaType(meta.media_type) ? meta.media_type : mediaType;
      return `Added ${title} to Top ${t ? TYPE_PLURAL[t] : "Picks"}`;
    }
    case "removed_from_top": {
      const t = isMediaType(meta.media_type) ? meta.media_type : mediaType;
      return `Removed ${title} from Top ${t ? TYPE_PLURAL[t] : "Picks"}`;
    }
    case "recommended": {
      const sourceTitle = str(meta, "source_title");
      return sourceTitle
        ? `Intertaind ${title} for fans of ${sourceTitle}`
        : `Intertaind ${title} as a pairing`;
    }
    case "created_list":
    case "liked_list":
    case "saved_list": {
      const listTitle = str(meta, "title") ?? "an untitled list";
      const verb =
        row.activity_type === "created_list"
          ? "Created the list"
          : row.activity_type === "liked_list"
            ? "Liked the list"
            : "Saved the list";
      return `${verb} ${listTitle}`;
    }
    default:
      // Unknown / future activity_type — never render blank.
      return `Updated ${title}`;
  }
}
