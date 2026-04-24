"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { tmdbImageUrl } from "@/lib/api/tmdb";
import type { MediaType } from "@/lib/types";

const SYNOPSIS_LIMIT = 175;

// Trim to the last word boundary at or before `limit` so we don't slice
// mid-word.
function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

interface SeasonDetail {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string | null;
}

interface CrewRow {
  job: string;
  names: string[];
}

interface Company {
  id: number;
  name: string;
  logo_path: string | null;
}

interface Country {
  code: string;
  name: string;
}

interface AltTitle {
  country: string;
  title: string;
}

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

type TabKey =
  | "seasons"
  | "crew"
  | "details"
  | "genres"
  | "releases"
  | "alt_titles";

export default function MediaInfoTabs({
  mediaType,
  metadata,
}: {
  mediaType: MediaType;
  metadata: Record<string, unknown> | null;
}) {
  const seasonDetails =
    mediaType === "tv_show"
      ? (metadata?.season_details as SeasonDetail[] | undefined) ?? []
      : [];
  const crew = (metadata?.key_crew as CrewRow[] | undefined) ?? [];
  const genres = (metadata?.genres as string[] | undefined) ?? [];
  const themes = (metadata?.keywords as string[] | undefined) ?? [];
  const networks = (metadata?.networks as Company[] | undefined) ?? [];
  const studios =
    (metadata?.production_companies as Company[] | undefined) ?? [];
  const countries =
    (metadata?.production_countries as Country[] | undefined) ?? [];
  const languages = (metadata?.spoken_languages as string[] | undefined) ?? [];
  const releases =
    (metadata?.release_dates as Record<string, string> | undefined) ?? null;
  const altTitles =
    (metadata?.alternative_titles as AltTitle[] | undefined) ?? [];

  const hasDetails =
    networks.length > 0 ||
    studios.length > 0 ||
    countries.length > 0 ||
    languages.length > 0;
  const hasReleases =
    !!releases && Object.keys(releases).some((k) => releases[k]);

  // Build the tab list, skipping any with no data — no point rendering an
  // empty tab.
  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "seasons", label: "Seasons", show: seasonDetails.length > 0 },
    { key: "crew", label: "Crew", show: crew.length > 0 },
    { key: "details", label: "Details", show: hasDetails },
    {
      key: "genres",
      label: "Genres",
      show: genres.length > 0 || themes.length > 0,
    },
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

  if (visibleTabs.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap gap-2 border-b border-surface-border pb-1">
        {visibleTabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`relative rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      {active === "seasons" && <SeasonsPanel seasons={seasonDetails} />}
      {active === "crew" && <CrewPanel crew={crew} />}
      {active === "details" && (
        <DetailsPanel
          mediaType={mediaType}
          networks={networks}
          studios={studios}
          countries={countries}
          languages={languages}
        />
      )}
      {active === "genres" && (
        <GenresPanel genres={genres} themes={themes} />
      )}
      {active === "releases" && releases && <ReleasesPanel releases={releases} />}
      {active === "alt_titles" && <AltTitlesPanel titles={altTitles} />}
    </section>
  );
}

function SeasonsPanel({ seasons }: { seasons: SeasonDetail[] }) {
  return (
    <div className="space-y-4">
      {seasons.map((s) => (
        <SeasonCard key={s.season_number} s={s} />
      ))}
    </div>
  );
}

function SeasonCard({ s }: { s: SeasonDetail }) {
  const [expanded, setExpanded] = useState(false);
  const overview = s.overview ?? "";
  const isLong = overview.length > SYNOPSIS_LIMIT;

  return (
    <article className="flex items-start gap-4 rounded-sm border border-surface-border bg-surface-raised/40 p-3">
      <div className="aspect-2/3 w-20 shrink-0 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
        {s.poster_path ? (
          <img
            src={tmdbImageUrl(s.poster_path, "w185") ?? ""}
            alt={s.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <Tv size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-text-primary">
          {s.name || `Season ${s.season_number}`}
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          {s.episode_count} episode{s.episode_count === 1 ? "" : "s"}
          {s.air_date && (
            <>
              {" · "}
              {new Date(s.air_date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </>
          )}
        </p>
        {overview && (
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {expanded || !isLong
              ? overview
              : `${truncateAtWord(overview, SYNOPSIS_LIMIT)}...`}
            {isLong && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-xs font-medium text-brand-light transition-colors hover:text-brand"
                >
                  {expanded ? "show less" : "show more"}
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-text-secondary">{value}</dd>
    </div>
  );
}

function CrewPanel({ crew }: { crew: CrewRow[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {crew.map((row) => (
        <Row key={row.job} label={row.job} value={row.names.join(", ")} />
      ))}
    </dl>
  );
}

function DetailsPanel({
  mediaType,
  networks,
  studios,
  countries,
  languages,
}: {
  mediaType: MediaType;
  networks: Company[];
  studios: Company[];
  countries: Country[];
  languages: string[];
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {mediaType === "tv_show" && networks.length > 0 && (
        <Row
          label={networks.length > 1 ? "Networks" : "Network"}
          value={networks.map((n) => n.name).join(", ")}
        />
      )}
      {studios.length > 0 && (
        <Row
          label={studios.length > 1 ? "Studios" : "Studio"}
          value={studios.map((s) => s.name).join(", ")}
        />
      )}
      {countries.length > 0 && (
        <Row
          label={countries.length > 1 ? "Countries" : "Country"}
          value={countries.map((c) => c.name).join(", ")}
        />
      )}
      {languages.length > 0 && (
        <Row
          label={languages.length > 1 ? "Languages" : "Language"}
          value={languages.join(", ")}
        />
      )}
    </dl>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-surface-border bg-surface-overlay px-3 py-1 text-xs text-text-secondary">
      {children}
    </span>
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
    <div className="space-y-5">
      {genres.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
            Genres
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </div>
        </div>
      )}
      {themes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
            Themes
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReleasesPanel({ releases }: { releases: Record<string, string> }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {RELEASE_ORDER.filter((k) => releases[k]).map((k) => (
        <Row key={k} label={RELEASE_LABELS[k]} value={formatDate(releases[k])} />
      ))}
    </dl>
  );
}

function AltTitlesPanel({ titles }: { titles: AltTitle[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {titles.map((t, i) => (
        <div
          key={`${t.country}-${i}`}
          className="flex items-baseline gap-2 text-sm"
        >
          <span className="w-6 shrink-0 text-xs font-medium uppercase text-text-muted">
            {t.country}
          </span>
          <span className="text-text-secondary">{t.title}</span>
        </div>
      ))}
    </div>
  );
}
