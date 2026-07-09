/**
 * QuickLogForm — the per-type body of the quick-log (+) flow's LOG step, so
 * logging from the ＋ button offers each type's UNIQUE fields (not just the
 * generic form). It mirrors the detail-screen log sheets, reusing the SAME
 * shared pieces so the two can't drift:
 *   - `LogForm` (with its field flags) for the common date/rating/loved/review/
 *     repeat/spoiler block,
 *   - the TV season/episode pickers (`tv-pickers`) + the shared save helpers
 *     (`lib/tv-log`), the same the detail TV sheets use,
 *   - `buildBookProgress` / `buildGameProgress` / `buildLogProgress` for the
 *     progress JSONB (merged over the viewer's current progress).
 *
 * Per type:
 *   - movie: the full generic form (Watched/Watchlist + date + rating+loved +
 *     review + rewatch + spoiler).
 *   - book:  Want to Read / Finished / Didn't finish, then the read fields.
 *   - game:  Wishlist + the six play states, hours, then the play fields.
 *   - tv:    a Show | Season | Episode mode selector — Show logs the show as a
 *     whole (status + rating + review), Season/Episode log into
 *     progress.seasons / episode_logs via the shared helpers.
 *
 * Container-agnostic on input: it renders a plain RN `TextInput` (quick-log is
 * a full-screen modal, not a @gorhom sheet). Each panel assembles a
 * `TrackMediaVars` and hands it up via `onLog`; the screen fires the mutation
 * and dismisses. `saving` disables the Log button while the write is in flight.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Bookmark,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildBookProgress,
  buildGameProgress,
  starsToRating,
  type GameSubStatus,
  type MediaType,
  type ProgressRecord,
  type TrackingStatus,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import StarRating from "@/components/star-rating";
import {
  LogForm,
  SpoilerToggle,
  buildLogProgress,
  type LogFormValue,
} from "@/components/media/log-form";
import { GAME_STATUSES } from "@/components/media/tracking-config";
import { EpisodeChips, SeasonChips } from "@/components/media/sheets/tv-pickers";
import { useMediaDetail } from "@/queries/media";
import { parseTvSeasons } from "@/lib/tv-metadata";
import { buildEpisodeLogVars, buildSeasonLogVars } from "@/lib/tv-log";
import type { TrackMediaVars } from "@/queries/tracking";

type ViewerRow = Tables<"user_media"> | null;
type Progress = Tables<"user_media">["progress"];

/** A fresh log's defaults (completed today, unrated). */
function freshValue(): LogFormValue {
  return {
    date: new Date(),
    status: "completed",
    rating: null,
    review: "",
    loved: false,
    isRepeat: false,
    hasSpoilers: false,
  };
}

/** The viewer's existing progress, or null (for the merge base). */
function existingProgressOf(viewerRow: ViewerRow): ProgressRecord | null {
  return (viewerRow?.progress ?? null) as ProgressRecord | null;
}

/** Merge a `has_spoilers` flag onto existing progress (show-level TV / generic
 *  reviews that don't otherwise touch progress). */
function mergeSpoiler(existing: ProgressRecord | null, hasSpoilers: boolean): Progress {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};
  return { ...base, has_spoilers: hasSpoilers } as Progress;
}

/** Small uppercase section label — matches LogForm's field labels. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
      {children}
    </Text>
  );
}

/** A selectable pill — brand fill when active. */
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

/** One tap-to-select row — icon + label (+ optional description), checked when
 *  active. Used by the game play-state list. */
function SelectRow({
  icon: Icon,
  label,
  desc,
  accent,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  desc?: string;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={desc ? `${label} — ${desc}` : label}
      className={`flex-row items-center gap-3 rounded-sm px-3 py-3 active:opacity-70 ${
        active ? "bg-surface-overlay" : ""
      }`}
      onPress={onPress}
    >
      <Icon size={20} color={accent} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-text-primary">{label}</Text>
        {desc ? <Text className="text-xs text-text-muted">{desc}</Text> : null}
      </View>
      {active ? <Check size={18} color={colors.brand} /> : null}
    </Pressable>
  );
}

/** A plain review field (quick-log is a full-screen modal, not a sheet). */
function ReviewField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <View>
      <FieldLabel>Review</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["text-muted"]}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Review"
        className="min-h-24 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
        style={{ color: colors["text-primary"], minHeight: 96 }}
      />
    </View>
  );
}

/** The primary Log button. */
function LogButton({
  label,
  onPress,
  disabled,
  saving,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  saving: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || saving, busy: saving }}
      disabled={disabled || saving}
      className={`mt-8 items-center rounded-sm bg-brand py-3 active:opacity-80 ${
        disabled || saving ? "opacity-60" : ""
      }`}
      onPress={onPress}
    >
      {saving ? (
        <ActivityIndicator color={colors["text-primary"]} />
      ) : (
        <Text className="text-base font-semibold text-text-primary">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type PanelProps = {
  mediaId: string;
  viewerRow: ViewerRow;
  saving: boolean;
  onLog: (vars: TrackMediaVars) => void;
};

/** Movie — the full generic form. */
function MovieQuickLog({ mediaId, viewerRow, saving, onLog }: PanelProps) {
  const [value, setValue] = useState<LogFormValue>(freshValue);
  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));

  function log() {
    const isCompleted = value.status === "completed";
    onLog({
      mediaId,
      status: value.status,
      rating: value.rating != null ? starsToRating(value.rating) : undefined,
      review: value.review.trim() || undefined,
      is_favorite: value.loved,
      ...(isCompleted
        ? {
            completed_at: value.date.toISOString(),
            progress: buildLogProgress(viewerRow?.progress ?? null, "movie", {
              date: value.date,
              isRepeat: value.isRepeat,
              hasSpoilers: value.hasSpoilers,
            }),
          }
        : {}),
    });
  }

  return (
    <>
      <LogForm mediaType="movie" value={value} onChange={patch} />
      <LogButton label="Log" onPress={log} saving={saving} />
    </>
  );
}

/** Book shelves, in display order: Read · Reading · DNF · TBR. */
type BookShelf = "read" | "reading" | "dnf" | "tbr";
const BOOK_SHELVES: { key: BookShelf; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "reading", label: "Reading" },
  { key: "dnf", label: "DNF" },
  { key: "tbr", label: "TBR" },
];

/** Map a shelf → its tracking status + book `sub_shelf` (TBR has no shelf). */
const BOOK_SHELF_MAP: Record<
  Exclude<BookShelf, "tbr">,
  { status: TrackingStatus; sub_shelf: "finished" | "currently_reading" | "dnf" }
> = {
  read: { status: "completed", sub_shelf: "finished" },
  reading: { status: "in_progress", sub_shelf: "currently_reading" },
  dnf: { status: "dropped", sub_shelf: "dnf" },
};

/** Book — Read / Reading / DNF / TBR, then the read fields. */
function BookQuickLog({ mediaId, viewerRow, saving, onLog }: PanelProps) {
  const [shelf, setShelf] = useState<BookShelf>("read");
  const [value, setValue] = useState<LogFormValue>(freshValue);
  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));

  function log() {
    if (shelf === "tbr") {
      onLog({
        mediaId,
        status: "want",
        rating: value.rating != null ? starsToRating(value.rating) : undefined,
        review: value.review.trim() || undefined,
        is_favorite: value.loved,
      });
      return;
    }
    const { status, sub_shelf } = BOOK_SHELF_MAP[shelf];
    const base = buildBookProgress(existingProgressOf(viewerRow), { sub_shelf });
    const progress = buildLogProgress(base as Progress, "book", {
      date: value.date,
      isRepeat: value.isRepeat,
      hasSpoilers: value.hasSpoilers,
    });
    onLog({
      mediaId,
      status,
      rating: value.rating != null ? starsToRating(value.rating) : undefined,
      review: value.review.trim() || undefined,
      is_favorite: value.loved,
      progress,
      // Only a finished read stamps a completion date.
      completed_at: shelf === "read" ? value.date.toISOString() : null,
    });
  }

  return (
    <>
      <View className="mb-6">
        <FieldLabel>Shelf</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {BOOK_SHELVES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={shelf === s.key}
              onPress={() => setShelf(s.key)}
            />
          ))}
        </View>
      </View>
      {/* The read fields don't apply to a pure "to be read" add. */}
      {shelf !== "tbr" ? (
        <LogForm mediaType="book" value={value} onChange={patch} showStatus={false} />
      ) : null}
      <LogButton
        label={shelf === "tbr" ? "Add to shelf" : "Log"}
        onPress={log}
        saving={saving}
      />
    </>
  );
}

type GameChoice = "wishlist" | GameSubStatus;

type GameOption = {
  key: GameChoice;
  label: string;
  icon: LucideIcon;
  accent: string;
  desc?: string;
};

/** Wishlist + the six play states, as the dropdown's options. */
const GAME_OPTIONS: GameOption[] = [
  { key: "wishlist", label: "Wishlist", icon: Bookmark, accent: colors["brand-light"] },
  ...GAME_STATUSES.map((o) => ({
    key: o.key,
    label: o.label,
    icon: o.icon,
    accent: colors[o.accent],
    desc: o.desc,
  })),
];

/** Inline-expanding status dropdown — collapsed shows the current choice; tap
 *  to reveal the options beneath (joined to the field), pick to collapse. */
function GameStatusDropdown({
  value,
  onChange,
}: {
  value: GameChoice;
  onChange: (next: GameChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = GAME_OPTIONS.find((o) => o.key === value) ?? GAME_OPTIONS[0];
  const SelectedIcon = selected.icon;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Status: ${selected.label}`}
        className={`flex-row items-center justify-between border border-surface-border bg-surface-overlay px-3 py-2.5 active:opacity-70 ${
          open ? "rounded-t-sm border-b-0" : "rounded-sm"
        }`}
        onPress={() => setOpen((o) => !o)}
      >
        <View className="flex-row items-center gap-3">
          <SelectedIcon size={18} color={selected.accent} />
          <Text className="text-sm text-text-primary">{selected.label}</Text>
        </View>
        <ChevronDown size={18} color={colors["text-muted"]} />
      </Pressable>
      {open ? (
        <View className="overflow-hidden rounded-b-sm border border-surface-border bg-surface-overlay">
          {GAME_OPTIONS.map((o) => (
            <SelectRow
              key={o.key}
              icon={o.icon}
              label={o.label}
              desc={o.desc}
              accent={o.accent}
              active={o.key === value}
              onPress={() => {
                onChange(o.key);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Game — a status dropdown (Wishlist + six play states), Hours, and rating +
 * Loved + review. Deliberately NOT a play-session log: no date, no
 * replay/spoiler — just adding a game to a shelf.
 */
function GameQuickLog({ mediaId, viewerRow, saving, onLog }: PanelProps) {
  const [choice, setChoice] = useState<GameChoice>("played");
  const [hours, setHours] = useState("");
  const [value, setValue] = useState<LogFormValue>(freshValue);
  const patch = (p: Partial<LogFormValue>) => setValue((v) => ({ ...v, ...p }));
  const isWishlist = choice === "wishlist";

  function log() {
    if (isWishlist) {
      onLog({ mediaId, status: "want" });
      return;
    }
    const selected =
      GAME_STATUSES.find((o) => o.key === choice) ?? GAME_STATUSES[0];
    const parsed = hours.trim() === "" ? null : Number(hours);
    const hrs = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const progress = buildGameProgress(existingProgressOf(viewerRow), {
      sub_status: selected.key,
      ...(hrs != null ? { hours_played: hrs } : {}),
    }) as Progress;
    onLog({
      mediaId,
      status: selected.tracking,
      rating: value.rating != null ? starsToRating(value.rating) : undefined,
      review: value.review.trim() || undefined,
      is_favorite: value.loved,
      progress,
      // completed_at derived from status by the mutation (no date field here).
    });
  }

  return (
    <>
      <View className="mb-6">
        <FieldLabel>Status</FieldLabel>
        <GameStatusDropdown value={choice} onChange={setChoice} />
      </View>
      {!isWishlist ? (
        <View className="gap-6">
          <View>
            <FieldLabel>Hours played</FieldLabel>
            <TextInput
              value={hours}
              onChangeText={setHours}
              placeholder="0"
              placeholderTextColor={colors["text-muted"]}
              keyboardType="decimal-pad"
              accessibilityLabel="Hours played"
              className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5 text-sm text-text-primary"
              style={{ color: colors["text-primary"] }}
            />
          </View>
          {/* Rating + Loved + review only — no date/replay/spoiler for a game. */}
          <LogForm
            mediaType="video_game"
            value={value}
            onChange={patch}
            showStatus={false}
            showDate={false}
            showRepeat={false}
            showSpoiler={false}
          />
        </View>
      ) : null}
      <LogButton
        label={isWishlist ? "Add to Wishlist" : "Log"}
        onPress={log}
        saving={saving}
      />
    </>
  );
}

type TvMode = "show" | "season" | "episode";

/** Watched / Watching / Watchlist → tracking status (TV Show mode). */
const TV_SHOW_STATUSES: { label: string; status: TrackingStatus }[] = [
  { label: "Watched", status: "completed" },
  { label: "Watching", status: "in_progress" },
  { label: "Watchlist", status: "want" },
];

/** TV — a Show | Season | Episode mode selector. */
function TvQuickLog({ mediaId, viewerRow, saving, onLog }: PanelProps) {
  const detail = useMediaDetail(mediaId);
  const seasonMeta = parseTvSeasons(detail.data?.metadata ?? null);

  const [mode, setMode] = useState<TvMode>("show");

  // Show-mode state.
  const [showStatus, setShowStatus] = useState<TrackingStatus>("completed");
  const [showValue, setShowValue] = useState<LogFormValue>(freshValue);
  const patchShow = (p: Partial<LogFormValue>) =>
    setShowValue((v) => ({ ...v, ...p }));

  // Season/episode-mode state.
  const firstSeason = seasonMeta.seasonNumbers[0] ?? 1;
  const [season, setSeason] = useState(firstSeason);
  const [episode, setEpisode] = useState<number | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [hasSpoilers, setHasSpoilers] = useState(false);

  function resetPerSeason() {
    setStars(null);
    setReview("");
    setHasSpoilers(false);
  }

  function logShow() {
    // Watchlist — a bare "want" add.
    if (showStatus === "want") {
      onLog({ mediaId, status: "want" });
      return;
    }
    // Watching — just the "currently on" pointer (no rating/review/loved, so
    // we also don't risk clobbering an existing favorite).
    if (showStatus === "in_progress") {
      const existing = existingProgressOf(viewerRow);
      const base =
        existing && typeof existing === "object" && !Array.isArray(existing)
          ? existing
          : {};
      onLog({
        mediaId,
        status: "in_progress",
        progress: {
          ...base,
          current_season: season,
          current_episode: episode ?? 1,
        } as Progress,
      });
      return;
    }
    // Watched — the show-level rating + loved + review + spoiler.
    onLog({
      mediaId,
      status: "completed",
      rating:
        showValue.rating != null ? starsToRating(showValue.rating) : undefined,
      review: showValue.review.trim() || undefined,
      is_favorite: showValue.loved,
      progress: mergeSpoiler(existingProgressOf(viewerRow), showValue.hasSpoilers),
    });
  }

  function logSeason() {
    const vars = buildSeasonLogVars({
      existingProgress: existingProgressOf(viewerRow),
      seasonMeta,
      season,
      stars,
      review,
      hasSpoilers,
    });
    onLog({ mediaId, ...vars });
  }

  function logEpisode() {
    if (episode == null) return;
    const vars = buildEpisodeLogVars({
      existingProgress: existingProgressOf(viewerRow),
      seasonMeta,
      currentStatus: (viewerRow?.status as TrackingStatus | undefined) ?? null,
      season,
      episode,
      stars,
      review,
      hasSpoilers,
    });
    onLog({ mediaId, ...vars });
  }

  return (
    <>
      {/* Mode selector — Show | Season | Episode. */}
      <View className="mb-6">
        <FieldLabel>Log</FieldLabel>
        <View className="flex-row gap-2">
          <Chip label="Show" active={mode === "show"} onPress={() => setMode("show")} />
          <Chip
            label="Season"
            active={mode === "season"}
            onPress={() => {
              setMode("season");
              resetPerSeason();
            }}
          />
          <Chip
            label="Episode"
            active={mode === "episode"}
            onPress={() => {
              setMode("episode");
              setEpisode(null);
              resetPerSeason();
            }}
          />
        </View>
      </View>

      {mode === "show" ? (
        <View className="gap-6">
          <View>
            <FieldLabel>Status</FieldLabel>
            <View className="flex-row gap-2">
              {TV_SHOW_STATUSES.map((s) => (
                <Chip
                  key={s.status}
                  label={s.label}
                  active={showStatus === s.status}
                  onPress={() => {
                    setShowStatus(s.status);
                    // Watching needs a current-episode default so the picker
                    // shows a selection.
                    if (s.status === "in_progress" && episode == null) {
                      setEpisode(1);
                    }
                  }}
                />
              ))}
            </View>
          </View>

          {/* Watching → capture the "currently on" pointer (season + episode). */}
          {showStatus === "in_progress" ? (
            <>
              <View>
                <FieldLabel>Current season</FieldLabel>
                <SeasonChips
                  seasonNumbers={seasonMeta.seasonNumbers}
                  selected={season}
                  onSelect={(s) => {
                    setSeason(s);
                    setEpisode(1);
                  }}
                />
              </View>
              <View>
                <FieldLabel>Current episode</FieldLabel>
                <EpisodeChips
                  episodeCount={seasonMeta.episodeCountFor(season)}
                  selected={episode}
                  onSelect={setEpisode}
                />
              </View>
            </>
          ) : null}

          {/* Only Watched carries a show-level rating + loved + review +
              spoiler. Watching is just the pointer; Watchlist is bare. */}
          {showStatus === "completed" ? (
            <LogForm
              mediaType="tv_show"
              value={showValue}
              onChange={patchShow}
              showStatus={false}
              showDate={false}
              showRepeat={false}
            />
          ) : null}

          <LogButton
            label={showStatus === "want" ? "Add to Watchlist" : "Log"}
            onPress={logShow}
            saving={saving}
          />
        </View>
      ) : (
        <View className="gap-6">
          <View>
            <FieldLabel>Season</FieldLabel>
            <SeasonChips
              seasonNumbers={seasonMeta.seasonNumbers}
              selected={season}
              onSelect={(s) => {
                setSeason(s);
                setEpisode(null);
                resetPerSeason();
              }}
            />
          </View>

          {mode === "episode" ? (
            <View>
              <FieldLabel>Episode</FieldLabel>
              <EpisodeChips
                episodeCount={seasonMeta.episodeCountFor(season)}
                selected={episode}
                onSelect={(e) => {
                  setEpisode(e);
                  resetPerSeason();
                }}
              />
            </View>
          ) : null}

          {/* Rating/review/spoiler unlock once a target is chosen (episode mode
              needs an episode picked; season mode always has a season). */}
          {mode === "season" || episode != null ? (
            <>
              <View className="flex-row items-start">
                <View>
                  <FieldLabel>Rating</FieldLabel>
                  <StarRating value={stars} onChange={setStars} size={28} starsOnly />
                </View>
              </View>
              <ReviewField
                value={review}
                onChangeText={setReview}
                placeholder={
                  mode === "season"
                    ? "Thoughts on this season…"
                    : "Thoughts on this episode…"
                }
              />
              <View className="flex-row">
                <SpoilerToggle
                  value={hasSpoilers}
                  onChange={setHasSpoilers}
                  disabled={review.trim().length === 0}
                />
              </View>
              <LogButton
                label={mode === "season" ? "Log season" : "Log episode"}
                onPress={mode === "season" ? logSeason : logEpisode}
                saving={saving}
              />
            </>
          ) : null}
        </View>
      )}
    </>
  );
}

/** The per-type quick-log body, routed by media type. */
export function QuickLogForm({
  mediaType,
  ...props
}: PanelProps & { mediaType: MediaType }) {
  switch (mediaType) {
    case "book":
      return <BookQuickLog {...props} />;
    case "video_game":
      return <GameQuickLog {...props} />;
    case "tv_show":
      return <TvQuickLog {...props} />;
    case "movie":
    default:
      return <MovieQuickLog {...props} />;
  }
}
