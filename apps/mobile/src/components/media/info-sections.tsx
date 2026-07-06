/**
 * Info tab strip for the media detail screen — the RN mirror of web's
 * `MediaInfoTabs` (apps/web/src/components/media/media-info-tabs.tsx).
 *
 * HYBRID INFO AREA (locked design decision): web puts everything —
 * including TV seasons — behind one tab strip. On mobile, TV seasons
 * render INLINE as cards ABOVE this strip (see `season-cards.tsx`), so
 * this component deliberately OMITS the "seasons" tab that web carries.
 * Everything else mirrors web: a compact horizontal, scrollable tab strip
 * with tabs Crew · Details · Genres · Platforms (games) · Releases ·
 * Alternative titles. The selected tab carries the accent (`brand`)
 * underline (web parity). Each tab appears ONLY if `metadata` has that
 * data (per-tab presence conditions mirror web exactly).
 *
 * Metadata field names + per-tab presence conditions (verified against
 * web media-info-tabs.tsx — do NOT rename):
 *   Crew    (crew.length > 0)                 metadata.key_crew: { job; names[] }[]
 *   Details (hasDetails)                       networks / production_companies /
 *                                              production_countries / spoken_languages
 *                                              / developers / publishers
 *   Genres  (genres.length || themes.length)  metadata.genres[] + metadata.keywords[]
 *   Platforms (games; platforms.length)        metadata.platforms[]
 *   Releases (hasReleases)                     metadata.release_dates: Record<string,string>
 *   Alt titles (altTitles.length)              metadata.alternative_titles: { country; title }[]
 *
 * Details linkable-entity fields (networks/studios/developers/publishers)
 * link to `/entity/...` screens on web. Those routes DON'T exist on mobile
 * yet, so they render as PLAIN TEXT here (see TODO(M4) on `EntityRow`).
 *
 * Robustness: metadata is untyped JSONB — every field is null-guarded and
 * every array is `Array.isArray`-guarded before mapping (established
 * convention, cast-slider.tsx). Tabs with no data are dropped; if a media
 * type has NO tabs with data, the whole strip renders `null` (never an
 * empty tab strip). Selected-tab state is local `useState`.
 *
 * Visual language mirrors web + the detail screen: dark + neon, sharp
 * corners, hairline `surface-border`, `brand` accent underline, chips
 * styled like web. Design tokens only (no raw hex).
 */
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Tables } from "@intertaind/supabase";

import { asArray } from "@/lib/metadata";

type MediaType = Tables<"media_items">["media_type"];

// ---------------------------------------------------------------------------
// Metadata shapes (field names mirror web's interfaces exactly).
// ---------------------------------------------------------------------------

interface CrewRow {
  job: string;
  names: string[];
}

/** TMDB company/network entity — carries an id used by web's entity links. */
interface Company {
  id: number;
  name: string;
  logo_path: string | null;
}

/** IGDB studio shape: legacy rows store `string[]`, so accept both (web parity). */
type GameStudio = string | { id: number; name: string };

interface Country {
  code: string;
  name: string;
}

interface AltTitle {
  country: string;
  title: string;
}

/**
 * Release-date kinds, in web's display order (premiere → theatrical →
 * digital → physical → tv). Keep this in lockstep with web's RELEASE_ORDER.
 */
const RELEASE_ORDER = [
  "premiere",
  "theatrical_limited",
  "theatrical",
  "digital",
  "physical",
  "tv",
] as const;

const RELEASE_LABELS: Record<(typeof RELEASE_ORDER)[number], string> = {
  premiere: "Premiere",
  theatrical_limited: "Limited theatrical",
  theatrical: "Theatrical",
  digital: "Digital",
  physical: "Physical",
  tv: "TV",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeStudio(s: GameStudio): { id?: number; name: string } {
  return typeof s === "string" ? { name: s } : s;
}

type TabKey =
  | "crew"
  | "details"
  | "genres"
  | "platforms"
  | "releases"
  | "alt_titles";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InfoSections({
  mediaType,
  metadata,
}: {
  mediaType: MediaType;
  metadata: Record<string, unknown> | null;
}) {
  // Read every field defensively (null-guard container, array-guard each
  // list). Field names + game-only gating mirror web exactly.
  const crew = asArray<CrewRow>(metadata?.key_crew);
  const genres = asArray<string>(metadata?.genres);
  const themes = asArray<string>(metadata?.keywords);
  const networks = asArray<Company>(metadata?.networks);
  const studios = asArray<Company>(metadata?.production_companies);
  const countries = asArray<Country>(metadata?.production_countries);
  const languages = asArray<string>(metadata?.spoken_languages);
  const altTitles = asArray<AltTitle>(metadata?.alternative_titles);
  const platforms =
    mediaType === "video_game" ? asArray<string>(metadata?.platforms) : [];
  const gameDevelopers =
    mediaType === "video_game" ? asArray<GameStudio>(metadata?.developers) : [];
  const gamePublishers =
    mediaType === "video_game" ? asArray<GameStudio>(metadata?.publishers) : [];

  // release_dates is an object map (not an array), so guard it as an object.
  const releases =
    metadata && typeof metadata.release_dates === "object" &&
    metadata.release_dates !== null &&
    !Array.isArray(metadata.release_dates)
      ? (metadata.release_dates as Record<string, string>)
      : null;

  const hasDetails =
    networks.length > 0 ||
    studios.length > 0 ||
    countries.length > 0 ||
    languages.length > 0 ||
    gameDevelopers.length > 0 ||
    gamePublishers.length > 0;
  const hasReleases =
    !!releases && Object.keys(releases).some((k) => releases[k]);

  // Config-driven tab list, skipping any tab with no data — no point
  // rendering an empty tab (mirrors web). NOTE: no "seasons" tab — TV
  // seasons render inline above the strip (see season-cards.tsx).
  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "crew", label: "Crew", show: crew.length > 0 },
    { key: "details", label: "Details", show: hasDetails },
    {
      key: "genres",
      label: "Genres",
      show: genres.length > 0 || themes.length > 0,
    },
    { key: "platforms", label: "Platforms", show: platforms.length > 0 },
    { key: "releases", label: "Releases", show: hasReleases },
    {
      key: "alt_titles",
      label: "Alternative titles",
      show: altTitles.length > 0,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const [active, setActive] = useState<TabKey | null>(
    visibleTabs[0]?.key ?? null
  );

  // No tab has data → render nothing (never an empty tab strip).
  if (visibleTabs.length === 0) return null;

  // Guard against a stale `active` if the visible set ever changes (e.g. a
  // metadata refetch drops the selected tab): fall back to the first tab.
  const activeKey = visibleTabs.some((t) => t.key === active)
    ? active
    : visibleTabs[0].key;

  return (
    <View className="gap-4">
      {/* Horizontal, scrollable tab strip with a hairline base rule. The
          selected tab carries the accent (brand) underline (web parity). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        className="border-b border-surface-border"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={() => setActive(tab.key)}
              className="px-3 pb-2 pt-1 active:opacity-70"
            >
              <Text
                className={`text-sm font-medium ${
                  isActive ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {tab.label}
              </Text>
              {/* Accent underline under the selected tab (web's brand rule). */}
              {isActive ? (
                <View className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {activeKey === "crew" ? <CrewPanel crew={crew} /> : null}
      {activeKey === "details" ? (
        <DetailsPanel
          mediaType={mediaType}
          networks={networks}
          studios={studios}
          countries={countries}
          languages={languages}
          gameDevelopers={gameDevelopers}
          gamePublishers={gamePublishers}
        />
      ) : null}
      {activeKey === "genres" ? (
        <GenresPanel genres={genres} themes={themes} />
      ) : null}
      {activeKey === "platforms" ? (
        <PlatformsPanel platforms={platforms} />
      ) : null}
      {activeKey === "releases" && releases ? (
        <ReleasesPanel releases={releases} />
      ) : null}
      {activeKey === "alt_titles" ? (
        <AltTitlesPanel titles={altTitles} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared rows / chips
// ---------------------------------------------------------------------------

/** A label-over-value detail row (web's `Row`, a <dt>/<dd> pair). */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </Text>
      <Text className="text-sm text-text-secondary">{value}</Text>
    </View>
  );
}

/**
 * A detail row whose value is a comma-separated list of entities.
 *
 * TODO(M4): on web these entity names LINK to `/entity/<type>/<id>`
 * screens. Those entity detail routes don't exist in the mobile app yet
 * (M4), so we render the names as PLAIN TEXT for now. When the entity
 * route lands, wrap each named entry (that has an `id`) in a `Pressable`
 * that `router.push`es to the entity screen — the ids are already carried
 * in the metadata (Company.id / normalized GameStudio.id).
 */
function EntityRow({
  label,
  entries,
}: {
  label: string;
  entries: { id?: number; name: string }[];
}) {
  return (
    <Row label={label} value={entries.map((e) => e.name).join(", ")} />
  );
}

/** A chip styled like web's `Chip` — outlined pill on the overlay surface. */
function Chip({ children }: { children: string }) {
  return (
    <View className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-1">
      <Text className="text-xs text-text-secondary">{children}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/** Crew: job → names, in a 2-column grid (web's `dl grid sm:grid-cols-2`). */
function CrewPanel({ crew }: { crew: CrewRow[] }) {
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {crew.map((row, i) => (
        <View key={`${row.job}-${i}`} className="w-1/2 pr-4">
          <Row label={row.job} value={row.names.join(", ")} />
        </View>
      ))}
    </View>
  );
}

function DetailsPanel({
  mediaType,
  networks,
  studios,
  countries,
  languages,
  gameDevelopers,
  gamePublishers,
}: {
  mediaType: MediaType;
  networks: Company[];
  studios: Company[];
  countries: Country[];
  languages: string[];
  gameDevelopers: GameStudio[];
  gamePublishers: GameStudio[];
}) {
  const devs = gameDevelopers.map(normalizeStudio);
  const pubs = gamePublishers.map(normalizeStudio);

  // Build the visible rows (mirrors web's per-type gating), then lay them
  // out in a 2-column grid.
  const rows: React.ReactNode[] = [];
  if (mediaType === "tv_show" && networks.length > 0) {
    rows.push(
      <EntityRow
        label={networks.length > 1 ? "Networks" : "Network"}
        entries={networks}
      />
    );
  }
  if (
    (mediaType === "movie" || mediaType === "tv_show") &&
    studios.length > 0
  ) {
    rows.push(
      <EntityRow
        label={studios.length > 1 ? "Studios" : "Studio"}
        entries={studios}
      />
    );
  }
  if (mediaType === "video_game" && devs.length > 0) {
    rows.push(
      <EntityRow
        label={devs.length > 1 ? "Developers" : "Developer"}
        entries={devs}
      />
    );
  }
  if (mediaType === "video_game" && pubs.length > 0) {
    rows.push(
      <EntityRow
        label={pubs.length > 1 ? "Publishers" : "Publisher"}
        entries={pubs}
      />
    );
  }
  if (countries.length > 0) {
    rows.push(
      <Row
        label={countries.length > 1 ? "Countries" : "Country"}
        value={countries.map((c) => c.name).join(", ")}
      />
    );
  }
  if (languages.length > 0) {
    rows.push(
      <Row
        label={languages.length > 1 ? "Languages" : "Language"}
        value={languages.join(", ")}
      />
    );
  }

  return (
    <View className="flex-row flex-wrap gap-y-4">
      {rows.map((row, i) => (
        <View key={i} className="w-1/2 pr-4">
          {row}
        </View>
      ))}
    </View>
  );
}

function GenresPanel({
  genres,
  themes,
}: {
  genres: string[];
  themes: string[];
}) {
  return (
    <View className="gap-5">
      {genres.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Genres
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {genres.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </View>
        </View>
      ) : null}
      {themes.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Themes
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {themes.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PlatformsPanel({ platforms }: { platforms: string[] }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {platforms.map((p) => (
        <Chip key={p}>{p}</Chip>
      ))}
    </View>
  );
}

function ReleasesPanel({ releases }: { releases: Record<string, string> }) {
  const rows = RELEASE_ORDER.filter((k) => releases[k]);
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {rows.map((k) => (
        <View key={k} className="w-1/2 pr-4">
          <Row label={RELEASE_LABELS[k]} value={formatDate(releases[k])} />
        </View>
      ))}
    </View>
  );
}

function AltTitlesPanel({ titles }: { titles: AltTitle[] }) {
  return (
    <View className="flex-row flex-wrap gap-y-2">
      {titles.map((t, i) => (
        <View
          key={`${t.country}-${i}`}
          className="w-1/2 flex-row items-baseline gap-2 pr-4"
        >
          <Text className="text-xs font-medium uppercase text-text-muted">
            {t.country}
          </Text>
          <Text className="flex-1 text-sm text-text-secondary">{t.title}</Text>
        </View>
      ))}
    </View>
  );
}
