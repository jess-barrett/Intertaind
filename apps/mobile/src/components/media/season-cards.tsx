/**
 * Inline season cards for the media detail screen (TV shows only) — the
 * RN mirror of web's `SeasonsPanel` / `SeasonCard`
 * (apps/web/src/components/media/media-info-tabs.tsx).
 *
 * HYBRID INFO AREA (locked design decision): on web, seasons are the
 * first tab in the info tab strip; on mobile the design puts TV seasons
 * INLINE as a vertical stack of cards ABOVE the info tab strip (they're
 * the headline structured content for a show and don't read well behind
 * a tab), leaving Crew/Details/Genres/Releases/Alternative-titles behind
 * the compact tab strip. So this component owns the "seasons" content and
 * the info-sections tab strip omits the seasons tab entirely.
 *
 * Metadata shape (verified against web media-info-tabs.tsx `SeasonDetail`):
 *   metadata.season_details: {
 *     season_number: number;
 *     name: string;
 *     episode_count: number;
 *     air_date: string | null;
 *     poster_path: string | null;   // raw TMDB path → tmdbImageUrl(...)
 *     overview: string | null;
 *   }[]
 * The poster URL is built with `tmdbImageUrl(poster_path, "w185")` — the
 * SAME construction web uses (@intertaind/media). A missing/nulled poster
 * falls back to a muted lucide `Tv` glyph, mirroring web's fallback.
 *
 * Each card: poster + "Season N" (or the season's `name`) + "M episodes ·
 * {air date}" + overview with a per-card show-more / show-less expand
 * toggle (local `useState`), matching web's truncate-at-word behaviour.
 *
 * Per-type gating + graceful empty: renders `null` for any non-TV type,
 * when `metadata` is absent, or when there are no seasons — so no
 * "Seasons" heading is ever shown over nothing (locked design grammar).
 *
 * Visual language mirrors web + the detail screen: dark + neon, sharp
 * corners, hairline `surface-border`, 2:3 poster art, `brand-light`
 * show-more affordance. Design tokens only — the fallback icon colors via
 * the `color` prop (react-native-svg) from the `colors` object, never a
 * raw hex.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { Tv } from "lucide-react-native";
import { tmdbImageUrl } from "@intertaind/media";
import { colors } from "@intertaind/design-system";
import type { Tables } from "@intertaind/supabase";

import { Image } from "@/components/image";

/**
 * One season as stored in `metadata.season_details`. Field names mirror
 * web's `SeasonDetail` interface exactly (media-info-tabs.tsx) — do not
 * rename. `air_date`, `poster_path`, and `overview` are nullable.
 */
interface SeasonDetail {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string | null;
}

/** Overview char budget before the show-more toggle appears (web parity). */
const SYNOPSIS_LIMIT = 175;

/** Poster width in pt — a compact 2:3 card, web's `w-20` analogue. */
const POSTER_WIDTH = 80;

/**
 * Trim to the last word boundary at or before `limit` so we don't slice
 * mid-word (mirrors web's `truncateAtWord`).
 */
function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

/** Format an ISO date to "Month D, YYYY", mirroring web's SeasonCard. */
function formatAirDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SeasonCards({
  mediaType,
  metadata,
}: {
  mediaType: Tables<"media_items">["media_type"];
  metadata: Record<string, unknown> | null;
}) {
  // Per-type gating — seasons only exist for TV shows (mirrors web, which
  // only reads `season_details` when mediaType === "tv_show").
  if (mediaType !== "tv_show") return null;
  if (!metadata) return null;

  // Untyped JSONB — guard against a non-array shape (malformed row / an
  // upstream metadata change) rather than trusting `season_details` blindly.
  const seasons = Array.isArray(metadata.season_details)
    ? (metadata.season_details as SeasonDetail[])
    : [];
  // Graceful empty: no seasons → render nothing, never an empty heading.
  if (seasons.length === 0) return null;

  return (
    <View className="gap-4">
      <SectionHeading>Seasons</SectionHeading>
      <View className="gap-3">
        {seasons.map((season, i) => (
          <SeasonCard
            key={`${season.season_number}-${i}`}
            season={season}
          />
        ))}
      </View>
    </View>
  );
}

function SeasonCard({ season }: { season: SeasonDetail }) {
  const [expanded, setExpanded] = useState(false);

  const posterUrl = tmdbImageUrl(season.poster_path, "w185");
  const title = season.name || `Season ${season.season_number}`;
  const overview = season.overview ?? "";
  const isLong = overview.length > SYNOPSIS_LIMIT;
  const shownOverview =
    expanded || !isLong
      ? overview
      : `${truncateAtWord(overview, SYNOPSIS_LIMIT)}...`;

  return (
    <View className="flex-row items-start gap-4 rounded-sm border border-surface-border bg-surface-raised p-3">
      <View
        style={{ width: POSTER_WIDTH }}
        className="aspect-[2/3] overflow-hidden rounded-sm border border-surface-border bg-surface-overlay"
      >
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            className="h-full w-full"
            contentFit="cover"
            accessible
            accessibilityLabel={title}
          />
        ) : (
          // No poster — a muted lucide Tv glyph on the raised card,
          // mirroring web's fallback.
          <View className="h-full w-full items-center justify-center">
            <Tv size={20} color={colors["text-muted"]} />
          </View>
        )}
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-text-primary">
          {title}
        </Text>
        <Text className="text-xs text-text-muted">
          {season.episode_count}{" "}
          {season.episode_count === 1 ? "episode" : "episodes"}
          {season.air_date ? ` · ${formatAirDate(season.air_date)}` : ""}
        </Text>
        {overview ? (
          <Text className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {shownOverview}
            {isLong ? (
              <Text
                className="text-xs font-medium text-brand-light"
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={
                  expanded
                    ? `Show less of the ${title} overview`
                    : `Show more of the ${title} overview`
                }
              >
                {" "}
                {expanded ? "show less" : "show more"}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Section heading styled like web's `SectionHeader` and the cast slider /
 * about-the-author headings — a semibold primary-text section lead-in.
 */
function SectionHeading({ children }: { children: string }) {
  return (
    <Text className="text-lg font-semibold text-text-primary">{children}</Text>
  );
}
