import Link from "next/link";
import {
  Heart,
  BookOpen,
  Book,
  Bookmark,
  Eye,
  Check,
  X,
  Plus,
  Trash2,
  Star,
  Trophy,
  RefreshCw,
  NotebookPen,
  Share2,
} from "lucide-react";
import type { ActivityWithMedia, MediaType } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import { StarRatingDisplay } from "@/components/star-rating";
import { relativeTime } from "@/lib/time";

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

const FINISHED_VERB: Record<MediaType, string> = {
  movie: "Watched",
  tv_show: "Finished",
  book: "Finished reading",
  video_game: "Finished",
};

const GAME_SUB_STATUS_LABELS: Record<string, string> = {
  playing: "Playing",
  completed: "Completed",
  played: "Played",
  shelved: "Shelved",
  retired: "Retired",
  abandoned: "Abandoned",
};

const TYPE_PLURAL: Record<MediaType, string> = {
  movie: "Movies",
  tv_show: "Shows",
  book: "Books",
  video_game: "Games",
};

function statusLabel(type: MediaType | undefined, status: string): string {
  if (!type) return status;
  return STATUS_LABELS[type]?.[status] ?? status;
}

/**
 * Pick a small icon to prefix a non-review activity message. Compound
 * icons (eye+check, eye+journal, book+x) render the two glyphs side-by-side
 * to convey a combined meaning without needing custom SVGs.
 */
function ActivityIcon({ activity }: { activity: ActivityWithMedia }) {
  const type = activity.activity_type;
  const meta = (activity.metadata ?? {}) as Record<string, unknown>;
  const status = String(meta.status ?? meta.to_status ?? "");
  const mediaType = activity.media?.media_type as MediaType | undefined;
  const cls = "shrink-0 text-text-muted";

  const eyeCheck = (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-text-muted">
      <Eye size={13} />
      <Check size={10} />
    </span>
  );
  const eyeJournal = (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-text-muted">
      <Eye size={13} />
      <NotebookPen size={10} />
    </span>
  );
  const bookX = (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-text-muted">
      <Book size={13} />
      <X size={10} />
    </span>
  );

  // Movies
  if (mediaType === "movie") {
    if (type === "completed") return eyeCheck;
    if ((type === "added_to_shelf" || type === "status_changed") && status === "want")
      return <Bookmark size={13} className={cls} />;
  }

  // TV shows
  if (mediaType === "tv_show") {
    if (type === "completed") return eyeCheck;
    if (type === "logged_episode" || type === "logged_season") return eyeJournal;
    if (
      (type === "added_to_shelf" || type === "status_changed") &&
      status === "in_progress"
    )
      return <Eye size={13} className={cls} />;
    if ((type === "added_to_shelf" || type === "status_changed") && status === "want")
      return <Bookmark size={13} className={cls} />;
  }

  // Books
  if (mediaType === "book") {
    if (type === "started_reading")
      return <BookOpen size={13} className={cls} />;
    if (type === "completed") return <Check size={13} className={cls} />;
    if (
      (type === "added_to_shelf" || type === "status_changed") &&
      status === "in_progress"
    )
      return <BookOpen size={13} className={cls} />;
    if (
      (type === "added_to_shelf" || type === "status_changed") &&
      status === "dropped"
    )
      return bookX;
    if ((type === "added_to_shelf" || type === "status_changed") && status === "want")
      return <Bookmark size={13} className={cls} />;
  }

  // Video games — any shelf-related action gets the plus
  if (mediaType === "video_game") {
    if (
      type === "added_to_shelf" ||
      type === "completed" ||
      type === "status_changed"
    ) {
      return <Plus size={13} className={cls} />;
    }
  }

  // Cross-type fallbacks
  if (type === "favorited") return <Heart size={13} className={cls} />;
  if (type === "removed") return <Trash2 size={13} className={cls} />;
  if (type === "rated") return <Star size={13} className={cls} />;
  if (type === "added_to_top" || type === "removed_from_top")
    return <Trophy size={13} className={cls} />;
  if (type === "status_changed")
    return <RefreshCw size={13} className={cls} />;
  if (type === "recommended") return <Share2 size={13} className={cls} />;

  return null;
}

export default function ActivityItem({
  activity,
}: {
  activity: ActivityWithMedia;
}) {
  const media = activity.media;
  const meta = (activity.metadata ?? {}) as Record<string, unknown>;
  const title = media?.title ?? "Untitled";
  const mediaType = media?.media_type as MediaType | undefined;
  const rating = typeof meta.rating === "number" ? (meta.rating as number) : null;
  const isFav = meta.is_favorite === true;
  const reviewLength =
    typeof meta.review_length === "number" ? (meta.review_length as number) : null;
  const config = mediaType ? MEDIA_TYPE_CONFIG[mediaType] : null;

  const TitleLink = media ? (
    <Link
      href={`/media/${media.id}`}
      className="font-medium text-text-primary transition-colors hover:text-brand"
    >
      {title}
    </Link>
  ) : (
    <span className="font-medium text-text-primary">{title}</span>
  );

  // Special card layout: a logged-episode OR logged-season entry with a
  // review shows the full review text below the title + season/episode row.
  if (
    (activity.activity_type === "logged_episode" ||
      activity.activity_type === "logged_season") &&
    typeof meta.review_text === "string" &&
    (meta.review_text as string).trim().length > 0
  ) {
    const s = String(meta.season ?? "?");
    const e = String(meta.episode ?? "?");
    const isSeason = activity.activity_type === "logged_season";
    return (
      <div className="rounded-sm border border-surface-border bg-surface-raised/40 p-3">
        <div className="flex items-start gap-3">
          {media ? (
            <Link
              href={`/media/${media.id}`}
              className="block h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay"
            >
              {media.cover_image_url ? (
                <img
                  src={media.cover_image_url}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <BookOpen size={16} className={`${config?.color ?? "text-text-muted"} opacity-40`} />
                </div>
              )}
            </Link>
          ) : (
            <div className="h-16 w-12 shrink-0 rounded-sm border border-surface-border bg-surface-overlay" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {TitleLink}
                <span className="text-xs text-text-muted">
                  {isSeason ? `Season ${s}` : `Season ${s} Episode ${e}`}
                </span>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
                {relativeTime(activity.created_at)}
              </span>
            </div>
            {(rating != null || isFav) && (
              <div className="mt-1 flex items-center gap-2">
                {rating != null && <StarRatingDisplay value={rating} size={11} />}
                {isFav && (
                  <Heart size={11} className="fill-accent-movie text-accent-movie" />
                )}
              </div>
            )}
            <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
              {meta.review_text as string}
            </p>
          </div>
        </div>
      </div>
    );
  }

  let message: React.ReactNode = null;
  switch (activity.activity_type) {
    case "added_to_shelf": {
      const status = String(meta.status ?? "want");
      const showCurrentEp =
        mediaType === "tv_show" &&
        status === "in_progress" &&
        meta.current_season != null &&
        meta.current_episode != null;
      // For games, prefer the sub-status label so "Retired" doesn't read
      // as "Shelved" (both share the same on_hold tracking status).
      const gameSub =
        mediaType === "video_game" && typeof meta.sub_status === "string"
          ? (meta.sub_status as string)
          : null;
      const label =
        (gameSub && GAME_SUB_STATUS_LABELS[gameSub]) ||
        statusLabel(mediaType, status);
      // "want" status reads more naturally as "Added X to Watchlist/TBR/Wishlist"
      // than "Added X to Shelf as Watchlist".
      const phrase =
        status === "want"
          ? <>Added {TitleLink} to {label}</>
          : <>Added {TitleLink} to Shelf as {label}</>;
      // DNF (status=dropped) renders its rating inline instead of below.
      const inlineStarsForDnf =
        status === "dropped" && rating != null;
      message = (
        <>
          {inlineStarsForDnf ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{phrase}</span>
              <StarRatingDisplay value={rating!} size={11} />
            </span>
          ) : (
            phrase
          )}
          {showCurrentEp && (
            <>
              {" "}
              <span className="text-text-muted">
                (Season {String(meta.current_season)} Episode {String(meta.current_episode)})
              </span>
            </>
          )}
        </>
      );
      break;
    }
    case "completed": {
      if (mediaType === "book") {
        // Book + rating + no review reads as "Finished" with stars inline.
        if (rating != null) {
          message = (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Added {TitleLink} to Shelf as Finished</span>
              <StarRatingDisplay value={rating} size={11} />
            </span>
          );
        } else {
          message = <>Added {TitleLink} to Shelf as Read</>;
        }
      } else if (mediaType === "tv_show") {
        message = <>Added {TitleLink} to Shelf as Watched</>;
      } else if (mediaType === "movie") {
        message = <>Added {TitleLink} to Shelf as Watched</>;
      } else if (mediaType === "video_game") {
        const sub = typeof meta.sub_status === "string"
          ? (meta.sub_status as string)
          : null;
        const label =
          (sub && GAME_SUB_STATUS_LABELS[sub]) || "Played";
        if (rating != null) {
          message = (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Added {TitleLink} to Shelf as {label}</span>
              <StarRatingDisplay value={rating} size={11} />
            </span>
          );
        } else {
          message = <>Added {TitleLink} to Shelf as {label}</>;
        }
      } else {
        message = (
          <>
            {mediaType ? FINISHED_VERB[mediaType] : "Finished"} {TitleLink}
          </>
        );
      }
      break;
    }
    case "status_changed": {
      // trackMedia stashes the new status under `meta.status`;
      // updateTrackingStatus uses `meta.to_status`. Read either.
      const to = String(meta.to_status ?? meta.status ?? "");
      // For games, prefer the sub_status label (e.g. "Retired" vs the
      // shared on_hold tracking label).
      const gameSub =
        mediaType === "video_game" && typeof meta.sub_status === "string"
          ? (meta.sub_status as string)
          : null;
      const label =
        (gameSub && GAME_SUB_STATUS_LABELS[gameSub]) ||
        statusLabel(mediaType, to);
      message =
        mediaType === "video_game" ? (
          <>
            Changed {TitleLink} Status to {label}
          </>
        ) : (
          <>
            Moved {TitleLink} to {label}
          </>
        );
      break;
    }
    case "reviewed": {
      const hours =
        typeof meta.hours_played === "number"
          ? (meta.hours_played as number)
          : null;
      message = (
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          {TitleLink}
          {mediaType === "video_game" && hours != null && hours > 0 && (
            <span className="text-xs font-light text-text-muted">
              {hours}h played
            </span>
          )}
        </span>
      );
      break;
    }
    case "rated": {
      message = (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>Rated {TitleLink}</span>
          {rating != null && <StarRatingDisplay value={rating} size={11} />}
        </span>
      );
      break;
    }
    case "favorited": {
      message = <>Loved {TitleLink}</>;
      break;
    }
    case "started_reading": {
      const page = meta.current_page;
      const isReread = meta.is_reread === true;
      message = (
        <>
          Started {isReread ? "Rereading" : "Reading"} {TitleLink}
          {typeof page === "number" && page > 0 && (
            <> on Page {page}</>
          )}
        </>
      );
      break;
    }
    case "removed": {
      const prev = String(meta.previous_status ?? "");
      // Games map several sub-statuses to the same tracking status
      // ("Played" + "Completed" both = completed), so showing "removed
      // from Completed" is misleading. Just say "from Shelf" for games.
      if (mediaType === "video_game") {
        message = <>Removed {TitleLink} from Shelf</>;
      } else {
        message = (
          <>
            Removed {TitleLink}
            {prev && <> from {statusLabel(mediaType, prev)}</>}
          </>
        );
      }
      break;
    }
    case "logged_episode": {
      const s = meta.season ?? "?";
      const e = meta.episode ?? "?";
      // No-review path. Stars render inline after the message per spec
      // ("Finished Season # Episode # of [show] rating ★★★☆☆").
      message = (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>
            Finished Season {String(s)} Episode {String(e)} of {TitleLink}
          </span>
          {rating != null && (
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              rating <StarRatingDisplay value={rating} size={11} />
            </span>
          )}
        </span>
      );
      break;
    }
    case "logged_season": {
      const s = String(meta.season ?? "?");
      if (rating != null) {
        message = (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              Rated {TitleLink} Season {s}
            </span>
            <StarRatingDisplay value={rating} size={11} />
          </span>
        );
      } else {
        message = (
          <>
            Watched Season {s} of {TitleLink}
          </>
        );
      }
      break;
    }
    case "added_to_top": {
      const t = (meta.media_type as MediaType | undefined) ?? mediaType;
      message = (
        <>
          Added {TitleLink} to Top {t ? TYPE_PLURAL[t] : "Picks"}
        </>
      );
      break;
    }
    case "removed_from_top": {
      const t = (meta.media_type as MediaType | undefined) ?? mediaType;
      message = (
        <>
          Removed {TitleLink} from Top {t ? TYPE_PLURAL[t] : "Picks"}
        </>
      );
      break;
    }
    case "recommended": {
      // The activity row stores `media_id = recommended_media_id` (the
      // target — what gets clicked through to). The source is in
      // metadata.source_media_id but we don't hydrate its title at the
      // feed level to avoid an N+1 join, so the message stays
      // single-sided. Followers click through to see the pairing.
      message = <>Intertaind {TitleLink} as a pairing</>;
      break;
    }
  }

  // Only review-flavored activities get the cover thumbnail. Everything
  // else stays as a one-line row of text + small icons. (logged_episode
  // with a review uses its own card layout earlier in this file.)
  const showCover = activity.activity_type === "reviewed";

  return (
    <div className="rounded-sm border border-surface-border bg-surface-raised/40 p-3">
      <div className="flex items-start gap-3">
        {showCover && media && (
          <Link
            href={`/media/${media.id}`}
            className="block h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay"
          >
            {media.cover_image_url ? (
              <img
                src={media.cover_image_url}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <BookOpen size={16} className={`${config?.color ?? "text-text-muted"} opacity-40`} />
              </div>
            )}
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ActivityIcon activity={activity} />
              <div className="text-sm text-text-secondary">{message}</div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
              {relativeTime(activity.created_at)}
            </span>
          </div>
          {/* Several activity types render their rating inline within the
              message text — skip the standard rating row for those to avoid
              duplicating the stars. Watchlist/TBR/Wishlist rows also skip
              it: a "want" activity isn't about your rating, even if you
              already had one on the row. DNF book reviews always show the
              row to render the red DNF badge. */}
          {(rating != null ||
            isFav ||
            (activity.activity_type === "reviewed" &&
              mediaType === "book" &&
              String(meta.status ?? "") === "dropped")) &&
            activity.activity_type !== "logged_episode" &&
            activity.activity_type !== "logged_season" &&
            activity.activity_type !== "rated" &&
            !(
              activity.activity_type === "added_to_shelf" &&
              String(meta.status ?? "") === "want"
            ) &&
            !(
              activity.activity_type === "added_to_shelf" &&
              String(meta.status ?? "") === "dropped" &&
              rating != null
            ) &&
            !(
              activity.activity_type === "completed" &&
              mediaType === "book" &&
              rating != null
            ) &&
            !(
              activity.activity_type === "completed" &&
              mediaType === "video_game" &&
              rating != null
            ) && (
            <div className="mt-1.5 flex items-center gap-2">
              {rating != null && <StarRatingDisplay value={rating} size={11} />}
              {/* DNF book reviews get a red badge next to the stars and
                  skip the heart entirely — a "didn't finish" reads weird
                  alongside a love icon. */}
              {activity.activity_type === "reviewed" &&
                mediaType === "book" &&
                String(meta.status ?? "") === "dropped" ? (
                <span className="rounded-sm bg-accent-movie/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-movie">
                  DNF
                </span>
              ) : (
                isFav && (
                  <Heart
                    size={11}
                    className="fill-accent-movie text-accent-movie"
                  />
                )
              )}
            </div>
          )}
          {activity.activity_type === "reviewed" &&
            typeof meta.review_text === "string" &&
            (meta.review_text as string).trim().length > 0 && (
              <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
                {meta.review_text as string}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
