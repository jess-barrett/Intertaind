/**
 * Media detail — catalog info (M1).
 *
 * SHARED route inside the tab navigator: this file lives in the
 * array-group folder `(tabs)/(index,explore)/media/[id].tsx`, so it is
 * extrapolated into BOTH per-tab Stacks (`(index)` and `(explore)`).
 * `router.push("/media/<id>")` therefore pushes it onto the CURRENT
 * tab's Stack — beneath the custom bottom navbar (rendered by
 * `(tabs)/_layout.tsx`), which stays visible on detail. Native/gesture
 * back returns within the tab's stack; detail→detail pushes a fresh
 * instance. The per-tab Stack (`(index,explore)/_layout.tsx`) hides
 * headers by default, and this screen keeps it that way: instead of a
 * native header it renders its OWN scroll-fading top bar
 * (`DetailHeaderBar`) so the backdrop hero reads full-bleed to the very
 * top of the screen (Letterboxd-style). At rest only a translucent back
 * pill shows over the backdrop; as the hero scrolls up, a solid
 * background + the title fade in. The pending/error states render a
 * `FloatingBackButton` for the same back affordance.
 *
 * Route gating: under this shared structure the detail URL resolves
 * under `(tabs)` (`segments[0] === "(tabs)"`), so `RootNavigator`'s
 * `inAuthGroup` is false and a signed-in `present` user is NOT
 * redirected off detail. `RootNavigator` only redirects signed-in users
 * away from `(auth)` routes, so this route renders freely for them.
 * Signed-OUT users are redirected to login (`!session && !inAuthGroup`),
 * which makes this screen signed-in-only for now — acceptable while the
 * only entry points are inside the tabs.
 *
 * SCOPE: this screen renders the per-type catalog — hero, header/meta/
 * tagline/description, community stats row (M1) — plus the viewer's
 * config-driven action strip (M2, Task 2.3), mounted right after the
 * header block. The cast slider is Task 1.3 and the hybrid info tabs /
 * seasons are Task 1.4. The action strip's one-tap actions are wired to
 * the tracking mutations here; its sheet-opener actions (Log/Review/
 * Intertain/etc.) receive stub handlers until Tasks 2.4–2.7 / M4 wire
 * their real bottom sheets.
 *
 * Visual language (Intertaind, mirroring the web app): a full-bleed
 * backdrop hero fades into the near-black `surface-default` via a
 * react-native-svg `LinearGradient` (the RN analogue of web's
 * `from-background to-transparent`), so content sits on solid bg. The
 * poster overlaps the hero fade (a mobile detail-screen convention),
 * the title block carries the media-type accent, and the community
 * counts read as a clean spaced row.
 *
 * Per-type header semantics MIRROR the web detail page
 * (apps/web/src/app/media/[id]/page.tsx) — same `metadata` field names,
 * same byline/secondary-line/tagline/stat composition. Web is the
 * source of truth; keep the two in lockstep.
 */
import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  Eye,
  Gamepad2,
  Heart,
  List,
  TvMinimalPlay,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "@intertaind/design-system";
import { MEDIA_TYPE_CONFIG, type MediaType } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";
import { AboutTheAuthor } from "@/components/media/about-the-author";
import { ActionStrip } from "@/components/media/action-strip";
import { ExpandableText } from "@/components/media/expandable-text";
import { InfoSections } from "@/components/media/info-sections";
import { RatingsHistogram } from "@/components/media/ratings-histogram";
import { RecommendationsSection } from "@/components/media/recommendations-section";
import { SeasonCards } from "@/components/media/season-cards";
import BookLogSheet from "@/components/media/sheets/book-log-sheet";
import BookReadingSheet from "@/components/media/sheets/book-reading-sheet";
import GameLogSheet from "@/components/media/sheets/game-log-sheet";
import GameStatusSheet from "@/components/media/sheets/game-status-sheet";
import MovieLogSheet from "@/components/media/sheets/movie-log-sheet";
import RecommendSheet from "@/components/media/sheets/recommend-sheet";
import TvLogEpisodeSheet from "@/components/media/sheets/tv-log-episode-sheet";
import TvLogSeasonSheet from "@/components/media/sheets/tv-log-season-sheet";
import TvWatchingSheet from "@/components/media/sheets/tv-watching-sheet";
import type { AppSheetRef } from "@/components/sheet/app-sheet";
import { MEDIA_TYPE_ICONS } from "@/lib/media-type-icons";
import { useBottomInset } from "@/lib/use-bottom-inset";
import {
  useMediaDetail,
  useViewerTracking,
  type MediaDetailItem,
} from "@/queries/media";

/** Hero height in pt — the backdrop + its gradient fade. */
const HERO_HEIGHT = 288;

/** Height (pt) of the nav-bar content row beneath the status bar — the
 *  back button + fading title sit here (added to the top safe-area inset). */
const NAV_BAR_HEIGHT = 44;

/**
 * Per-media-type accent hex for the lucide type icon. Icons color via
 * the `color` PROP (react-native-svg), not a className, so we need the
 * raw token value — not the `text-accent-*` class MEDIA_TYPE_CONFIG
 * carries for the label. Keyed by the domain `MediaType` (the icon map
 * is too), so unknown DB enum values get no icon (see below).
 */
const MEDIA_TYPE_ICON_COLOR: Record<MediaType, string> = {
  book: colors["accent-book"],
  movie: colors["accent-movie"],
  tv_show: colors["accent-tv"],
  video_game: colors["accent-game"],
};

/**
 * Label + accent class + lucide icon for a media type. The DB enum is a
 * superset of the domain `MediaType` (it already contains `board_game`),
 * so fall back to the raw enum value with NO icon for types the config
 * doesn't know yet (the icon map is keyed by `MediaType`).
 */
function mediaTypeDisplay(mediaType: Tables<"media_items">["media_type"]): {
  label: string;
  color: string;
  icon: LucideIcon | null;
  iconColor: string;
} {
  if (mediaType in MEDIA_TYPE_CONFIG) {
    const key = mediaType as MediaType;
    const config = MEDIA_TYPE_CONFIG[key];
    return {
      label: config.label,
      color: config.color,
      icon: MEDIA_TYPE_ICONS[key],
      iconColor: MEDIA_TYPE_ICON_COLOR[key],
    };
  }
  return {
    label: mediaType,
    color: "text-text-muted",
    icon: null,
    iconColor: colors["text-muted"],
  };
}

/** First 4 digits of an ISO date string, mirroring web's yearFromDateString. */
function yearFrom(dateString: string | null): string | null {
  return dateString?.match(/^(\d{4})/)?.[1] ?? null;
}

/**
 * Per-type byline attribution — the RN mirror of web's `getAttribution`
 * (apps/web/src/app/media/[id]/page.tsx). Reads the SAME `metadata`
 * JSONB fields: `director` (movie), `creator` (tv_show), `authors[]`
 * (book), `developers[]` (video_game). Developers may be the legacy
 * `string[]` or the newer `{id,name}[]` shape — accept either, exactly
 * as web does. Returns null when the source field is absent so the line
 * simply doesn't render.
 */
function attributionFor(
  mediaType: Tables<"media_items">["media_type"],
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  switch (mediaType) {
    case "movie": {
      const director = metadata.director as string | undefined;
      return director ? `Directed by ${director}` : null;
    }
    case "tv_show": {
      const creator = metadata.creator as string | undefined;
      return creator ? `Created by ${creator}` : null;
    }
    case "book": {
      const authors = metadata.authors as string[] | undefined;
      return authors?.length ? `by ${authors.join(", ")}` : null;
    }
    case "video_game": {
      const raw = metadata.developers as
        (string | { id?: number; name: string })[] | undefined;
      const names = raw?.map((d) => (typeof d === "string" ? d : d.name)) ?? [];
      return names.length ? `Developed by ${names.join(", ")}` : null;
    }
    default:
      return null;
  }
}

/**
 * Per-type secondary meta parts — the RN mirror of web's
 * `getSecondaryDetails`. Reads the SAME `metadata` fields and applies
 * the same rules:
 *   - movie: `runtime` min · genres
 *   - book: `page_count` pages · Book {seriesPosition} · `publisher`
 *   - tv_show: `seasons` seasons · genres
 *   - video_game: genres are shown elsewhere on web (tabs) — but the
 *     info tabs are Task 1.4 and not built here, so games show genres
 *     inline in M1 rather than silently dropping them until 1.4.
 * Joined with " · " by the caller.
 */
function secondaryMetaFor(
  mediaType: Tables<"media_items">["media_type"],
  metadata: Record<string, unknown> | null,
  seriesPosition: number | null,
): string[] {
  if (!metadata) return [];
  const parts: string[] = [];
  if (mediaType === "movie" && metadata.runtime)
    parts.push(`${metadata.runtime} min`);
  if (mediaType === "book" && metadata.page_count)
    parts.push(`${metadata.page_count} pages`);
  if (mediaType === "book" && seriesPosition != null)
    parts.push(`Book ${seriesPosition}`);
  if (mediaType === "book" && metadata.publisher)
    parts.push(String(metadata.publisher));
  if (mediaType === "tv_show" && metadata.seasons)
    parts.push(`${metadata.seasons} seasons`);
  const genres = metadata.genres as string[] | undefined;
  if (genres?.length) parts.push(genres.join(", "));
  return parts;
}

/**
 * Per-type community stat descriptors — mirrors web's genre-specific
 * stats row (page.tsx ~469-494). Each entry pairs a lucide icon with a
 * denormalized `media_items` count column and its label:
 *   - movie:      Watched · In lists · Loved
 *   - tv_show:    Watched · Currently watching · In lists · Loved
 *   - book:       Read · Currently reading · In lists · Loved
 *   - video_game: Played · In lists · Loved
 *
 * The counts come from the denormalized columns on `media_items`
 * (`completed_count` / `in_progress_count` / `lists_count` /
 * `favorites_count`) — the mobile convention (apps/mobile/AGENTS.md) is
 * to read these columns rather than run per-screen aggregate queries the
 * way web's server component does. `completed_count` is `status =
 * 'completed'` for every type (migration 018), which the web page labels
 * Watched / Read / Played per type; for games web additionally counts
 * non-`want` rows via a live query — a pre-existing denorm divergence we
 * accept here, using the completed column consistently.
 */
type StatDescriptor = { icon: LucideIcon; count: number; label: string };

function communityStatsFor(item: MediaDetailItem): StatDescriptor[] {
  // These denormalized counts are all non-null on media_items (migrations
  // 002/003/018 default them to 0), so read them raw.
  const completed = item.completed_count;
  const inProgress = item.in_progress_count;
  const lists = item.lists_count;
  const loved = item.favorites_count;

  const listsStat: StatDescriptor = {
    icon: List,
    count: lists,
    label: "In lists",
  };
  const lovedStat: StatDescriptor = {
    icon: Heart,
    count: loved,
    label: "Loved",
  };

  switch (item.media_type) {
    case "movie":
      return [
        { icon: Eye, count: completed, label: "Watched" },
        listsStat,
        lovedStat,
      ];
    case "tv_show":
      return [
        { icon: Eye, count: completed, label: "Watched" },
        { icon: TvMinimalPlay, count: inProgress, label: "Currently watching" },
        listsStat,
        lovedStat,
      ];
    case "book":
      return [
        { icon: BookOpenCheck, count: completed, label: "Read" },
        { icon: BookOpen, count: inProgress, label: "Currently reading" },
        listsStat,
        lovedStat,
      ];
    case "video_game":
      return [
        { icon: Gamepad2, count: completed, label: "Played" },
        listsStat,
        lovedStat,
      ];
    default:
      // Unknown enum (e.g. board_game): fall back to the type-agnostic
      // trio so the row still renders something meaningful.
      return [
        { icon: Eye, count: completed, label: "Completed" },
        listsStat,
        lovedStat,
      ];
  }
}

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMediaDetail(id);

  return (
    // The per-tab Stack hides headers by default (see the layout), so this
    // screen has NO native header — the backdrop hero reads full-bleed to the
    // very top of the screen (Letterboxd-style), and a custom, scroll-fading
    // top bar (rendered inside the body) provides the back affordance + title.
    <View className="flex-1 bg-surface-default">
      {detail.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-text-primary">
            Couldn&apos;t load this title.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading this title"
            className="rounded-sm bg-brand px-4 py-3 active:opacity-70"
            onPress={() => detail.refetch()}
          >
            <Text className="font-semibold text-text-primary">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <MediaDetailBody item={detail.data} />
      )}

      {/* Back affordance for the pending / error states (the data state
          renders its own scroll-fading bar). Absolute so it floats over the
          centered content. */}
      {detail.isPending || detail.error ? <FloatingBackButton /> : null}
    </View>
  );
}

/**
 * A translucent circular back button — legible over both a bright backdrop
 * (the data state, before the header bg fades in) and the solid page bg (the
 * pending/error states). Self-contained: reads the router directly.
 */
function BackPill() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onPress={() => router.back()}
    >
      <ArrowLeft size={22} color={colors["text-primary"]} />
    </Pressable>
  );
}

/** The back pill positioned at the top-left, honoring the safe-area inset.
 *  Used by the non-scrolling (pending / error) states. */
function FloatingBackButton() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 6, left: 12 }}
    >
      <BackPill />
    </View>
  );
}

/**
 * The scroll-fading top bar over the backdrop hero — the RN analogue of
 * Letterboxd's detail header. At rest (hero in view) only the translucent
 * back pill shows over the full-bleed backdrop; as the hero scrolls up behind
 * the bar, a solid `surface-default` background + the title FADE IN together
 * (driven by `scrollY`, native-driver opacity). The back pill stays visible
 * throughout. `pointerEvents="box-none"` lets scroll gestures pass through the
 * bar's empty area to the list beneath.
 */
function DetailHeaderBar({
  title,
  scrollY,
}: {
  title: string;
  scrollY: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const barHeight = insets.top + NAV_BAR_HEIGHT;
  // Fade the bg + title in as the hero's lower edge passes behind the bar.
  const fadeStart = HERO_HEIGHT - barHeight - 80;
  const fadeEnd = HERO_HEIGHT - barHeight - 8;
  const headerOpacity = scrollY.interpolate({
    inputRange: [fadeStart, fadeEnd],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: barHeight,
        paddingTop: insets.top,
      }}
    >
      {/* Fading solid background + hairline bottom border. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]}
        className="border-b border-surface-border bg-surface-default"
      />

      {/* Nav row: back pill (always visible) + fading title. */}
      <View
        style={{ height: NAV_BAR_HEIGHT }}
        className="flex-row items-center gap-2 px-3"
      >
        <BackPill />
        <Animated.Text
          numberOfLines={1}
          style={{ opacity: headerOpacity }}
          className="flex-1 text-base font-semibold text-text-primary"
        >
          {title}
        </Animated.Text>
      </View>
    </View>
  );
}

/**
 * The hero backdrop + its bottom-fading gradient. The gradient is a
 * react-native-svg `LinearGradient` (NativeWind can't express a
 * multi-stop gradient), fading from transparent at the top to opaque
 * `surface-default` across the lower ~60% — the RN analogue of web's
 * `bg-gradient-to-t from-background to-transparent`, so the content
 * below lands on solid page background.
 */
function BackdropHero({ backdropUrl }: { backdropUrl: string | null }) {
  return (
    <View style={{ height: HERO_HEIGHT }} className="w-full">
      {backdropUrl ? (
        <Image
          source={{ uri: backdropUrl }}
          className="h-full w-full"
          contentFit="cover"
          accessible={false}
        />
      ) : (
        // No backdrop — a solid raised block of the same height keeps
        // the poster overlap consistent.
        <View className="h-full w-full bg-surface-raised" />
      )}

      {/* Bottom-to-transparent fade to solid page bg. Decorative. */}
      <View className="absolute inset-0" pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0.35"
                stopColor={colors["surface-default"]}
                stopOpacity={0}
              />
              <Stop
                offset="1"
                stopColor={colors["surface-default"]}
                stopOpacity={1}
              />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
        </Svg>
      </View>
    </View>
  );
}

function MediaDetailBody({ item }: { item: MediaDetailItem }) {
  const type = mediaTypeDisplay(item.media_type);
  const year = yearFrom(item.release_date);
  const metadata = item.metadata as Record<string, unknown> | null;
  const attribution = attributionFor(item.media_type, metadata);
  const secondaryMeta = secondaryMetaFor(
    item.media_type,
    metadata,
    item.series_position,
  );
  // Tagline is TMDb-sourced and only meaningful for movies + TV shows
  // (web gates it on media_type implicitly by only enriching those).
  const rawTagline = metadata?.tagline;
  const tagline =
    (item.media_type === "movie" || item.media_type === "tv_show") &&
    typeof rawTagline === "string" &&
    rawTagline.trim().length > 0
      ? rawTagline.trim()
      : null;
  const stats = communityStatsFor(item);
  // The viewer's own tracking row seeds the action strip's current state
  // (active status / Loved / rating). Null while untracked; `isPending`
  // freezes the strip to a skeleton so a tracked item never flashes
  // untracked controls.
  const tracking = useViewerTracking(item.id);
  // Reserve space so content clears the persistent bottom navbar (added
  // on top of the 48pt content breathing room at the end of the scroll).
  const bottomInset = useBottomInset();
  // Drives the Letterboxd-style top bar: as the hero scrolls up, the bar's
  // background + title fade in (see DetailHeaderBar). Native-driver opacity,
  // so it stays smooth. Lazy useState so the Animated.Value is created ONCE
  // and never re-instantiated across renders (a ref's `.current` can't be
  // read during render under the react-hooks lint).
  const [scrollY] = useState(() => new Animated.Value(0));
  // The movie log/review sheet (Task 2.4). Only meaningful for movies —
  // the strip's movie "Review or log…" opener presents it; the sheet
  // self-gates its render to movies below.
  const movieLogRef = useRef<AppSheetRef>(null);
  const isMovie = item.media_type === "movie";
  // The game status picker sheet (Task 2.7) — only for video games; the
  // strip's game status pill presents it via onOpenStatusPicker.
  const gameStatusRef = useRef<AppSheetRef>(null);
  const isGame = item.media_type === "video_game";
  // The game log/review sheet — only for video games; the strip's game
  // "Log game…" opener presents it via onOpenLog (routed by type below).
  const gameLogRef = useRef<AppSheetRef>(null);
  // The book sheets (Task 2.5) — only for books. The "Currently Reading"
  // sheet (current/total pages) is presented via onOpenReading; the
  // "Read"/"Review" sheet (finished/DNF + rating/review/loved) via
  // onOpenReadFinished AND (routed by type) onOpenLog.
  const bookReadingRef = useRef<AppSheetRef>(null);
  const bookLogRef = useRef<AppSheetRef>(null);
  const isBook = item.media_type === "book";
  // The TV sheets (Task 2.6) — only for TV shows. "Watching" (current
  // season/episode pointer) via onOpenWatching; "Log Season" (per-season
  // rating/review/completed) via onOpenLogSeason; "Log Episode"
  // (per-episode rating/review + pointer advance) via onOpenLogEpisode.
  const tvWatchingRef = useRef<AppSheetRef>(null);
  const tvLogSeasonRef = useRef<AppSheetRef>(null);
  const tvLogEpisodeRef = useRef<AppSheetRef>(null);
  const isTv = item.media_type === "tv_show";
  // The Intertain recommend sheet (M4) — mounted for ALL media types (the
  // cross-media recommend feature applies to everything); the strip's
  // "Intertain friends" CTA presents it via onIntertain.
  const recommendRef = useRef<AppSheetRef>(null);

  return (
    <>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 + bottomInset }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {/* Full-bleed backdrop hero with its bottom fade. */}
        <BackdropHero backdropUrl={item.backdrop_url} />

        {/* Poster + title block + stats, pulled up to straddle the hero
          fade (the mobile detail-screen overlap pattern). `items-end`
          bottom-aligns all three columns; if the stats stack is ever taller
          than the poster (4-stat types) the row grows UPWARD into the hero,
          keeping poster + title anchored at the bottom. */}
        <View className="-mt-24 flex-row items-end gap-4 px-4">
          {item.cover_image_url ? (
            <Image
              source={{ uri: item.cover_image_url }}
              // 112pt-wide 2:3 cover, sharp corners + hairline border to
              // match web's poster treatment; shadow lifts it off the bg.
              className="aspect-[2/3] w-28 rounded-sm border border-surface-border bg-surface-overlay"
              contentFit="cover"
              accessible
              accessibilityLabel={`${item.title} cover`}
              // iOS drop shadow to lift the poster off the faded hero.
              // (expo-image's ImageStyle omits Android `elevation`; the
              // hairline border carries the separation on Android.)
              style={{
                shadowColor: colors["surface-default"],
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
              }}
            />
          ) : (
            <View className="aspect-[2/3] w-28 items-center justify-center rounded-sm border border-surface-border bg-surface-overlay">
              <Text className="text-xs text-text-muted">No cover</Text>
            </View>
          )}

          {/* Title block — bottom-aligned so it sits on the poster's lower
            half where the hero has fully faded. Ordered top-to-bottom to
            mirror web: accent type line, title + year, byline. */}
          <View className="flex-1 justify-end gap-1 pb-1">
            {/* Media-type line: lucide type icon (accent-colored via the
              `color` prop — SVG, not className) + accent label. */}
            <View className="flex-row items-center gap-1.5">
              {type.icon ? (
                <type.icon size={14} color={type.iconColor} />
              ) : null}
              <Text
                className={`text-xs font-semibold uppercase tracking-wider ${type.color}`}
              >
                {type.label}
              </Text>
            </View>

            {/* Title + year — year is the muted trailing companion, web's
              `<h1> {year}` baseline pairing. */}
            <Text className="text-2xl font-bold text-text-primary">
              {item.title}
              {year ? (
                <Text className="text-lg font-normal text-text-muted">
                  {"  "}
                  {year}
                </Text>
              ) : null}
            </Text>

            {/* Byline — Directed by / Created by / by / Developed by. */}
            {attribution ? (
              <Text className="text-sm text-text-secondary">{attribution}</Text>
            ) : null}
          </View>

          {/* Community stats — stacked vertically in the header's right
            column (Jess's layout call), bottom-aligned with the title block
            via the row's `items-end`. Each block is icon + count over
            label; the title block (flex-1) keeps priority on width. */}
          <View className="gap-3 pb-1">
            {stats.map((stat) => (
              <StatBlock
                key={stat.label}
                icon={stat.icon}
                count={stat.count}
                label={stat.label}
              />
            ))}
          </View>
        </View>

        <View className="gap-5 px-4 pt-5">
          {/* Secondary meta line — runtime/pages/seasons/genres per type. */}
          {secondaryMeta.length > 0 ? (
            <Text className="text-xs text-text-muted">
              {secondaryMeta.join(" · ")}
            </Text>
          ) : null}

          {/* Tagline (movie / TV only) — uppercase muted, matching web's
            Letterboxd treatment. */}
          {tagline ? (
            <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {tagline}
            </Text>
          ) : null}

          {/* Description — clamped to 4 lines; tapping the text toggles the
            full synopsis (a "Show more"/"Show less" cue shows only when it
            actually overflows). */}
          {item.description ? (
            <ExpandableText
              text={item.description}
              collapsedLines={4}
              className="text-sm leading-relaxed text-text-secondary"
            />
          ) : null}

          {/* Community ratings distribution — the histogram replaces the
            old single average line, sitting between the description and
            the action strip (Jess's layout call). Reads the denormalized
            `rating_distribution` / `rating_count` / `avg_rating` columns
            (migration 028) — no per-view aggregation. Renders a compact
            "No ratings yet" when the title is unrated. */}
          <RatingsHistogram
            buckets={item.rating_distribution ?? []}
            total={item.rating_count ?? 0}
            average={
              (item.rating_count ?? 0) > 0 && item.avg_rating != null
                ? Number(item.avg_rating)
                : null
            }
          />

          {/* Config-driven per-type action strip — the viewer's tracking
            controls (icon-only status · Loved · list, the log button with
            text, a divider, then inline stars), mounted BENEATH the
            description per Jess's layout call. One-tap actions wire to the
            tracking mutations; sheet openers call the stub handlers below
            (Tasks 2.4–2.7 / M4 swap the no-ops for real sheet refs). */}
          <ActionStrip
            media={item}
            viewerRow={tracking.data ?? null}
            trackingPending={tracking.isPending}
            handlers={{
              // Log/review sheet — presents the RIGHT sheet by type: movie
              // → movie-log, game → game-log, book → book-log (Read/Review).
              onOpenLog: () => {
                if (isMovie) movieLogRef.current?.present();
                else if (isGame) gameLogRef.current?.present();
                else if (isBook) bookLogRef.current?.present();
              },
              // TV sheets (Task 2.6): the "Watching" pill sets the
              // current-episode pointer; the two Log buttons open the
              // per-season / per-episode log sheets. (Only TV routes here.)
              onOpenLogSeason: () => tvLogSeasonRef.current?.present(),
              onOpenLogEpisode: () => tvLogEpisodeRef.current?.present(),
              onOpenWatching: () => tvWatchingRef.current?.present(),
              // Book "Reading" → current-reading sheet; "Read" → the
              // book-log sheet (finished/DNF + rating/review/loved).
              onOpenReading: () => bookReadingRef.current?.present(),
              onOpenReadFinished: () => bookLogRef.current?.present(),
              // Game status picker sheet (Task 2.7) — present the ref-driven
              // sheet mounted below. (Only games route here.)
              onOpenStatusPicker: () => gameStatusRef.current?.present(),
              // Intertain-friends recommend sheet (M4) — all media types.
              onIntertain: () => recommendRef.current?.present(),
              // TODO(M4): show-activity screen.
              onShowActivity: () => {},
              // TODO(M4): change cover (book) / backdrop (movie/TV/game) sheet.
              onChangeArt: () => {},
            }}
          />

          {/* About-the-author (book) — Task 1.3. Cast (movie/TV) is no
            longer a standalone slider here; it's the first/default tab of
            the info strip below (InfoSections). AboutTheAuthor self-gates
            by media type → null for non-books. */}
          <AboutTheAuthor mediaType={item.media_type} metadata={metadata} />

          {/* Hybrid info area (Task 1.4) — mirrors web's content-column flow
            (description → cast/about-author → info sections). TV seasons
            render INLINE as cards ABOVE the tab strip (a locked design
            decision — seasons are the headline structured content for a
            show and don't read well behind a tab); Crew/Details/Genres/
            Platforms/Releases/Alternative-titles sit behind the compact
            horizontal tab strip below. Both self-gate by media type +
            metadata presence and render null when empty, so they mount
            unconditionally and only relevant content shows. */}
          <SeasonCards mediaType={item.media_type} metadata={metadata} />
          <InfoSections mediaType={item.media_type} metadata={metadata} />

          {/* Cross-media recommendations ("intertains") — the community
            pairings for this title (both directions, behind a toggle).
            Self-gates: renders null when this media has no recs in either
            direction, so it mounts unconditionally in the content column
            after the info strip (the "no empty headings" grammar). */}
          <RecommendationsSection mediaId={item.id} />
        </View>
      </Animated.ScrollView>

      {/* Letterboxd-style top bar — back pill always visible; the solid bg +
          title fade in as the hero scrolls past. Sibling of the scroll view so
          it floats above the full-bleed backdrop. */}
      <DetailHeaderBar title={item.title} scrollY={scrollY} />

      {/* Movie log/review sheet (Task 2.4). Ref-driven overlay (a
          BottomSheetModal portal), so it mounts as a sibling of the
          scroll content, not inside it. Only for movies — the action
          strip only exposes this opener for movies, and the sheet's
          fields (watched-on / rewatch) are movie-specific. */}
      {isMovie ? (
        <MovieLogSheet
          ref={movieLogRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* Game status picker sheet (Task 2.7). Ref-driven overlay, mounted
          as a sibling of the scroll content. Only for games — the strip's
          game status pill is the only opener. */}
      {isGame ? (
        <GameStatusSheet
          ref={gameStatusRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* Game log/review sheet. Ref-driven overlay, mounted as a sibling of
          the scroll content. Only for games — the strip's "Log game…"
          opener presents it, and its fields (play status / hours) are
          game-specific. */}
      {isGame ? (
        <GameLogSheet
          ref={gameLogRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* Book "Currently Reading" sheet (Task 2.5). Ref-driven overlay,
          mounted as a sibling of the scroll content. Only for books — the
          strip's "Reading" opener presents it via onOpenReading. */}
      {isBook ? (
        <BookReadingSheet
          ref={bookReadingRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* Book "Read"/"Review" sheet (Task 2.5). Ref-driven overlay, mounted
          as a sibling of the scroll content. Only for books — the strip's
          "Read" opener (onOpenReadFinished) and its "Review…" log button
          (onOpenLog, routed by type) both present it. */}
      {isBook ? (
        <BookLogSheet
          ref={bookLogRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* TV tracking sheets (Task 2.6). Ref-driven overlays, mounted as
          siblings of the scroll content. Only for TV shows — the strip's
          "Watching" pill (onOpenWatching), "Log Season" (onOpenLogSeason),
          and "Log Episode" (onOpenLogEpisode) present them. */}
      {isTv ? (
        <TvWatchingSheet
          ref={tvWatchingRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {isTv ? (
        <TvLogSeasonSheet
          ref={tvLogSeasonRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {isTv ? (
        <TvLogEpisodeSheet
          ref={tvLogEpisodeRef}
          media={item}
          viewerRow={tracking.data ?? null}
        />
      ) : null}

      {/* Intertain recommend sheet (M4). Ref-driven overlay, mounted as a
          sibling of the scroll content. Mounted for ALL media types — the
          cross-media recommend feature applies to everything, so the action
          strip's "Intertain friends" CTA (onIntertain) always has a sheet. */}
      <RecommendSheet ref={recommendRef} media={item} />
    </>
  );
}

/**
 * One community stat — icon + count stacked ON TOP of the label, so the
 * set reads as a horizontal row of compact blocks under the cover/header.
 */
function StatBlock({
  icon: Icon,
  count,
  label,
}: {
  icon: LucideIcon;
  count: number;
  label: string;
}) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1.5">
        <Icon size={14} color={colors["text-secondary"]} />
        <Text className="text-base font-semibold text-text-primary">
          {count.toLocaleString()}
        </Text>
      </View>
      <Text className="text-xs text-text-muted">{label}</Text>
    </View>
  );
}
