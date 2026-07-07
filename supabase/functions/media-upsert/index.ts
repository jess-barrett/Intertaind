// `media-upsert` Edge Function — get-or-create a catalog `media_items` row
// for a TMDB movie / TV title, enriching it upfront.
//
// WHY THIS EXISTS
// Mobile filmography (and other) cards can surface a TMDB title that isn't in
// our catalog yet. Web handles that click via the `upsertMediaItem` server
// action (apps/web/src/app/actions/media.ts): dedupe, and if new, fetch full
// TMDB details, enrich, insert a `media_items` row, return its id — so the UI
// can route to `/media/<id>`. Mobile can't run that Node server action (server
// secrets can't ship in the bundle; TMDB_API_KEY lives only in Edge Functions),
// so this function is the mobile analogue of that action's MOVIE/TV path.
//
// The mobile detail page reads the catalog row directly and does NOT lazily
// enrich (web's detail page calls `ensureMediaItemEnriched`; mobile has no such
// path). So this function MUST enrich upfront — a freshly-inserted row has to
// arrive with cast / key_crew / genres / director|creator / tagline / runtime|
// seasons / networks|production_companies / release_dates / alternative_titles
// already populated, or the detail page's Cast tab, info tabs, and season cards
// render empty.
//
// SCOPE: MOVIE/TV ONLY (deliberate)
// The only uncataloged cards mobile has today are filmography titles, which are
// always TMDB movies/tv. `book` / `video_game` return a 400 — a documented
// follow-up. Those live in the web action via IGDB / Google Books / OpenLibrary
// enrichment paths that this function does not (yet) reimplement.
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

// Parse `{ media_type, tmdb_id }` from the query string OR a JSON body. Mobile
// invokes via `supabase.functions.invoke("media-upsert", { body: {…} })`, which
// POSTs JSON; the query string works too.
async function readParams(
  req: Request,
): Promise<{ media_type: unknown; tmdb_id: unknown }> {
  const url = new URL(req.url);
  const qsMediaType = url.searchParams.get("media_type");
  const qsTmdbId = url.searchParams.get("tmdb_id");
  if (qsMediaType != null || qsTmdbId != null) {
    return { media_type: qsMediaType, tmdb_id: qsTmdbId };
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        return {
          media_type: (body as Record<string, unknown>).media_type,
          tmdb_id: (body as Record<string, unknown>).tmdb_id,
        };
      }
    } catch {
      // No / invalid JSON body — fall through.
    }
  }
  return { media_type: undefined, tmdb_id: undefined };
}

// Look up an existing catalog row by TMDB id + catalog media_type. Returns its
// id or null. Used for the initial dedup AND the post-23505 re-read.
async function findExisting(
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

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 2. Parse + validate params.
    const { media_type, tmdb_id } = await readParams(req);

    if (media_type === "book" || media_type === "video_game") {
      // Documented follow-up: books/games need IGDB / Google Books / OpenLibrary
      // enrichment paths this function doesn't reimplement yet. Filmography
      // (mobile's only uncataloged cards today) is always movie/tv.
      return jsonResponse(
        { error: "media-upsert currently supports movie/tv only" },
        400,
      );
    }
    if (media_type !== "movie" && media_type !== "tv") {
      return jsonResponse(
        { error: "media_type must be 'movie' or 'tv'" },
        400,
      );
    }
    const tmdbId = parsePositiveInt(tmdb_id);
    if (tmdbId == null) {
      return jsonResponse(
        { error: "tmdb_id is required and must be a positive integer" },
        400,
      );
    }

    // Our catalog uses 'tv_show' for television; TMDB uses 'tv'.
    const catalogType: "movie" | "tv_show" =
      media_type === "tv" ? "tv_show" : "movie";

    // 3. Service-role client — bypasses RLS so we can write the catalog.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 4. Dedup. If the row already exists, return its id fast — do NOT
    //    re-enrich. Web re-enriches stale rows on its detail-page path, but for
    //    mobile's tap-to-open a fast existing-row return matters more; a
    //    separate freshness pass can handle drift later.
    const existingId = await findExisting(supabase, tmdbId, catalogType);
    if (existingId) return jsonResponse({ id: existingId });

    // 5. New title — fetch TMDB + enrich.
    const tmdbKey = Deno.env.get("TMDB_API_KEY");
    if (!tmdbKey) {
      // Explicit but never echoes the (missing) key value.
      return jsonResponse(
        { error: "TMDB_API_KEY is not configured on this function" },
        500,
      );
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
      return jsonResponse({ error: "not found" }, 404);
    }

    // 6. Insert. On a unique-violation (23505) a concurrent request raced our
    //    dedup — re-read and return the winner's id (idempotent).
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
        const racedId = await findExisting(supabase, tmdbId, catalogType);
        if (racedId) return jsonResponse({ id: racedId });
      }
      throw insertErr;
    }

    return jsonResponse({ id: inserted.id });
  } catch (err) {
    // Never leak the TMDB key. A short message is safe and useful.
    const message = err instanceof Error ? err.message : "unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
