// `media-upsert` Edge Function — get-or-create a catalog `media_items` row,
// enriching it upfront.
//
// WHY THIS EXISTS
// Mobile filmography (and other) cards can surface a TMDB title that isn't in
// our catalog yet. Web handles that click via the `upsertMediaItem` server
// action (apps/web/src/app/actions/media.ts): dedupe, and if new, fetch full
// TMDB details, enrich, insert a `media_items` row, return its id — so the UI
// can route to `/media/<id>`. Mobile can't run that Node server action (server
// secrets can't ship in the bundle; TMDB_API_KEY lives only in Edge Functions),
// so this function is the mobile analogue of that action.
//
// The mobile detail page reads the catalog row directly and does NOT lazily
// enrich (web's detail page calls `ensureMediaItemEnriched`; mobile has no such
// path). So for MOVIE/TV this function MUST enrich upfront — a freshly-inserted
// row has to arrive with cast / key_crew / genres / director|creator / tagline /
// runtime|seasons / networks|production_companies / release_dates /
// alternative_titles already populated, or the detail page's Cast tab, info
// tabs, and season cards render empty.
//
// TWO REQUEST SHAPES (accept BOTH)
//   1. `{ media_type, tmdb_id }` — the EXISTING path. Mobile's filmography card
//      taps a TMDB movie/tv credit to enrich it. `media_type` is the request
//      alias `"movie" | "tv"`. Full TMDB re-enrichment; unchanged behavior.
//   2. `{ searchResult: SearchResult }` — the NEW path (the recommend picker).
//      The user picks a `media-search` SearchResult of ANY of the four types and
//      we turn it into a `media_items.id` (recommendations FK). Books/games have
//      NO tmdb_id, so the old shape can't carry them. See the routing below:
//        - movie/tv (SearchResult carries `external_ids.tmdb_id`) → routed
//          through the SAME TMDB enrichment path as shape #1 so the detail page
//          is fully populated.
//        - book/video_game → MINIMAL insert from the SearchResult as-is (title /
//          cover / description / metadata / external_ids). See the scope cut.
//
// SCOPE CUT: BOOK/GAME ENRICHMENT (deliberate)
// The book/game `searchResult` path does NOT re-enrich from OpenLibrary /
// Google Books / IGDB (web's `upsertMediaItem` does: canonical-edition swap,
// cross-reference id backfill, series detection, IGDB company re-normalization).
// The search result's title / cover / metadata is enough for a recommendation
// pairing + a basic detail page; full book/game enrichment is a follow-up (it
// needs the OL/GB/IGDB clients ported into Deno, which media-search has but this
// function deliberately does not import — keeping this function's surface small).
//
// KNOWN DUPLICATION — FOLLOW-UP
// This file RE-IMPLEMENTS web's `enrichTMDBMetadata` + `fetchBestTMDBBackdrop`
// (apps/web/src/app/actions/media.ts + apps/web/src/lib/api/tmdb.ts) in Deno
// `fetch`. A Next.js Node server action can't run on mobile, and sharing that
// Node code into a Deno Edge Function isn't straightforward (pnpm-workspace TS
// paths, `next`-flavoured `fetch` caching, `process.env`). The durable fix is
// to extract a runtime-agnostic TMDB-enrichment module consumed by BOTH web and
// this function so the two can't drift. Until then, the metadata field names
// here are kept in lockstep with web's helper BY HAND — if you change one,
// change the other. Field-name parity is verified against the mobile detail
// page + info-sections.tsx + cast-slider.tsx + season-cards.tsx readers.
//
// SERVICE-ROLE WRITES (RLS BYPASS)
// `media_items` is a globally-shared catalog. This function writes with the
// service-role key (auto-injected as SUPABASE_SERVICE_ROLE_KEY), so it can
// insert regardless of RLS. TMDB_API_KEY is read from the env and never leaked
// to any client. Mirrors the conventions of the `person` Edge Function.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// SearchResult — the shape the recommend picker passes on the NEW path.
// Duplicated from packages/types/src/index.ts (and kept in exact lockstep with
// supabase/functions/_shared/search.ts's `SearchResult`, which the picker
// consumes) because Deno Edge Functions don't share the pnpm workspace's TS
// paths. `external_ids` keys per source: movie/tv `{ tmdb_id }`, book
// `{ google_books_id | openlibrary_work_id, isbn_13? }`, game `{ igdb_id }`.
// ---------------------------------------------------------------------------

type MediaType = "book" | "movie" | "tv_show" | "video_game";

// The external_ids keys media_items can be deduped by — mirrors web's
// `upsertMediaItem`, which iterates EVERY external id present on the result.
const EXTERNAL_ID_KEYS = [
  "tmdb_id",
  "isbn_13",
  "google_books_id",
  "openlibrary_work_id",
  "igdb_id",
] as const;

interface SearchResult {
  media_type: MediaType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  backdrop_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// Minimal TMDB response shapes (mirror packages/media/src/types.ts —
// TMDBMovieDetails / TMDBTVDetails / TMDBImage / TMDBImagesResponse).
// Duplicated here because Deno Edge Functions don't share the pnpm workspace's
// TS paths. Only the fields the enrichment reads are declared.
// ---------------------------------------------------------------------------

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}

interface TMDBCrewMember {
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TMDBCredits {
  cast?: TMDBCastMember[];
  crew?: TMDBCrewMember[];
}

interface TMDBCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country?: string;
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBCountry {
  iso_3166_1: string;
  name: string;
}

interface TMDBSpokenLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

interface TMDBReleaseDatesResults {
  results?: {
    iso_3166_1: string;
    release_dates: { type: number; release_date: string }[];
  }[];
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  runtime: number | null;
  tagline: string | null;
  genres: TMDBGenre[];
  production_companies?: TMDBCompany[];
  production_countries?: TMDBCountry[];
  spoken_languages?: TMDBSpokenLanguage[];
  credits?: TMDBCredits;
  release_dates?: TMDBReleaseDatesResults;
  alternative_titles?: {
    titles?: { iso_3166_1: string; title: string; type: string }[];
  };
  keywords?: {
    keywords?: { id: number; name: string }[];
  };
}

interface TMDBTVSeason {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

interface TMDBTVDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  tagline: string | null;
  genres: TMDBGenre[];
  created_by: { name: string }[];
  status: string;
  seasons: TMDBTVSeason[];
  production_companies?: TMDBCompany[];
  production_countries?: TMDBCountry[];
  spoken_languages?: TMDBSpokenLanguage[];
  networks?: TMDBCompany[];
  credits?: TMDBCredits;
  alternative_titles?: {
    results?: { iso_3166_1: string; title: string; type: string }[];
  };
  keywords?: {
    results?: { id: number; name: string }[];
  };
}

interface TMDBImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
}

interface TMDBImagesResponse {
  id: number;
  backdrops?: TMDBImage[];
}

// ---------------------------------------------------------------------------
// Enrichment helpers — faithful ports of web's `enrichTMDBMetadata` pickers
// (apps/web/src/app/actions/media.ts ~47-296). Field names + slice sizes +
// dedup rules match web exactly.
// ---------------------------------------------------------------------------

// Crew jobs surfaced in `key_crew`, in web's display order.
const KEY_CREW_JOBS = [
  "Director",
  "Screenplay",
  "Writer",
  "Story",
  "Director of Photography",
  "Original Music Composer",
  "Producer",
  "Executive Producer",
  "Editor",
];

// TMDB release-date type → the label the mobile Releases tab keys on
// (info-sections.tsx RELEASE_ORDER). Matches web's RELEASE_TYPE_LABELS.
const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "premiere",
  2: "theatrical_limited",
  3: "theatrical",
  4: "digital",
  5: "physical",
  6: "tv",
};

// Top ~12 billed cast, shape `{ tmdb_id, name, character, profile_path }` —
// exactly what cast-slider.tsx's `CastMember` reads (do NOT rename).
function pickCast(cast: TMDBCastMember[]) {
  return [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, 12)
    .map((c) => ({
      tmdb_id: c.id,
      name: c.name,
      character: c.character,
      profile_path: c.profile_path,
    }));
}

// Grouped crew rows `{ job, names[] }` — what info-sections.tsx's Crew tab
// reads. Skips the hundreds of minor roles TMDB returns.
function pickKeyCrew(crew: TMDBCrewMember[]) {
  const out: { job: string; names: string[] }[] = [];
  for (const job of KEY_CREW_JOBS) {
    const names = crew.filter((c) => c.job === job).map((c) => c.name);
    const unique = Array.from(new Set(names));
    if (unique.length > 0) out.push({ job, names: unique.slice(0, 4) });
  }
  return out;
}

function pickReleaseDates(
  results: TMDBReleaseDatesResults["results"],
  region = "US",
): Record<string, string> | null {
  if (!results?.length) return null;
  const target = results.find((r) => r.iso_3166_1 === region);
  if (!target) return null;
  const out: Record<string, string> = {};
  for (const rd of target.release_dates) {
    const label = RELEASE_TYPE_LABELS[rd.type];
    if (!label) continue;
    // Multiple release dates of the same type → keep the earliest.
    if (!out[label] || new Date(rd.release_date) < new Date(out[label])) {
      out[label] = rd.release_date;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pickAlternativeTitles(
  titles: { iso_3166_1: string; title: string; type: string }[] | undefined,
) {
  if (!titles?.length) return [];
  // Drop empties, prefer up to 8 distinctive entries. Shape { country, title }
  // matches info-sections.tsx's AltTitle reader.
  return titles
    .filter((t) => t.title && t.title.trim().length > 0)
    .slice(0, 8)
    .map((t) => ({ country: t.iso_3166_1, title: t.title }));
}

// Networks + production_companies → `{ id, name, logo_path }` (info-sections
// Company reader). Web caps at 6.
function pickProductionCompanies(cos: TMDBCompany[] | undefined) {
  return (cos ?? []).slice(0, 6).map((c) => ({
    id: c.id,
    name: c.name,
    logo_path: c.logo_path,
  }));
}

// Rank TMDB backdrops the way web's `pickBestTMDBBackdrop` does:
//   1. language-neutral (no embedded text) > English > other
//   2. higher vote_average
//   3. higher vote_count
// Returns the best backdrop's `original`-size URL, or null.
function pickBestBackdrop(backdrops: TMDBImage[] | undefined): string | null {
  if (!backdrops || backdrops.length === 0) return null;
  const langScore = (lang: string | null): number => {
    if (lang === null) return 2;
    if (lang === "en") return 1;
    return 0;
  };
  const ranked = [...backdrops].sort((a, b) => {
    const langDiff = langScore(b.iso_639_1) - langScore(a.iso_639_1);
    if (langDiff !== 0) return langDiff;
    if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
    return b.vote_count - a.vote_count;
  });
  return tmdbImageUrl(ranked[0].file_path, "original");
}

// TMDB image URL construction — mirrors @intertaind/media `tmdbImageUrl`.
function tmdbImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// A Postgres `date` column rejects "". TMDB returns "" for missing dates.
function toDateOrNull(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  return value;
}

// ---------------------------------------------------------------------------
// The enriched row a movie/tv build produces, ready to insert into media_items.
// ---------------------------------------------------------------------------

interface BuiltRow {
  media_type: "movie" | "tv_show";
  title: string;
  description: string | null;
  cover_image_url: string | null;
  backdrop_url: string | null;
  release_date: string | null;
  metadata: Record<string, unknown>;
  external_ids: { tmdb_id: number };
}

// Build the full movie row (details + best backdrop). Mirrors the movie branch
// of web's `enrichTMDBMetadata` + `fetchBestTMDBBackdrop`.
async function buildMovieRow(
  tmdbId: number,
  headers: HeadersInit,
): Promise<BuiltRow | "not_found"> {
  // append_to_response matches web's getMovieDetails.
  const detailsRes = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}?append_to_response=credits,release_dates,alternative_titles,keywords`,
    { headers },
  );
  if (detailsRes.status === 404) return "not_found";
  if (!detailsRes.ok) {
    throw new Error(`TMDB movie details failed: ${detailsRes.status}`);
  }
  const details = (await detailsRes.json()) as TMDBMovieDetails;

  // Best backdrop, in parallel-friendly fashion (single extra request). Falls
  // back to null on any failure (web falls back to the passed-in URL; mobile
  // has none to pass, so null → the detail hero shows its no-backdrop block).
  const backdrop_url = await fetchBestBackdrop("movie", tmdbId, headers);

  const key_crew = pickKeyCrew(details.credits?.crew ?? []);
  const director = key_crew.find((r) => r.job === "Director")?.names[0] ?? null;

  const metadata: Record<string, unknown> = {
    director,
    runtime: details.runtime,
    tagline: details.tagline || null,
    genres: (details.genres ?? []).map((g) => g.name),
    // TMDB keywords double as themes ("post-apocalyptic", "robots", …).
    keywords: details.keywords?.keywords?.map((k) => k.name) ?? [],
    cast: pickCast(details.credits?.cast ?? []),
    key_crew,
    production_companies: pickProductionCompanies(details.production_companies),
    production_countries: (details.production_countries ?? []).map((c) => ({
      code: c.iso_3166_1,
      name: c.name,
    })),
    spoken_languages: (details.spoken_languages ?? []).map(
      (l) => l.english_name,
    ),
    release_dates: pickReleaseDates(details.release_dates?.results),
    alternative_titles: pickAlternativeTitles(
      details.alternative_titles?.titles,
    ),
  };

  return {
    media_type: "movie",
    title: details.title,
    description: details.overview || null,
    cover_image_url: tmdbImageUrl(details.poster_path),
    backdrop_url,
    release_date: toDateOrNull(details.release_date),
    metadata,
    external_ids: { tmdb_id: tmdbId },
  };
}

// Build the full TV row. Mirrors the tv_show branch of web's
// `enrichTMDBMetadata` (aired vs upcoming season split, per-season detail).
async function buildTVRow(
  tmdbId: number,
  headers: HeadersInit,
): Promise<BuiltRow | "not_found"> {
  const detailsRes = await fetch(
    `${TMDB_BASE_URL}/tv/${tmdbId}?append_to_response=credits,alternative_titles,keywords`,
    { headers },
  );
  if (detailsRes.status === 404) return "not_found";
  if (!detailsRes.ok) {
    throw new Error(`TMDB TV details failed: ${detailsRes.status}`);
  }
  const details = (await detailsRes.json()) as TMDBTVDetails;

  const backdrop_url = await fetchBestBackdrop("tv", tmdbId, headers);

  const today = new Date().toISOString().split("T")[0];
  const allSeasons = details.seasons ?? [];
  // Aired = real season (number > 0), with episodes, air_date in the past.
  const aired = allSeasons.filter(
    (s) =>
      s.season_number > 0 &&
      s.episode_count > 0 &&
      s.air_date !== null &&
      s.air_date <= today,
  );
  // Upcoming = announced with a future air_date.
  const upcoming = allSeasons
    .filter(
      (s) => s.season_number > 0 && s.air_date !== null && s.air_date > today,
    )
    .sort((a, b) => ((a.air_date as string) < (b.air_date as string) ? -1 : 1))
    .map((s) => ({
      season_number: s.season_number,
      name: s.name,
      air_date: s.air_date,
      episode_count: s.episode_count,
      poster_path: s.poster_path,
    }));

  const realSeasons = aired.length;
  // Per-season episode counts: { "1": 9, "2": 10 }.
  const seasonEpisodes: Record<string, number> = {};
  for (const s of aired) {
    seasonEpisodes[String(s.season_number)] = s.episode_count;
  }
  // Full per-season detail for the mobile Seasons cards (season-cards.tsx
  // SeasonDetail reader) — do NOT rename these fields.
  const seasonDetails = aired.map((s) => ({
    season_number: s.season_number,
    name: s.name,
    episode_count: s.episode_count,
    air_date: s.air_date,
    poster_path: s.poster_path,
    overview: s.overview || null,
  }));

  const metadata: Record<string, unknown> = {
    creator: details.created_by.map((c) => c.name).join(", ") || null,
    seasons: realSeasons,
    number_of_seasons: realSeasons,
    number_of_episodes: details.number_of_episodes,
    season_episodes: seasonEpisodes,
    season_details: seasonDetails,
    upcoming_seasons: upcoming,
    tagline: details.tagline || null,
    genres: (details.genres ?? []).map((g) => g.name),
    // TV's keywords nest under `.results` (not `.keywords`).
    keywords: details.keywords?.results?.map((k) => k.name) ?? [],
    status: details.status,
    cast: pickCast(details.credits?.cast ?? []),
    key_crew: pickKeyCrew(details.credits?.crew ?? []),
    // TV gets `networks` (broadcaster) AND `production_companies` (studio).
    networks: pickProductionCompanies(details.networks),
    production_companies: pickProductionCompanies(details.production_companies),
    production_countries: (details.production_countries ?? []).map((c) => ({
      code: c.iso_3166_1,
      name: c.name,
    })),
    spoken_languages: (details.spoken_languages ?? []).map(
      (l) => l.english_name,
    ),
    // TV's alternative_titles uses `results` (not `titles`).
    alternative_titles: pickAlternativeTitles(details.alternative_titles?.results),
  };

  return {
    media_type: "tv_show",
    title: details.name,
    description: details.overview || null,
    cover_image_url: tmdbImageUrl(details.poster_path),
    backdrop_url,
    release_date: toDateOrNull(details.first_air_date),
    metadata,
    external_ids: { tmdb_id: tmdbId },
  };
}

// Fetch /images and return the best backdrop URL. Mirrors web's
// `fetchBestTMDBBackdrop`, returning null on any failure.
async function fetchBestBackdrop(
  tmdbType: "movie" | "tv",
  tmdbId: number,
  headers: HeadersInit,
): Promise<string | null> {
  try {
    // include_image_language narrows to English + language-neutral, matching
    // web's getMovieImages / getTVImages.
    const res = await fetch(
      `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}/images?include_image_language=en,null`,
      { headers },
    );
    if (!res.ok) return null;
    const images = (await res.json()) as TMDBImagesResponse;
    return pickBestBackdrop(images.backdrops);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request plumbing.
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePositiveInt(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// The two body shapes, after parsing. Exactly one is present.
type ParsedBody =
  | { kind: "tmdb"; media_type: "movie" | "tv"; tmdbId: number }
  | { kind: "search"; searchResult: SearchResult }
  | { kind: "invalid"; error: string };

// Coerce arbitrary input into a SearchResult, validating the fields we depend
// on (a valid `media_type` + a non-empty title + at least one recognized
// external id). Returns null when it isn't a usable SearchResult so the caller
// can 400. We normalize external_ids to only the keys we dedup on and coerce
// their values to string|number, dropping anything malformed.
function coerceSearchResult(raw: unknown): SearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const mt = o.media_type;
  if (
    mt !== "book" &&
    mt !== "movie" &&
    mt !== "tv_show" &&
    mt !== "video_game"
  ) {
    return null;
  }

  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;

  const rawExt =
    o.external_ids && typeof o.external_ids === "object"
      ? (o.external_ids as Record<string, unknown>)
      : {};
  const external_ids: Record<string, string | number> = {};
  for (const key of EXTERNAL_ID_KEYS) {
    const v = rawExt[key];
    if (typeof v === "string" && v.length > 0) external_ids[key] = v;
    else if (typeof v === "number" && Number.isFinite(v)) external_ids[key] = v;
  }
  // A SearchResult with no recognized external id can't be deduped OR keyed —
  // reject it (mirrors the picker only ever passing real search results).
  if (Object.keys(external_ids).length === 0) return null;

  return {
    media_type: mt,
    title,
    description: typeof o.description === "string" ? o.description : null,
    cover_image_url:
      typeof o.cover_image_url === "string" ? o.cover_image_url : null,
    backdrop_url: typeof o.backdrop_url === "string" ? o.backdrop_url : null,
    release_date: typeof o.release_date === "string" ? o.release_date : null,
    metadata:
      o.metadata && typeof o.metadata === "object"
        ? (o.metadata as Record<string, unknown>)
        : null,
    external_ids,
  };
}

// Parse EITHER shape from the query string OR a JSON body. Mobile invokes via
// `supabase.functions.invoke("media-upsert", { body: {…} })`, which POSTs JSON.
// The `{ media_type, tmdb_id }` shape also accepts the query string (curl smoke
// tests); the `{ searchResult }` shape is JSON-body only (nested object).
async function readBody(req: Request): Promise<ParsedBody> {
  const url = new URL(req.url);
  const qsMediaType = url.searchParams.get("media_type");
  const qsTmdbId = url.searchParams.get("tmdb_id");

  let bodyMediaType: unknown = qsMediaType;
  let bodyTmdbId: unknown = qsTmdbId;
  let bodySearchResult: unknown;

  if (
    qsMediaType == null &&
    qsTmdbId == null &&
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        bodyMediaType = b.media_type;
        bodyTmdbId = b.tmdb_id;
        bodySearchResult = b.searchResult;
      }
    } catch {
      // No / invalid JSON body — fall through to validation.
    }
  }

  // NEW path takes precedence when a `searchResult` is present.
  if (bodySearchResult !== undefined) {
    const sr = coerceSearchResult(bodySearchResult);
    if (!sr) {
      return {
        kind: "invalid",
        error:
          "searchResult must have a valid media_type, a title, and at least one external id",
      };
    }
    return { kind: "search", searchResult: sr };
  }

  // EXISTING path: `{ media_type, tmdb_id }`.
  if (bodyMediaType === "book" || bodyMediaType === "video_game") {
    // On the tmdb shape, books/games have no tmdb_id — the caller should use
    // the `searchResult` shape instead.
    return {
      kind: "invalid",
      error:
        "book/video_game must be sent via the searchResult body shape (they have no tmdb_id)",
    };
  }
  if (bodyMediaType !== "movie" && bodyMediaType !== "tv") {
    return {
      kind: "invalid",
      error: "provide either { media_type: 'movie'|'tv', tmdb_id } or { searchResult }",
    };
  }
  const tmdbId = parsePositiveInt(bodyTmdbId);
  if (tmdbId == null) {
    return {
      kind: "invalid",
      error: "tmdb_id is required and must be a positive integer",
    };
  }
  return { kind: "tmdb", media_type: bodyMediaType, tmdbId };
}

// Look up an existing catalog row by TMDB id + catalog media_type. Returns its
// id or null. Used by the movie/tv path's initial dedup AND its post-23505
// re-read.
async function findExistingByTmdbId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tmdbId: number,
  catalogType: "movie" | "tv_show",
): Promise<string | null> {
  const { data, error } = await supabase
    .from("media_items")
    .select("id, media_type")
    .eq("external_ids->>tmdb_id", String(tmdbId))
    .eq("media_type", catalogType)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// Dedup by ANY external id the SearchResult carries — mirrors web's
// `upsertMediaItem`, which iterates every id (a row catalogued under one
// identifier, e.g. `google_books_id`, must still match a result surfaced under
// another, e.g. `isbn_13`). Scoped to the matching catalog media_type so a book
// and a movie that happen to collide on an id can't cross-match. Returns the
// first matching row id, or null. Used for both the initial dedup and the
// post-23505 re-read on the book/game insert.
async function findExistingByAnyExternalId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  externalIds: Record<string, string | number>,
  catalogType: MediaType,
): Promise<string | null> {
  for (const key of EXTERNAL_ID_KEYS) {
    const value = externalIds[key];
    if (value === undefined) continue;
    const { data, error } = await supabase
      .from("media_items")
      .select("id")
      .eq(`external_ids->>${key}`, String(value))
      .eq("media_type", catalogType)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  return null;
}

// Build a fully-enriched movie/tv row from a TMDB id and insert it (idempotent
// on 23505). Shared by BOTH request shapes: shape #1 calls it directly; the
// `searchResult` path routes a movie/tv result here by extracting its
// `external_ids.tmdb_id`. Returns the row id, or a discriminated failure.
async function upsertTmdb(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  media_type: "movie" | "tv",
  tmdbId: number,
): Promise<
  | { ok: true; id: string }
  | { ok: false; status: number; error: string }
> {
  // Our catalog uses 'tv_show' for television; TMDB uses 'tv'.
  const catalogType: "movie" | "tv_show" =
    media_type === "tv" ? "tv_show" : "movie";

  // Dedup. If the row already exists, return its id fast — do NOT re-enrich.
  // Web re-enriches stale rows on its detail-page path, but for mobile's
  // tap-to-open a fast existing-row return matters more; a separate freshness
  // pass can handle drift later.
  const existingId = await findExistingByTmdbId(supabase, tmdbId, catalogType);
  if (existingId) return { ok: true, id: existingId };

  // New title — fetch TMDB + enrich.
  const tmdbKey = Deno.env.get("TMDB_API_KEY");
  if (!tmdbKey) {
    // Explicit but never echoes the (missing) key value.
    return {
      ok: false,
      status: 500,
      error: "TMDB_API_KEY is not configured on this function",
    };
  }
  const headers = {
    Authorization: `Bearer ${tmdbKey}`,
    "Content-Type": "application/json",
  };

  const built =
    media_type === "movie"
      ? await buildMovieRow(tmdbId, headers)
      : await buildTVRow(tmdbId, headers);
  if (built === "not_found") {
    return { ok: false, status: 404, error: "not found" };
  }

  // Insert. On a unique-violation (23505) a concurrent request raced our dedup
  // — re-read and return the winner's id (idempotent).
  const { data: inserted, error: insertErr } = await supabase
    .from("media_items")
    .insert({
      media_type: built.media_type,
      title: built.title,
      description: built.description,
      cover_image_url: built.cover_image_url,
      backdrop_url: built.backdrop_url,
      release_date: built.release_date,
      metadata: built.metadata,
      external_ids: built.external_ids,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const racedId = await findExistingByTmdbId(supabase, tmdbId, catalogType);
      if (racedId) return { ok: true, id: racedId };
    }
    throw insertErr;
  }
  return { ok: true, id: inserted.id };
}

// Minimal insert for a book/video_game SearchResult — NO OL/GB/IGDB
// re-enrichment (see the SCOPE CUT note in the file header). The search
// result's own title / cover / description / metadata / external_ids are
// enough for a recommendation pairing + a basic detail page. Dedup-by-any-id
// runs first; on a 23505 race, re-dedup and return the winner.
async function upsertSearchResultMinimal(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sr: SearchResult,
): Promise<
  | { ok: true; id: string }
  | { ok: false; status: number; error: string }
> {
  const existingId = await findExistingByAnyExternalId(
    supabase,
    sr.external_ids,
    sr.media_type,
  );
  if (existingId) return { ok: true, id: existingId };

  const { data: inserted, error: insertErr } = await supabase
    .from("media_items")
    .insert({
      media_type: sr.media_type,
      title: sr.title,
      description: sr.description,
      cover_image_url: sr.cover_image_url,
      backdrop_url: sr.backdrop_url,
      release_date: toDateOrNull(sr.release_date),
      metadata: sr.metadata ?? {},
      external_ids: sr.external_ids,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const racedId = await findExistingByAnyExternalId(
        supabase,
        sr.external_ids,
        sr.media_type,
      );
      if (racedId) return { ok: true, id: racedId };
    }
    throw insertErr;
  }
  return { ok: true, id: inserted.id };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 2. Parse + validate the body (either shape).
    const parsed = await readBody(req);
    if (parsed.kind === "invalid") {
      return jsonResponse({ error: parsed.error }, 400);
    }

    // 3. Service-role client — bypasses RLS so we can write the catalog.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 4. Route to the right upsert.
    let result:
      | { ok: true; id: string }
      | { ok: false; status: number; error: string };

    if (parsed.kind === "tmdb") {
      // EXISTING path — the filmography card's tap-to-enrich (movie/tv).
      result = await upsertTmdb(supabase, parsed.media_type, parsed.tmdbId);
    } else {
      // NEW path — the recommend picker's SearchResult (all four types).
      const sr = parsed.searchResult;
      if (sr.media_type === "movie" || sr.media_type === "tv_show") {
        // Route movie/tv through the SAME TMDB enrichment path (keyed by the
        // result's tmdb_id) so the detail page is fully populated. coerce
        // guaranteed at least one external id; for movie/tv from media-search
        // that's always tmdb_id — but guard in case a caller passes a movie/tv
        // result without one.
        const tmdbId = parsePositiveInt(sr.external_ids.tmdb_id);
        if (tmdbId == null) {
          result = {
            ok: false,
            status: 400,
            error: "movie/tv searchResult must carry external_ids.tmdb_id",
          };
        } else {
          const alias = sr.media_type === "tv_show" ? "tv" : "movie";
          result = await upsertTmdb(supabase, alias, tmdbId);
        }
      } else {
        // book / video_game — minimal insert (scope cut: no re-enrichment).
        result = await upsertSearchResultMinimal(supabase, sr);
      }
    }

    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }
    return jsonResponse({ id: result.id });
  } catch (err) {
    // Never leak the TMDB key. A short message is safe and useful.
    const message = err instanceof Error ? err.message : "unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
