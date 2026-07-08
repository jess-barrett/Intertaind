/**
 * CardActions — the tap-to-slide-out quick-actions tab for a mobile
 * `MediaCard`. The touch analogue of web's card hover actions
 * (`apps/web/src/components/media-card-actions.tsx`): web shows a notched,
 * media-type-colored icon tab at the poster's bottom-left and, ON HOVER,
 * slides it out into a row of quick actions plus a ⋯ that opens a per-type
 * popup. Mobile has no hover, so TAPPING the tab toggles the slide-out; the
 * ⋯ opens a per-type bottom sheet (AppSheet) instead of a floating popup.
 *
 * ── Reuse, not rebuild ─────────────────────────────────────────────────
 * The per-type GRAMMAR (status labels/statuses, list label, log buttons,
 * game statuses) comes verbatim from `TRACKING_CONFIG` / `GAME_STATUSES`
 * (./tracking-config) — the SAME table the detail-screen action strip
 * reads. The WRITES go through the existing tracking mutations
 * (useTrackMediaMutation / useToggleFavoriteMutation / useRateMediaMutation),
 * all of which support lazy-create for an untracked item. This component
 * is the COMPACT, poster-overlay analogue of `action-strip.tsx`.
 *
 * ── The ensure-id landmine (uncataloged descriptors) ──────────────────
 * A `CardMedia` may have no catalog row yet (`mediaItemId` null) — only the
 * filmography-credit source produces those (it carries an `upsert` payload);
 * catalog-row sources (home rails) always have a `mediaItemId`. The tracking
 * mutations need a real `media_id`, so any action first calls `ensureId()`,
 * which get-or-creates the catalog row via `useMediaUpsertMutation` (the
 * `media-upsert` Edge Function) and CACHES the returned id in local state —
 * so repeated actions on the same card never re-upsert. While that first
 * upsert is in flight the actions are disabled and a small spinner shows (the
 * same "enriching…" busy language as the card's own tap-to-enrich).
 *
 * ── The notch ─────────────────────────────────────────────────────────
 * The tab background is a `react-native-svg` polygon matching web's
 * `polygon(0 0, 0 100%, 100% 100%, 100% 12px, calc(100%-12px) 0)` — a 12pt
 * corner cut on the TOP-RIGHT. The polygon is redrawn at the current tab
 * width (collapsed = glyph square, expanded = the action row) and the
 * width change is animated with `LayoutAnimation`, so the row slides out
 * from the glyph. Icons color via the `color` PROP (react-native-svg),
 * never a className — the SVG can't see NativeWind classes.
 *
 * ── Cache sync ─────────────────────────────────────────────────────────
 * Every inline mutation calls the parent-supplied `onMutated` on success;
 * the Person screen wires that to invalidate the batched person tracking +
 * media-meta maps, so the card's active states refresh after an action.
 * Errors are mapped to a friendly line via `trackingErrorMessage`
 * (never the raw Supabase error), shown inline in the ⋯ sheet.
 */
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import {
  Bookmark,
  Check,
  ExternalLink,
  Eye,
  Heart,
  MoreHorizontal,
  Swords,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import {
  buildGameProgress,
  ratingToStars,
  starsToRating,
  type MediaType,
} from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import StarRating from "@/components/star-rating";
import AppSheet, { type AppSheetRef } from "@/components/sheet/app-sheet";
import type { CardMedia } from "@/components/media/card-media";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { trackingErrorMessage } from "@/lib/tracking-errors";
import { useMediaUpsertMutation } from "@/queries/media";
import {
  useRateMediaMutation,
  useToggleFavoriteMutation,
  useTrackMediaMutation,
} from "@/queries/tracking";
import {
  GAME_STATUSES,
  TRACKING_CONFIG,
  type GameStatusOption,
  type StatusAction,
} from "./tracking-config";

// Enable LayoutAnimation on Android (a no-op on iOS, where it's always on).
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Per-type accent HEX for the tab glyph + active states (react-native-svg
 *  needs a hex color prop, not the className MEDIA_TYPE_CONFIG carries). */
const TYPE_ACCENT: Record<MediaType, string> = {
  movie: colors["accent-movie"],
  tv_show: colors["accent-tv"],
  book: colors["accent-book"],
  video_game: colors["accent-game"],
};

// Tab geometry. The collapsed tab is a square glyph; the expanded tab is a
// row of the glyph + three actions. The 12pt corner cut mirrors web.
const TAB_HEIGHT = 30;
const TAB_COLLAPSED_WIDTH = 30;
const TAB_EXPANDED_WIDTH = 128;
/** Narrower expanded width for compact cards (the home rails, ~112pt-wide
 *  posters) so the slide-out row — and its ⋯ — fits inside the poster's
 *  overflow-hidden bounds instead of being clipped off the right edge. */
const TAB_EXPANDED_WIDTH_COMPACT = 102;
const NOTCH = 12;

/** Slide-in/out layout tween for the width reveal (mirrors web's 200ms). */
const SLIDE = LayoutAnimation.create(
  180,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.scaleXY,
);

/**
 * The notched tab background — a react-native-svg polygon matching web's
 * `polygon(0 0, 0 100%, 100% 100%, 100% 12px, calc(100%-12px) 0)`: a 12pt
 * cut on the TOP-RIGHT corner. Redrawn at the current tab width.
 */
function NotchBackground({ width }: { width: number }) {
  const d = `M0 0 L0 ${TAB_HEIGHT} L${width} ${TAB_HEIGHT} L${width} ${NOTCH} L${
    width - NOTCH
  } 0 Z`;
  return (
    <Svg
      width={width}
      height={TAB_HEIGHT}
      // Absolute fill behind the icon row (the row sits on top).
      style={{ position: "absolute", left: 0, top: 0 }}
      pointerEvents="none"
    >
      <Path d={d} fill={colors["surface-raised"]} />
    </Svg>
  );
}

/**
 * A bare icon toggle for the slide-out row — the compact mirror of
 * action-strip's `IconAction`: no background box, active → the accent
 * glyph (filled for the heart via `fillWhenActive`), inactive → muted.
 * Colors via the `color` prop (react-native-svg), never a className.
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
  accent: string;
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
      hitSlop={4}
      className={`items-center justify-center ${disabled ? "opacity-50" : "active:opacity-60"}`}
      onPress={onPress}
    >
      <Icon
        size={16}
        color={active ? accent : colors["text-secondary"]}
        fill={fillWhenActive && active ? accent : "none"}
      />
    </Pressable>
  );
}

/** One tap-to-apply row in the ⋯ sheet — icon + label, checked when active. */
function SheetRow({
  icon: Icon,
  label,
  active,
  accent,
  disabled,
  onPress,
}: {
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  accent?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-sm px-3 py-3 active:opacity-70 ${
        active ? "bg-surface-overlay" : ""
      } ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
    >
      {Icon ? (
        <Icon
          size={18}
          color={active && accent ? accent : colors["text-secondary"]}
        />
      ) : null}
      <Text className="flex-1 text-sm text-text-primary">{label}</Text>
      {active ? (
        <Check size={18} color={accent ?? colors.brand} />
      ) : null}
    </Pressable>
  );
}

export function CardActions({
  media,
  tracking,
  onMutated,
  compact = false,
}: {
  media: CardMedia;
  tracking: {
    status: string;
    rating: number | null;
    is_favorite: boolean;
  } | null;
  onMutated?: () => void;
  /** Use the narrower expanded slide-out so the row fits inside a compact
      (rail) poster's width — otherwise the ⋯ is clipped. Default false. */
  compact?: boolean;
}) {
  const router = useRouter();
  const upsert = useMediaUpsertMutation();
  const trackMutation = useTrackMediaMutation();
  const favoriteMutation = useToggleFavoriteMutation();
  const rateMutation = useRateMediaMutation();

  const sheetRef = useRef<AppSheetRef>(null);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cache the resolved catalog id so repeated actions don't re-upsert an
  // already-enriched credit (see file header). Seeded from the descriptor's
  // existing catalog id.
  const [resolvedId, setResolvedId] = useState<string | null>(
    media.mediaItemId,
  );

  const mediaType = media.mediaType;
  const config = TRACKING_CONFIG[mediaType];
  const accent = TYPE_ACCENT[mediaType];
  const isGame = mediaType === "video_game";
  const TabGlyph = MEDIA_TYPE_ICONS[mediaType];

  const status = tracking?.status ?? null;
  const isFavorite = tracking?.is_favorite ?? false;
  const isWant = status === "want";
  const isCompleted = status === "completed";
  const stars =
    tracking?.rating != null ? ratingToStars(Number(tracking.rating)) : null;
  // Games store their play state in progress.sub_status, which the batched
  // person tracking map does NOT carry — so the ⋯ game list can't show a
  // specific sub_status check; it checks the mapped DB status instead.
  const gameStatusActive = (opt: GameStatusOption): boolean =>
    status === opt.tracking;

  // The upsert is the only thing that blocks — mutations are optimistic.
  const busy = upsert.isPending;

  /**
   * Resolve a real `media_id`. Cataloged descriptors already have one; an
   * uncataloged filmography credit is get-or-created via the media-upsert Edge
   * Function (its `upsert` payload) and the id cached so a second action
   * reuses it. Catalog-row cards always carry a `mediaItemId`, so they never
   * reach the guard throw. Throws on failure so the caller aborts (the
   * settle-refetch / a re-tap recovers).
   */
  async function ensureId(): Promise<string> {
    if (resolvedId) return resolvedId;
    if (!media.upsert) {
      throw new Error(
        "Cannot resolve a catalog id: no media_item_id and no enrich payload",
      );
    }
    const id = await upsert.mutateAsync(media.upsert);
    setResolvedId(id);
    return id;
  }

  const report = (err: unknown) =>
    setErrorMessage(trackingErrorMessage(err, "your changes", "card-actions"));

  function toggleOpen() {
    LayoutAnimation.configureNext(SLIDE);
    setOpen((v) => !v);
  }

  /** The status quick-toggle → track "completed" (games also set sub_status
   *  "played", mirroring web's card quick action). */
  async function handleStatus() {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      // Games have no bare "completed" — web's card quick action lands them
      // on the Played shelf. The person tracking map has no progress blob,
      // so merge from null (the honest base; the ⋯ sheet / detail flows own
      // richer progress).
      const progress = isGame
        ? (buildGameProgress(null, {
            sub_status: "played",
          }) as Tables<"user_media">["progress"])
        : undefined;
      trackMutation.mutate(
        {
          mediaId: id,
          status: "completed",
          ...(progress !== undefined ? { progress } : {}),
        },
        { onSuccess: () => onMutated?.(), onError: report },
      );
    } catch (err) {
      report(err);
    }
  }

  /** The Loved heart → flip favorite (lazy-create/flip path — no byId). */
  async function handleFavorite() {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      favoriteMutation.mutate(
        { mediaId: id },
        { onSuccess: () => onMutated?.(), onError: report },
      );
    } catch (err) {
      report(err);
    }
  }

  /** The list action (Watchlist / TBR / Wishlist) → track "want". */
  async function handleList() {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      trackMutation.mutate(
        { mediaId: id, status: "want" },
        { onSuccess: () => onMutated?.(), onError: report },
      );
    } catch (err) {
      report(err);
    }
  }

  /** A ⋯ status-toggle row (movie/tv/book) → track its status inline. */
  async function handleStatusAction(action: StatusAction) {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      if (action.kind === "toggle") {
        trackMutation.mutate(
          { mediaId: id, status: action.status },
          { onSuccess: () => onMutated?.(), onError: report },
        );
      } else {
        // Sheet-opener actions (TV "Watching", book "Reading"/"Read") open
        // flows that live on the detail screen — route there.
        router.push(`/media/${id}`);
        sheetRef.current?.dismiss();
      }
    } catch (err) {
      report(err);
    }
  }

  /** A ⋯ game status row → track the mapped status + progress.sub_status. */
  async function handleGameStatus(opt: GameStatusOption) {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      const progress = buildGameProgress(null, {
        sub_status: opt.key,
      }) as Tables<"user_media">["progress"];
      trackMutation.mutate(
        { mediaId: id, status: opt.tracking, progress },
        { onSuccess: () => onMutated?.(), onError: report },
      );
    } catch (err) {
      report(err);
    }
  }

  /** A ⋯ log/review row → navigate to detail (the sheets live there). */
  async function handleLog() {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      router.push(`/media/${id}`);
      sheetRef.current?.dismiss();
    } catch (err) {
      report(err);
    }
  }

  /** The ⋯ interactive star rating → rate inline (lazy-create/flip path). */
  async function handleRate(next: number | null) {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      rateMutation.mutate(
        { mediaId: id, rating: starsToRating(next) },
        { onSuccess: () => onMutated?.(), onError: report },
      );
    } catch (err) {
      report(err);
    }
  }

  /** The ⋯ View details row → navigate to detail. */
  async function handleViewDetails() {
    setErrorMessage(null);
    try {
      const id = await ensureId();
      router.push(`/media/${id}`);
      sheetRef.current?.dismiss();
    } catch (err) {
      report(err);
    }
  }

  const expandedWidth = compact
    ? TAB_EXPANDED_WIDTH_COMPACT
    : TAB_EXPANDED_WIDTH;
  const tabWidth = open ? expandedWidth : TAB_COLLAPSED_WIDTH;

  return (
    // Bottom-left of the poster. The card's poster wrapper is
    // `overflow-hidden`; this sits inside it via absolute positioning.
    <View className="absolute bottom-0 left-0" pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide quick actions" : "Show quick actions"}
        accessibilityState={{ expanded: open }}
        // Toggling the tab is the whole gesture; the inner action Pressables
        // stop this from firing when they're the target.
        onPress={toggleOpen}
      >
        <View
          style={{ width: tabWidth, height: TAB_HEIGHT }}
          className="flex-row items-center overflow-hidden"
        >
          <NotchBackground width={tabWidth} />

          {/* The glyph square — always visible; the type-colored tab. */}
          <View
            style={{ width: TAB_COLLAPSED_WIDTH, height: TAB_HEIGHT }}
            className="items-center justify-center"
          >
            {busy ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <TabGlyph size={14} color={accent} />
            )}
          </View>

          {/* The slide-out row — status · Loved · ⋯. Only mounted when open
              so its Pressables can't be tapped through the collapsed glyph. */}
          {open ? (
            <View className="flex-1 flex-row items-center justify-around pr-1.5">
              <IconAction
                icon={isGame ? Swords : config.statusActions[0]?.icon ?? Eye}
                active={isCompleted}
                accent={colors["accent-book"]}
                accessibilityLabel={
                  isGame ? "Mark as played" : "Mark as watched"
                }
                disabled={busy}
                onPress={handleStatus}
              />
              <IconAction
                icon={Heart}
                active={isFavorite}
                accent={colors["accent-movie"]}
                fillWhenActive
                accessibilityLabel={
                  isFavorite ? "Remove from Loved" : "Mark as Loved"
                }
                disabled={busy}
                onPress={handleFavorite}
              />
              <IconAction
                icon={MoreHorizontal}
                active={false}
                accent={colors["text-secondary"]}
                accessibilityLabel="More actions"
                disabled={busy}
                onPress={() => {
                  setErrorMessage(null);
                  sheetRef.current?.present();
                }}
              />
            </View>
          ) : null}
        </View>
      </Pressable>

      {/* The per-type ⋯ menu — an AppSheet bottom sheet (mounted here as a
          BottomSheetModal portal sibling; opened via its ref). */}
      <AppSheet ref={sheetRef} accessibilityLabel={`Actions for ${media.title}`}>
        <View className="gap-1">
          {/* Header — the title. */}
          <View className="pb-2">
            <Text
              className="text-lg font-bold text-text-primary"
              numberOfLines={2}
            >
              {media.title}
            </Text>
          </View>

          {/* Status options — per type. */}
          {isGame
            ? GAME_STATUSES.map((opt) => (
                <SheetRow
                  key={opt.key}
                  icon={opt.icon}
                  label={opt.label}
                  active={gameStatusActive(opt)}
                  accent={colors[opt.accent]}
                  disabled={busy}
                  onPress={() => handleGameStatus(opt)}
                />
              ))
            : config.statusActions.map((action) => (
                <SheetRow
                  key={action.label}
                  icon={action.icon}
                  label={action.label}
                  active={
                    status != null &&
                    (action.activeWhen as string[]).includes(status)
                  }
                  accent={colors[action.activeAccent]}
                  disabled={busy}
                  onPress={() => handleStatusAction(action)}
                />
              ))}

          {/* List row (Watchlist / Add to TBR / Wishlist → want). */}
          <SheetRow
            icon={Bookmark}
            label={config.listLabel}
            active={isWant}
            accent={colors["brand-light"]}
            disabled={busy}
            onPress={handleList}
          />

          {/* Log / review rows → detail screen (their sheets live there). */}
          {config.logButtons.map((btn) => (
            <SheetRow
              key={btn.label}
              icon={btn.icon}
              label={btn.label}
              disabled={busy}
              onPress={handleLog}
            />
          ))}

          {/* Divider + interactive star rating. */}
          <View className="my-1 h-px bg-surface-border" />
          <View className="flex-row items-center justify-center px-3 py-2">
            <StarRating value={stars} onChange={handleRate} size={20} starsOnly />
          </View>

          {/* Divider + View details. */}
          <View className="my-1 h-px bg-surface-border" />
          <SheetRow
            icon={ExternalLink}
            label="View details"
            disabled={busy}
            onPress={handleViewDetails}
          />

          {/* Inline, mapped error (never the raw Supabase error). */}
          {errorMessage ? (
            <View className="mt-1 rounded-sm border border-surface-border bg-surface-overlay px-3 py-2.5">
              <Text className="text-sm text-accent-movie">{errorMessage}</Text>
            </View>
          ) : null}
        </View>
      </AppSheet>
    </View>
  );
}
