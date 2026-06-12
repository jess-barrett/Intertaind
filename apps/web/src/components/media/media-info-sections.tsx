import Link from "next/link";
import { User } from "lucide-react";
import { tmdbImageUrl } from "@/lib/api/tmdb";
import type { MediaType } from "@intertaind/types";

interface CastMember {
  tmdb_id?: number;
  name: string;
  character: string;
  profile_path: string | null;
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

/**
 * Cast slider only — rendered inside the description column so it inherits
 * that column's width and sits directly under the synopsis.
 */
export function MediaCastSection({
  mediaType,
  metadata,
}: {
  mediaType: MediaType;
  metadata: Record<string, unknown> | null;
}) {
  if (mediaType !== "movie" && mediaType !== "tv_show") return null;
  if (!metadata) return null;
  const cast = (metadata.cast as CastMember[] | undefined) ?? [];
  if (cast.length === 0) return null;
  return <CastSection cast={cast} />;
}

/**
 * The remaining sections (crew, details, releases, alternative titles)
 * span the full content width below the cover/description row.
 */
export default function MediaInfoSections({
  mediaType,
  metadata,
}: {
  mediaType: MediaType;
  metadata: Record<string, unknown> | null;
}) {
  if (mediaType !== "movie" && mediaType !== "tv_show") return null;
  if (!metadata) return null;

  const crew = (metadata.key_crew as CrewRow[] | undefined) ?? [];
  const networks = (metadata.networks as Company[] | undefined) ?? [];
  const studios =
    (metadata.production_companies as Company[] | undefined) ?? [];
  const countries =
    (metadata.production_countries as Country[] | undefined) ?? [];
  const languages = (metadata.spoken_languages as string[] | undefined) ?? [];
  const releases =
    (metadata.release_dates as Record<string, string> | undefined) ?? null;
  const altTitles =
    (metadata.alternative_titles as AltTitle[] | undefined) ?? [];

  const hasDetails =
    networks.length > 0 ||
    studios.length > 0 ||
    countries.length > 0 ||
    languages.length > 0;
  const hasReleases =
    releases && Object.keys(releases).some((k) => releases[k]);

  return (
    <>
      {crew.length > 0 && <CrewSection crew={crew} />}
      {hasDetails && (
        <DetailsSection
          mediaType={mediaType}
          networks={networks}
          studios={studios}
          countries={countries}
          languages={languages}
        />
      )}
      {hasReleases && <ReleasesSection releases={releases!} />}
      {altTitles.length > 0 && <AltTitlesSection titles={altTitles} />}
    </>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-lg font-semibold text-text-primary">{title}</h2>
  );
}

function CastSection({ cast }: { cast: CastMember[] }) {
  return (
    <section className="mt-6">
      <SectionHeader title="Cast" />
      <div className="custom-scrollbar flex gap-3 overflow-x-auto pb-2">
        {cast.map((c) => {
          const inner = (
            <>
              <div className="aspect-2/3 overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
                {c.profile_path ? (
                  <img
                    src={tmdbImageUrl(c.profile_path, "w185") ?? ""}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-text-muted">
                    <User size={20} />
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-xs font-medium text-text-primary group-hover:text-brand">
                {c.name}
              </p>
              {c.character && (
                <p className="truncate text-xs text-text-muted">{c.character}</p>
              )}
            </>
          );
          const key = `${c.name}-${c.character}-${c.tmdb_id ?? ""}`;
          return c.tmdb_id ? (
            <Link
              key={key}
              href={`/person/${c.tmdb_id}`}
              className="group w-24 shrink-0 overflow-hidden"
            >
              {inner}
            </Link>
          ) : (
            <div key={key} className="w-24 shrink-0">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CrewSection({ crew }: { crew: CrewRow[] }) {
  return (
    <section className="mt-10">
      <SectionHeader title="Crew" />
      <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {crew.map((row) => (
          <div key={row.job}>
            <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {row.job}
            </dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {row.names.join(", ")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DetailsSection({
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
    <section className="mt-10">
      <SectionHeader title="Details" />
      <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {mediaType === "tv_show" && networks.length > 0 && (
          <DetailRow
            label={networks.length > 1 ? "Networks" : "Network"}
            value={networks.map((n) => n.name).join(", ")}
          />
        )}
        {studios.length > 0 && (
          <DetailRow
            label={studios.length > 1 ? "Studios" : "Studio"}
            value={studios.map((s) => s.name).join(", ")}
          />
        )}
        {countries.length > 0 && (
          <DetailRow
            label={countries.length > 1 ? "Countries" : "Country"}
            value={countries.map((c) => c.name).join(", ")}
          />
        )}
        {languages.length > 0 && (
          <DetailRow
            label={languages.length > 1 ? "Languages" : "Language"}
            value={languages.join(", ")}
          />
        )}
      </dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-text-secondary">{value}</dd>
    </div>
  );
}

function ReleasesSection({ releases }: { releases: Record<string, string> }) {
  return (
    <section className="mt-10">
      <SectionHeader title="Releases" />
      <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {RELEASE_ORDER.filter((k) => releases[k]).map((k) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">
              {RELEASE_LABELS[k]}
            </dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {formatDate(releases[k])}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AltTitlesSection({ titles }: { titles: AltTitle[] }) {
  return (
    <section className="mt-10">
      <SectionHeader title="Alternative titles" />
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
    </section>
  );
}
