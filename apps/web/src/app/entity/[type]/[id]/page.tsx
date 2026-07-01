import { notFound } from "next/navigation";
import { Building2, Tv as TvIcon } from "lucide-react";
import {
  getCompanyDetails,
  getNetworkDetails,
  discoverMoviesByCompany,
  discoverTVByCompany,
  discoverTVByNetwork,
  discoverAllPages,
  TMDB_GENRES,
} from "@/lib/api/tmdb";
import { getCompanyDetailsIGDB, getGamesByCompany } from "@/lib/api/igdb";
import { tmdbImageUrl, igdbImageUrl } from "@intertaind/media";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/back-button";
import EntityFilmographyList from "@/components/media/entity-filmography-list";
import type { EntityCredit } from "@/components/media/entity-filmography-list";
import type { MediaItem, UserMedia } from "@intertaind/types";
import type {
  TMDBMovie,
  TMDBTVShow,
  IGDBGame,
} from "@intertaind/media";

const ENTITY_TYPES = ["tmdb_company", "tmdb_network", "igdb_company"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

function isEntityType(t: string): t is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(t);
}

interface ResolvedEntity {
  name: string;
  logo_url: string | null;
  description: string | null;
  origin_country: string | null;
  homepage: string | null;
  founded_year: number | null;
  /** Section heading rendered above the catalog grid. */
  catalog_label: string;
  credits: EntityCredit[];
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  if (!isEntityType(type)) notFound();

  const sourceId = Number.parseInt(id, 10);
  if (Number.isNaN(sourceId)) notFound();

  let entity: ResolvedEntity;
  try {
    entity = await loadEntity(type, sourceId);
  } catch {
    notFound();
  }

  // Batch-lookup matching media_items rows so each card can render with
  // its current tracking state instead of falling back to the synth path
  // on every render. Filtering by media_type avoids tmdb_id collisions
  // between a movie and TV show that share the same id.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const mediaItemsByKey = new Map<string, MediaItem>();
  if (entity.credits.length > 0) {
    const externalKey =
      type === "igdb_company" ? "external_ids->>igdb_id" : "external_ids->>tmdb_id";
    const ids = Array.from(
      new Set(entity.credits.map((c) => String(c.source_id)))
    );
    const mediaTypeFilter =
      type === "igdb_company"
        ? ["video_game"]
        : type === "tmdb_network"
          ? ["tv_show"]
          : ["movie", "tv_show"];
    const { data: rows } = await supabase
      .from("media_items")
      .select("*")
      .in(externalKey, ids)
      .in("media_type", mediaTypeFilter);
    for (const row of (rows as MediaItem[] | null) ?? []) {
      const ext = (row.external_ids as Record<string, unknown> | null) ?? {};
      const sid =
        type === "igdb_company"
          ? (ext.igdb_id as number | undefined)
          : (ext.tmdb_id as number | undefined);
      if (sid == null) continue;
      mediaItemsByKey.set(`${row.media_type}-${sid}`, row);
    }
  }

  const viewerTracking: Record<string, UserMedia> = {};
  if (user && mediaItemsByKey.size > 0) {
    const matchedIds = Array.from(mediaItemsByKey.values()).map((m) => m.id);
    const { data: vmRows } = await supabase
      .from("user_media")
      .select("*")
      .eq("user_id", user.id)
      .in("media_id", matchedIds);
    for (const row of (vmRows as UserMedia[] | null) ?? []) {
      viewerTracking[row.media_id] = row;
    }
  }

  const FallbackIcon = type === "tmdb_network" ? TvIcon : Building2;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <div className="aspect-square overflow-hidden rounded-sm border border-surface-border bg-surface-overlay">
            {entity.logo_url ? (
              <img
                src={entity.logo_url}
                alt={entity.name}
                className="h-full w-full object-contain p-6"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                <FallbackIcon size={48} className="opacity-40" />
              </div>
            )}
          </div>

          {(entity.origin_country ||
            entity.founded_year ||
            entity.homepage) && (
            <dl className="mt-4 space-y-2 text-xs">
              {entity.origin_country && (
                <Field label="Country" value={entity.origin_country} />
              )}
              {entity.founded_year !== null && (
                <Field label="Founded" value={String(entity.founded_year)} />
              )}
              {entity.homepage && (
                <div>
                  <dt className="font-medium uppercase tracking-wider text-text-muted">
                    Website
                  </dt>
                  <dd className="mt-0.5 truncate">
                    <a
                      href={entity.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-light transition-colors hover:text-brand"
                    >
                      {prettyHostname(entity.homepage)}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-text-primary">
            {entity.name}
          </h1>

          {entity.description && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
              {entity.description}
            </p>
          )}

          <h2 className="mt-8 mb-3 text-lg font-semibold text-text-primary">
            {entity.catalog_label}
          </h2>

          <EntityFilmographyList
            credits={entity.credits}
            mediaItemsByKey={Object.fromEntries(mediaItemsByKey.entries())}
            viewerTracking={viewerTracking}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-text-secondary">{value}</dd>
    </div>
  );
}

function prettyHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function loadEntity(
  type: EntityType,
  id: number
): Promise<ResolvedEntity> {
  if (type === "tmdb_company") {
    const [details, movies, tv] = await Promise.all([
      getCompanyDetails(id),
      discoverAllPages((p) => discoverMoviesByCompany(id, p)),
      discoverAllPages((p) => discoverTVByCompany(id, p)),
    ]);
    return {
      name: details.name,
      logo_url: tmdbImageUrl(details.logo_path, "w300"),
      description: details.description?.trim() || null,
      origin_country: details.origin_country || null,
      homepage: details.homepage || null,
      founded_year: null,
      catalog_label: "Releases",
      credits: [
        ...movies.map(creditFromTMDBMovie),
        ...tv.map(creditFromTMDBTV),
      ],
    };
  }

  if (type === "tmdb_network") {
    const [details, tv] = await Promise.all([
      getNetworkDetails(id),
      discoverAllPages((p) => discoverTVByNetwork(id, p)),
    ]);
    return {
      name: details.name,
      logo_url: tmdbImageUrl(details.logo_path, "w300"),
      description: null,
      origin_country: details.origin_country || null,
      homepage: details.homepage || null,
      founded_year: null,
      catalog_label: "Shows",
      credits: tv.map(creditFromTMDBTV),
    };
  }

  // igdb_company
  const [details, games] = await Promise.all([
    getCompanyDetailsIGDB(id),
    getGamesByCompany(id, "any"),
  ]);
  if (!details) throw new Error("Company not found");
  return {
    name: details.name,
    logo_url: details.logo
      ? igdbImageUrl(details.logo.image_id, "t_logo_med")
      : null,
    description: details.description?.trim() || null,
    origin_country: null,
    homepage:
      details.url ?? details.websites?.[0]?.url ?? null,
    founded_year: details.start_date
      ? new Date(details.start_date * 1000).getUTCFullYear()
      : null,
    catalog_label: "Games",
    credits: games.map(creditFromIGDBGame),
  };
}

function creditFromTMDBMovie(m: TMDBMovie): EntityCredit {
  const date = m.release_date || null;
  return {
    key: `movie-${m.id}`,
    source: "tmdb",
    source_id: m.id,
    media_type: "movie",
    title: m.title,
    description: m.overview || null,
    cover_url: tmdbImageUrl(m.poster_path),
    backdrop_url: tmdbImageUrl(m.backdrop_path, "original"),
    release_date: date,
    year: date ? parseInt(date.slice(0, 4), 10) || null : null,
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    genres: (m.genre_ids ?? [])
      .map((g) => TMDB_GENRES[g])
      .filter((n): n is string => !!n),
    metadata: {
      genre_ids: m.genre_ids ?? [],
      vote_average: m.vote_average,
    },
  };
}

function creditFromTMDBTV(t: TMDBTVShow): EntityCredit {
  const date = t.first_air_date || null;
  return {
    key: `tv_show-${t.id}`,
    source: "tmdb",
    source_id: t.id,
    media_type: "tv_show",
    title: t.name,
    description: t.overview || null,
    cover_url: tmdbImageUrl(t.poster_path),
    backdrop_url: tmdbImageUrl(t.backdrop_path, "original"),
    release_date: date,
    year: date ? parseInt(date.slice(0, 4), 10) || null : null,
    vote_average: t.vote_average ?? 0,
    vote_count: t.vote_count ?? 0,
    genres: (t.genre_ids ?? [])
      .map((g) => TMDB_GENRES[g])
      .filter((n): n is string => !!n),
    metadata: {
      genre_ids: t.genre_ids ?? [],
      vote_average: t.vote_average,
    },
  };
}

function creditFromIGDBGame(g: IGDBGame): EntityCredit {
  const date = g.first_release_date
    ? new Date(g.first_release_date * 1000).toISOString().split("T")[0]
    : null;
  return {
    key: `video_game-${g.id}`,
    source: "igdb",
    source_id: g.id,
    media_type: "video_game",
    title: g.name,
    description: g.summary || null,
    cover_url: g.cover ? igdbImageUrl(g.cover.image_id) : null,
    backdrop_url: g.artworks?.[0]?.image_id
      ? igdbImageUrl(g.artworks[0].image_id, "t_1080p")
      : g.screenshots?.[0]?.image_id
        ? igdbImageUrl(g.screenshots[0].image_id, "t_1080p")
        : null,
    release_date: date,
    year: date ? parseInt(date.slice(0, 4), 10) || null : null,
    // IGDB's `rating` is a 0-100 scale and doesn't pair well with TMDb's
    // 0-10. We treat both the same for the "Highest rated" sort within
    // a single entity page (homogeneous source) so the relative order is
    // still meaningful even if the scales differ across pages.
    vote_average: g.rating ? g.rating / 10 : 0,
    vote_count: g.rating_count ?? 0,
    genres: g.genres?.map((x) => x.name) ?? [],
    metadata: {
      genres: g.genres?.map((x) => x.name) ?? [],
      platforms: g.platforms?.map((x) => x.name) ?? [],
      developers:
        g.involved_companies
          ?.filter((c) => c.developer)
          .map((c) => ({ id: c.company.id, name: c.company.name })) ?? [],
      publishers:
        g.involved_companies
          ?.filter((c) => c.publisher)
          .map((c) => ({ id: c.company.id, name: c.company.name })) ?? [],
    },
  };
}
