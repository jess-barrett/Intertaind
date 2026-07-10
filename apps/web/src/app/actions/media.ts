"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  ActivityDraft,
  ActivityType,
  SearchResult,
  TrackingStatus,
} from "@intertaind/types";
import {
  addedToShelfActivity,
  favoriteActivity,
  rateActivity,
  removeActivity,
  resolveTrackActivity,
  reviewActivity,
  statusChangedActivity,
} from "@intertaind/types";
import {
  getMovieDetails,
  getTVDetails,
  fetchBestTMDBBackdrop,
} from "@/lib/api/tmdb";
import { getGameDetails } from "@/lib/api/igdb";
import {
  findCanonicalBookEdition,
  findVolumeByISBN,
  getBookDetails,
  getSeriesName,
} from "@/lib/api/google-books";
import type { GoogleBooksVolume } from "@intertaind/media";
import {
  findISBNForWork,
  findWorkByISBN,
  getWorkByOlid,
  getWorkEditions,
  extractSeriesFromWork,
  extractSeriesFromEditions,
} from "@/lib/api/openlibrary";
import {
  findBookSeriesOnWikidata,
  findBookPublicationYearOnWikidata,
} from "@/lib/api/wikidata";
import { yearFromDateString } from "@/lib/time";
import {
  normalizeGoogleBook,
  normalizeIGDBGame,
  tmdbImageUrl,
  igdbImageUrl,
} from "@intertaind/media";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Insert an `activity_log` row from a shared `ActivityDraft` (or no-op when
 * null). The single web write path for TRACKING activity — the "what to log"
 * decision lives in `@intertaind/types` (shared with mobile), so the two
 * platforms can't drift. (List / recommendation activity is logged by their own
 * actions and isn't covered here.)
 */
async function logActivity(
  supabase: ServerSupabase,
  userId: string,
  mediaId: string | null,
  draft: ActivityDraft | null,
): Promise<void> {
  if (!draft) return;
  await supabase.from("activity_log").insert({
    user_id: userId,
    media_id: mediaId,
    activity_type: draft.activity_type,
    metadata: draft.metadata,
  });
}

// --- Phase 1 enrichment helpers ---

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

interface RawCast {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}
interface RawCrew {
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

function pickCast(cast: RawCast[]) {
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

function pickKeyCrew(crew: RawCrew[]) {
  // Group named-roles into rows of `{ job, names[] }` so we can render
  // "Director: Shawn Levy" or "Producer: A, B, C" without listing the
  // hundreds of "Visual Effects Artist" entries TMDb returns.
  const out: { job: string; names: string[] }[] = [];
  for (const job of KEY_CREW_JOBS) {
    const names = crew
      .filter((c) => c.job === job)
      .map((c) => c.name);
    const unique = Array.from(new Set(names));
    if (unique.length > 0) out.push({ job, names: unique.slice(0, 4) });
  }
  return out;
}

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "premiere",
  2: "theatrical_limited",
  3: "theatrical",
  4: "digital",
  5: "physical",
  6: "tv",
};

function pickReleaseDates(
  results:
    | {
        iso_3166_1: string;
        release_dates: { type: number; release_date: string }[];
      }[]
    | undefined,
  region = "US"
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
  titles: { iso_3166_1: string; title: string; type: string }[] | undefined
) {
  if (!titles?.length) return [];
  // Drop empties, prefer up to 8 distinctive entries.
  return titles
    .filter((t) => t.title && t.title.trim().length > 0)
    .slice(0, 8)
    .map((t) => ({ country: t.iso_3166_1, title: t.title }));
}

function pickProductionCompanies(
  cos:
    | { id: number; name: string; logo_path: string | null }[]
    | undefined
) {
  return (cos ?? []).slice(0, 6).map((c) => ({
    id: c.id,
    name: c.name,
    logo_path: c.logo_path,
  }));
}

async function enrichTMDBMetadata(
  mediaType: string,
  externalIds: Record<string, string | number>,
  existingMetadata: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const tmdbId = externalIds.tmdb_id as number | undefined;
  if (!tmdbId) return null;

  if (mediaType === "movie") {
    try {
      const details = await getMovieDetails(tmdbId);
      const cast = pickCast(details.credits?.cast ?? []);
      const key_crew = pickKeyCrew(details.credits?.crew ?? []);
      const director =
        key_crew.find((r) => r.job === "Director")?.names[0] ?? null;
      return {
        ...existingMetadata,
        director,
        runtime: details.runtime,
        tagline: details.tagline || null,
        genres: details.genres.map((g) => g.name),
        // TMDb keywords double as themes — "post-apocalyptic", "robots",
        // "based on novel", etc.
        keywords:
          details.keywords?.keywords?.map((k) => k.name) ?? [],
        cast,
        key_crew,
        production_companies: pickProductionCompanies(
          details.production_companies
        ),
        production_countries: (details.production_countries ?? []).map((c) => ({
          code: c.iso_3166_1,
          name: c.name,
        })),
        spoken_languages: (details.spoken_languages ?? []).map(
          (l) => l.english_name
        ),
        release_dates: pickReleaseDates(details.release_dates?.results),
        alternative_titles: pickAlternativeTitles(
          details.alternative_titles?.titles
        ),
      };
    } catch {
      return null;
    }
  }

  if (mediaType === "tv_show") {
    try {
      const details = await getTVDetails(tmdbId);
      const today = new Date().toISOString().split("T")[0];
      const allSeasons = details.seasons ?? [];
      // Aired = real season number, has an air_date in the past, with at
      // least one episode listed. Anything else is either a "specials"
      // season (number 0), a placeholder (no air_date), or future content.
      const aired = allSeasons.filter(
        (s) =>
          s.season_number > 0 &&
          s.episode_count > 0 &&
          s.air_date !== null &&
          s.air_date <= today
      );
      // Upcoming = announced with a future air_date. We keep these out of
      // season counts and the log-modal pickers, then surface them as a
      // separate callout.
      const upcoming = allSeasons
        .filter(
          (s) =>
            s.season_number > 0 &&
            s.air_date !== null &&
            s.air_date > today
        )
        .sort((a, b) => (a.air_date! < b.air_date! ? -1 : 1))
        .map((s) => ({
          season_number: s.season_number,
          name: s.name,
          air_date: s.air_date,
          episode_count: s.episode_count,
          poster_path: s.poster_path,
        }));

      const realSeasons = aired.length;
      // Per-season episode counts: { "1": 9, "2": 10 }
      const seasonEpisodes: Record<string, number> = {};
      for (const s of aired) {
        seasonEpisodes[String(s.season_number)] = s.episode_count;
      }
      // Full per-season detail for the "Seasons" tab — poster, synopsis,
      // episode count, air date.
      const seasonDetails = aired.map((s) => ({
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count,
        air_date: s.air_date,
        poster_path: s.poster_path,
        overview: s.overview || null,
      }));
      return {
        ...existingMetadata,
        creator: details.created_by.map((c) => c.name).join(", ") || null,
        seasons: realSeasons,
        number_of_seasons: realSeasons,
        number_of_episodes: details.number_of_episodes,
        season_episodes: seasonEpisodes,
        season_details: seasonDetails,
        upcoming_seasons: upcoming,
        tagline: details.tagline || null,
        genres: details.genres.map((g) => g.name),
        // TV's keywords endpoint nests under `.results` instead of `.keywords`.
        keywords:
          details.keywords?.results?.map((k) => k.name) ?? [],
        status: details.status,
        cast: pickCast(details.credits?.cast ?? []),
        key_crew: pickKeyCrew(details.credits?.crew ?? []),
        // TV gets `networks` (the broadcaster) AND `production_companies`
        // (the studio that made it). Both render as separate sections.
        networks: pickProductionCompanies(details.networks),
        production_companies: pickProductionCompanies(
          details.production_companies
        ),
        production_countries: (details.production_countries ?? []).map((c) => ({
          code: c.iso_3166_1,
          name: c.name,
        })),
        spoken_languages: (details.spoken_languages ?? []).map(
          (l) => l.english_name
        ),
        // TV's alternative_titles uses `results` instead of `titles`.
        alternative_titles: pickAlternativeTitles(
          details.alternative_titles?.results
        ),
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Lenient title-equality check used when verifying that a "canonical
 * edition" lookup returned the same book the user clicked on. Strips
 * subtitles (after `:`), parentheticals, and punctuation, so:
 *   "Assassin's Apprentice"             ↔ "Assassin's Apprentice: A Novel"  ✓
 *   "Mistborn"                          ↔ "Mistborn (Mistborn, #1)"          ✓
 *   "Assassin's Apprentice"             ↔ "Assassin's Apprentice Volume 2"   ✗
 *   "Assassin's Apprentice (Graphic..)" ↔ "Assassin's Apprentice"            ✓
 */
function bookTitlesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .split(/[:(]/)[0]
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

/**
 * Books are the only media type without a single-vendor canonical source —
 * Google Books is best for covers/descriptions/search, Open Library is
 * best for bibliographies/author bios. We bridge both by storing all
 * three identifiers (`google_books_id`, `isbn_13`, `openlibrary_work_id`)
 * on every book row, so a card surfaced from any source can match the
 * same library entry.
 *
 * Returns a merged external_ids object with whatever new identifiers
 * could be resolved, or null if no progress was made (no ISBN reachable).
 */
async function enrichBookCrossReferences(
  externalIds: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const hasOL = typeof externalIds.openlibrary_work_id === "string";
  const hasISBN = typeof externalIds.isbn_13 === "string";
  const hasGB = typeof externalIds.google_books_id === "string";
  if (hasOL && hasISBN && hasGB) return null;

  let isbn = externalIds.isbn_13 as string | undefined;
  const gbId = externalIds.google_books_id as string | undefined;

  // ISBN backfill — older rows were inserted before we extracted it.
  if (!isbn && gbId) {
    try {
      const volume = await getBookDetails(gbId);
      isbn = volume.volumeInfo.industryIdentifiers?.find(
        (id) => id.type === "ISBN_13"
      )?.identifier;
    } catch {
      // fall through — without ISBN we can't bridge to OL.
    }
  }

  let olWorkId = externalIds.openlibrary_work_id as string | undefined;
  if (!olWorkId && isbn) {
    olWorkId = (await findWorkByISBN(isbn)) ?? undefined;
  }

  // Resolve a Google Books id from ISBN when missing — important for
  // Hardcover-sourced rows that arrive without one. Lets the standard
  // Google-Books-keyed search flow find the same row later.
  let resolvedGbId = gbId;
  if (!resolvedGbId && isbn) {
    try {
      const volume = await findVolumeByISBN(isbn);
      if (volume) resolvedGbId = volume.id;
    } catch {
      // best-effort
    }
  }

  if (!isbn && !olWorkId && !resolvedGbId) return null;

  return {
    ...externalIds,
    ...(isbn ? { isbn_13: isbn } : {}),
    ...(olWorkId ? { openlibrary_work_id: olWorkId } : {}),
    ...(resolvedGbId ? { google_books_id: resolvedGbId } : {}),
  };
}

/**
 * Resolve an Open Library work id to a full SearchResult by going
 * OL work → ISBN → Google Books volume → normalize. Used when a user
 * clicks an unmatched card on an author page (where the only identifier
 * we have is the OL work id) and needs a complete media_items row.
 *
 * Returns null when the OL work has no ISBN or Google Books has no
 * matching volume — those rare cases fall through to a Google Books
 * title/author search as a last resort.
 */
/**
 * Sanity-check that a resolved GB volume actually matches the author we
 * thought we were resolving. Defends against OL data contamination —
 * e.g. OL26627585W is "Red Rising" by Renee Joiner but its editions
 * list contains Pierce Brown's ISBNs, so an ISBN lookup returns Pierce
 * Brown's volume. Without this check we'd land the user on the wrong
 * book entirely.
 *
 * Loose substring match in either direction so "Pierce Brown" matches
 * "P. Brown" or "Pierce Brown Jr." and "Christopher Ruocchio" matches
 * either order. False negatives here are safer than false positives —
 * if we reject, the upsert falls through to OL-only data.
 */
function gbVolumeMatchesAuthor(
  volume: GoogleBooksVolume,
  expectedAuthor: string
): boolean {
  const expected = expectedAuthor.toLowerCase().trim();
  if (!expected) return true; // no expectation → pass
  const actual = volume.volumeInfo.authors ?? [];
  if (actual.length === 0) return false; // no GB authors → can't verify
  return actual.some((a) => {
    const got = a.toLowerCase().trim();
    return got.includes(expected) || expected.includes(got);
  });
}

/**
 * Detect that a GB volume is a multi-book bundle / boxed set / omnibus.
 *
 * OL works often list a bundle's ISBN among their editions, so when we
 * resolve the work to a GB volume by ISBN, we sometimes land on the
 * bundle. Adopting its description gives the user a "first three novels
 * of the series" blurb on what should be a single-book page. Reject
 * bundles so the resolver falls through to a clean title+author lookup
 * (or to OL-only data when GB has nothing else).
 *
 * Signals checked: bundle markers in title/subtitle, "this bundle..."
 * descriptions, and obviously over-padded page counts (>1500). Single
 * fantasy doorstoppers can hit 1000+ pages so we keep the threshold
 * conservative.
 */
function gbVolumeIsBundle(volume: GoogleBooksVolume): boolean {
  const info = volume.volumeInfo;
  const text = `${info.title} ${info.subtitle ?? ""}`.toLowerCase();
  const desc = (info.description ?? "").toLowerCase();
  if ((info.pageCount ?? 0) > 1500) return true;
  if (
    /\b(bundle|boxed?\s*set|omnibus|complete\s+(series|trilogy|saga))\b/.test(
      text
    )
  ) {
    return true;
  }
  if (
    /^this (bundle|ebundle|discounted|set|collection includes|set includes)/.test(
      desc
    )
  ) {
    return true;
  }
  if (/\b\d+[-\s]?books?\s+(bundle|set|collection|omnibus)\b/.test(text)) {
    return true;
  }
  return false;
}

/**
 * A GB volume is a "stub" when GB has the ISBN indexed but doesn't have
 * the rich metadata — no cover image, no description. Stubs leak in
 * when an OL ISBN happens to match an under-populated GB record. We
 * want to fall through to a different resolution path rather than
 * adopt a stub as the canonical record (which gives the user no cover
 * and no blurb).
 */
function gbVolumeIsStub(volume: GoogleBooksVolume): boolean {
  const info = volume.volumeInfo;
  const hasCover = !!info.imageLinks?.thumbnail;
  const hasDesc = (info.description?.length ?? 0) > 0;
  return !hasCover && !hasDesc;
}

/**
 * Try a GB volume against author + bundle + stub gates. Returns a
 * normalized SearchResult with the OL work id stamped in, or null when
 * any gate rejects.
 */
function tryAcceptGBVolume(
  volume: GoogleBooksVolume | null,
  workId: string,
  fallbackAuthor: string | undefined
): SearchResult | null {
  if (!volume) return null;
  const matchesAuthor =
    !fallbackAuthor || gbVolumeMatchesAuthor(volume, fallbackAuthor);
  if (!matchesAuthor || gbVolumeIsBundle(volume) || gbVolumeIsStub(volume)) {
    return null;
  }
  const sr = normalizeGoogleBook(volume);
  sr.external_ids = {
    ...sr.external_ids,
    openlibrary_work_id: workId,
  };
  return sr;
}

async function resolveOLWorkToBook(
  workId: string,
  fallbackTitle?: string,
  fallbackAuthor?: string,
  /** ISBN already attached to the search result (from OL search doc).
      Tried first because it's typically OL's best-guess primary edition,
      whereas `findISBNForWork` picks the first English edition from the
      work's editions endpoint, which can differ. */
  searchResultIsbn?: string
): Promise<SearchResult | null> {
  // Path 1 — SR's own ISBN. Most likely to point at a real GB volume
  // because OL's search ranking already picked it as the work's primary
  // edition.
  if (searchResultIsbn) {
    const v = await findVolumeByISBN(searchResultIsbn);
    const accepted = tryAcceptGBVolume(v, workId, fallbackAuthor);
    if (accepted) return accepted;
  }

  // Path 2 — the work's editions endpoint. May pick a different ISBN
  // than the search doc.
  const editionIsbn = await findISBNForWork(`/works/${workId}`);
  if (editionIsbn && editionIsbn !== searchResultIsbn) {
    const v = await findVolumeByISBN(editionIsbn);
    const accepted = tryAcceptGBVolume(v, workId, fallbackAuthor);
    if (accepted) return accepted;
  }

  // Path 3 — title+author canonical edition search. Best when the OL
  // ISBNs aren't indexed by GB. The strict filters in
  // findCanonicalBookEdition reject bundles, graphic novels, and
  // special editions so the actual book wins the ranking.
  if (fallbackTitle && fallbackAuthor) {
    const v = await findCanonicalBookEdition(fallbackTitle, fallbackAuthor);
    const accepted = tryAcceptGBVolume(v, workId, fallbackAuthor);
    if (accepted) return accepted;
  }

  return null;
}

/**
 * Detect the series a book belongs to. Sources tried in order:
 *
 *   1. **Wikidata** — most reliable when present (structured properties
 *      P179 part-of-series + P1545 series-ordinal verified by editors).
 *      Also provides the only signal we trust for `series_status`
 *      (P582 end-time → "complete"). Coverage skews to head-of-tail:
 *      excellent for popular genre fiction, sparse for indie titles.
 *   2. **Google Books `seriesInfo`** — fetched from the volume detail
 *      endpoint. Stable id but only set for publisher-partnered titles.
 *   3. **OpenLibrary editions** — most OL series data lives on edition
 *      records, not works. We parse all editions' `series` strings and
 *      vote on the canonical name. Best coverage for the long tail.
 *   4. **OpenLibrary work-level** — rare last-resort fallback.
 *
 * Returns null when no source resolves. Caller leaves the row's
 * existing series_* fields alone in that case, so a previously-detected
 * series isn't blanked out by a transient API failure.
 */
async function enrichBookSeries(
  externalIds: Record<string, unknown>,
  /** Title + first-author for the Wikidata title-search fallback.
      Wikidata can't be queried by ISBN alone reliably (Wikidata models
      works rather than editions, so ISBN coverage is sparse). */
  titleHint?: string,
  authorHint?: string
): Promise<{
  id: string;
  name: string | null;
  position: number | null;
  status: "complete" | null;
} | null> {
  // Source 1 — Wikidata. Tried first because when present it gives us
  // ALL fields (id + name + position + status) in one source, while
  // GB/OL only give the first three.
  if (titleHint && authorHint) {
    try {
      const wd = await findBookSeriesOnWikidata(titleHint, authorHint);
      if (wd) {
        return {
          id: `wd:${wd.seriesQid}`,
          name: wd.seriesName || null,
          position: wd.position,
          status: wd.status,
        };
      }
    } catch {
      // fall through to GB
    }
  }

  // Source 2 — Google Books
  const gbId = externalIds.google_books_id as string | undefined;
  if (gbId) {
    try {
      const volume = await getBookDetails(gbId);
      const seriesEntry = volume.volumeInfo.seriesInfo?.volumeSeries?.[0];
      if (seriesEntry?.seriesId) {
        const id = `gb:${seriesEntry.seriesId}`;
        const positionRaw =
          seriesEntry.orderNumber ??
          (volume.volumeInfo.seriesInfo?.bookDisplayNumber
            ? Number(volume.volumeInfo.seriesInfo.bookDisplayNumber)
            : null);
        const position =
          typeof positionRaw === "number" && Number.isFinite(positionRaw)
            ? Math.floor(positionRaw)
            : null;
        // Best-effort name fetch. Failure is fine — the id is the
        // dedup key, the name only drives display.
        const name = await getSeriesName(seriesEntry.seriesId);
        return { id, name, position, status: null };
      }
    } catch {
      // fall through to OL
    }
  }

  // Source 3 — Open Library editions. Most OL series data lives on
  // individual editions (not the work itself), so we fetch a sample of
  // editions and merge their `series` fields. Verified manually: e.g.
  // Empire of Silence's editions yield "Sun eater -- Book one" while
  // its work has nothing.
  const olWorkId = externalIds.openlibrary_work_id as string | undefined;
  if (olWorkId) {
    try {
      const editions = await getWorkEditions(olWorkId, 30);
      const editionsMatch = extractSeriesFromEditions(editions);
      if (editionsMatch) {
        return {
          id: editionsMatch.id,
          name: editionsMatch.name,
          position: editionsMatch.position,
          status: null,
        };
      }
    } catch {
      // fall through to work-level lookup
    }

    // Source 4 — Work-level OL fallback. Rarely populated but cheap
    // to check given we're already in the OL section.
    try {
      const work = await getWorkByOlid(olWorkId);
      if (work) {
        const match = extractSeriesFromWork(work);
        if (match) {
          return {
            id: match.id,
            name: match.name,
            position: match.position,
            status: null,
          };
        }
      }
    } catch {
      // give up — no series detected
    }
  }

  return null;
}

/**
 * Find the immediately-following book in a series, given the current
 * book. Returns null when the current book has no series, no siblings,
 * or is already the last entry in the series.
 *
 * Mirrors the ordering rule used by the media detail page's series
 * graph: prefer explicit `series_position` when every sibling has one,
 * otherwise sort by `release_date` (1-based index). That keeps the
 * "next book" suggestion consistent with what the user sees on the
 * detail page graph and with the displayed "Book N" label.
 */
export async function getNextBookInSeries(
  currentMediaId: string
): Promise<{
  id: string;
  title: string;
  cover_image_url: string | null;
  release_date: string | null;
} | null> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("media_items")
    .select("id, series_id")
    .eq("id", currentMediaId)
    .eq("media_type", "book")
    .maybeSingle();
  if (!current?.series_id) return null;

  const { data: siblings } = await supabase
    .from("media_items")
    .select("id, title, cover_image_url, series_position, release_date")
    .eq("series_id", current.series_id)
    .order("series_position", { ascending: true, nullsFirst: false });
  const rows = (siblings ?? []) as {
    id: string;
    title: string;
    cover_image_url: string | null;
    series_position: number | null;
    release_date: string | null;
  }[];
  if (rows.length < 2) return null;

  const allHaveExplicit = rows.every((r) => r.series_position != null);
  const sorted = allHaveExplicit
    ? [...rows].sort(
        (a, b) => (a.series_position ?? 0) - (b.series_position ?? 0)
      )
    : [...rows].sort((a, b) =>
        (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999")
      );

  const idx = sorted.findIndex((b) => b.id === currentMediaId);
  if (idx < 0 || idx >= sorted.length - 1) return null;
  const next = sorted[idx + 1];
  return {
    id: next.id,
    title: next.title,
    cover_image_url: next.cover_image_url,
    release_date: next.release_date,
  };
}

/**
 * Re-fetch from IGDB and merge in the new {id,name} company shape.
 * Old rows stored `developers` as a flat string[] which can't be linked
 * to entity pages — re-normalizing through the current pipeline upgrades
 * them in place.
 */
async function enrichIGDBMetadata(
  externalIds: Record<string, string | number>,
  existingMetadata: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const igdbId = externalIds.igdb_id as number | undefined;
  if (!igdbId) return null;
  try {
    const game = await getGameDetails(igdbId);
    if (!game) return null;
    const fresh = normalizeIGDBGame(game);
    return {
      ...existingMetadata,
      ...(fresh.metadata ?? {}),
    };
  } catch {
    return null;
  }
}

/**
 * Returns true when a row's stored metadata is missing fields that the
 * current enrichment pipeline produces. Shared between `upsertMediaItem`
 * (insert/track flow) and `ensureMediaItemEnriched` (detail-page lazy
 * refresh) so both paths use the same staleness criteria.
 */
function isMetadataStale(
  mediaType: string,
  meta: Record<string, unknown> | null
): boolean {
  // upcoming_seasons lacked poster_path before the schema bump — detect
  // older entries so they get re-fetched with the new field.
  const upcomingArr = meta?.upcoming_seasons as
    | Array<Record<string, unknown>>
    | undefined;
  const upcomingMissingPoster =
    Array.isArray(upcomingArr) &&
    upcomingArr.length > 0 &&
    !("poster_path" in upcomingArr[0]);

  // Cast didn't carry tmdb_id originally — needed for /person links.
  const castArr = meta?.cast as Array<Record<string, unknown>> | undefined;
  const castMissingId =
    Array.isArray(castArr) &&
    castArr.length > 0 &&
    !("tmdb_id" in castArr[0]);

  if (mediaType === "movie") {
    return (
      !meta?.director ||
      meta?.tagline === undefined ||
      meta?.cast === undefined ||
      meta?.keywords === undefined ||
      castMissingId
    );
  }
  if (mediaType === "tv_show") {
    return (
      !meta?.creator ||
      !meta?.season_episodes ||
      meta?.tagline === undefined ||
      meta?.cast === undefined ||
      meta?.upcoming_seasons === undefined ||
      meta?.season_details === undefined ||
      meta?.keywords === undefined ||
      upcomingMissingPoster ||
      castMissingId
    );
  }
  if (mediaType === "video_game") {
    // Old rows stored `developers` as string[]. New shape is {id,name}[]
    // so the entity page can link by company id.
    const devs = meta?.developers as unknown[] | undefined;
    const devsAreStrings =
      Array.isArray(devs) && devs.length > 0 && typeof devs[0] === "string";
    return devsAreStrings || meta?.publishers === undefined;
  }
  return false;
}

/**
 * Lazy-refresh a media item's metadata if it's stale. Returns the
 * (possibly updated) metadata blob. Safe to call on every detail-page
 * load — the staleness check short-circuits when the row is current.
 *
 * Doesn't require auth — the row update relies on RLS allowing writes
 * to media_items (which is a globally-shared table). If RLS blocks the
 * update we silently return the original metadata.
 */
export async function ensureMediaItemEnriched(
  mediaId: string,
  /** Optional pre-built supabase client. Required when called from
      Next.js `after()` callbacks — cookies() can't be invoked inside
      `after()`, so the caller must construct the client up-front. */
  preBuiltSupabase?: Awaited<ReturnType<typeof createClient>>
): Promise<Record<string, unknown> | null> {
  const supabase = preBuiltSupabase ?? (await createClient());
  const { data } = await supabase
    .from("media_items")
    .select(
      "media_type, metadata, external_ids, title, series_id, series_name, series_position, series_status, release_date"
    )
    .eq("id", mediaId)
    .single();
  if (!data) return null;

  const meta = (data.metadata as Record<string, unknown> | null) ?? null;
  const externalIds =
    (data.external_ids as Record<string, unknown> | null) ?? null;
  const rowTitle = data.title as string | null;
  const rowFirstAuthor =
    (meta?.authors as string[] | undefined)?.[0] ?? undefined;
  const rowSeriesId = data.series_id as string | null | undefined;
  const rowReleaseDate = data.release_date as string | null;

  // Books take a separate enrichment path — no TMDb/IGDB metadata to
  // refresh, but they may need cross-reference identifiers backfilled
  // and series tagging populated from Wikidata / GB / OL.
  //
  // Each sub-task has its own early-out so we don't redundantly hit
  // upstream APIs on every page render. A row with `series_id` set
  // already has its series detected; a row whose `metadata.gb_average_
  // rating` is not undefined already has the GB rating cached. Without
  // these guards, a render loop on the page would hammer Wikidata /
  // OL / GB and Supabase auth.
  if (data.media_type === "book") {
    if (!externalIds) return meta;
    try {
      // Cross-references: only run when at least one of the three
      // identifiers is missing. `enrichBookCrossReferences` itself
      // checks this but the outer guard avoids the function-call
      // overhead.
      const hasOL = typeof externalIds.openlibrary_work_id === "string";
      const hasISBN = typeof externalIds.isbn_13 === "string";
      const hasGB = typeof externalIds.google_books_id === "string";
      const enrichedIds =
        hasOL && hasISBN && hasGB
          ? null
          : await enrichBookCrossReferences(externalIds);
      const idsForSeriesLookup = (enrichedIds ?? externalIds) as Record<
        string,
        unknown
      >;

      // Series detection — skip entirely when the row is already tagged.
      // Users can force re-detection by clearing series_id manually
      // (UPDATE media_items SET series_id = NULL WHERE id = ...).
      const wikidataTitleHint = rowTitle?.split(":")[0]?.trim() ?? undefined;
      const series = rowSeriesId
        ? null
        : await enrichBookSeries(
            idsForSeriesLookup,
            wikidataTitleHint,
            rowFirstAuthor
          );

      // GB volume detail fetch — single call that backfills two
      // separate things:
      //   1. The `gb_average_rating` / `gb_ratings_count` cache used
      //      by the series-graph rating fallback.
      //   2. Missing fields the search-results API doesn't return.
      //      Most notably `pageCount`: the search endpoint serves a
      //      "lite" record that drops pageCount and a few other
      //      fields, while the detail endpoint includes them. Books
      //      added via search-bar pick land here with page_count=0
      //      until enrichment runs.
      //
      // Skip when we have nothing to gain (rating cached AND page
      // count already populated) so we don't make a redundant call.
      const gbId = idsForSeriesLookup.google_books_id as string | undefined;
      const hasGBRatingCached =
        meta != null && "gb_average_rating" in meta;
      const currentPageCount =
        typeof meta?.page_count === "number" ? meta.page_count : 0;
      const needsPageCount = currentPageCount <= 0;
      let metadataPatch: Record<string, unknown> | null = null;
      if (gbId && (!hasGBRatingCached || needsPageCount)) {
        try {
          const volume = await getBookDetails(gbId);
          const patch: Record<string, unknown> = {};
          if (!hasGBRatingCached) {
            const avg = volume.volumeInfo.averageRating;
            const cnt = volume.volumeInfo.ratingsCount;
            if (typeof avg === "number" || typeof cnt === "number") {
              patch.gb_average_rating = avg ?? null;
              patch.gb_ratings_count = cnt ?? null;
            }
          }
          if (needsPageCount) {
            const pc = volume.volumeInfo.pageCount;
            if (typeof pc === "number" && pc > 0) {
              patch.page_count = pc;
            }
          }
          if (Object.keys(patch).length > 0) {
            metadataPatch = patch;
          }
        } catch {
          // Non-fatal — the row keeps existing metadata.
        }
      }

      // Original publication date — Google Books returns the picked
      // VOLUME's publishedDate, which is the printing year (e.g. the
      // 2010 Mistborn paperback). Two sources, in priority order, that
      // give us the original year instead:
      //
      //   1. Wikidata P577 — most accurate when set. Doesn't require
      //      the series link (P179) like our series lookup does, so
      //      catches popular books even when the series scaffolding
      //      hasn't been edited in.
      //   2. OpenLibrary work-level `first_publish_date` — patchy and
      //      sometimes wrong (Mistborn says 2001 on OL), but a useful
      //      fallback for books not on Wikidata.
      //
      // We only overwrite when the candidate year is EARLIER than
      // what's stored — filters out source errors where a work has
      // the wrong year set in either system.
      const olWorkId = idsForSeriesLookup.openlibrary_work_id as
        | string
        | undefined;
      // Use yearFromDateString rather than Date parsing to dodge the
      // local-timezone year-flip on negative-UTC servers.
      const currentYear = yearFromDateString(rowReleaseDate);
      let originalReleaseDate: string | null = null;

      // Source 1 — Wikidata
      if (rowTitle && rowFirstAuthor) {
        try {
          const wdYear = await findBookPublicationYearOnWikidata(
            rowTitle.split(":")[0].trim(),
            rowFirstAuthor
          );
          if (
            wdYear != null &&
            (currentYear == null || wdYear < currentYear)
          ) {
            originalReleaseDate = `${wdYear}-01-01`;
          }
        } catch {
          // fall through to OL
        }
      }

      // Source 2 — OpenLibrary work-level fallback
      if (!originalReleaseDate && olWorkId) {
        try {
          const work = await getWorkByOlid(olWorkId);
          const fp = work?.first_publish_date;
          if (fp) {
            const yearMatch = fp.match(/\b(\d{4})\b/);
            if (yearMatch) {
              const olYear = Number(yearMatch[1]);
              if (
                Number.isFinite(olYear) &&
                (currentYear == null || olYear < currentYear)
              ) {
                originalReleaseDate = `${olYear}-01-01`;
              }
            }
          }
        } catch {
          // Non-fatal — keep existing release_date.
        }
      }

      const updates: Record<string, unknown> = {};
      if (enrichedIds) updates.external_ids = enrichedIds;
      if (series) {
        updates.series_id = series.id;
        updates.series_name = series.name;
        updates.series_position = series.position;
        // Only Wikidata returns a non-null status; for GB / OL paths
        // this stays null and we don't overwrite a previously-detected
        // status (which can only have come from Wikidata).
        if (series.status != null) {
          updates.series_status = series.status;
        }
      }
      if (metadataPatch) {
        updates.metadata = { ...(meta ?? {}), ...metadataPatch };
      }
      if (originalReleaseDate) {
        updates.release_date = originalReleaseDate;
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("media_items")
          .update(updates)
          .eq("id", mediaId);
      }
    } catch {
      // Non-fatal — the row stays as-is and we'll retry on the next visit.
    }
    return meta;
  }

  if (!isMetadataStale(data.media_type, meta)) return meta;
  if (!externalIds) return meta;

  try {
    const enriched =
      data.media_type === "video_game"
        ? await enrichIGDBMetadata(
            externalIds as Record<string, string | number>,
            meta ?? {}
          )
        : await enrichTMDBMetadata(
            data.media_type,
            externalIds as Record<string, string | number>,
            meta ?? {}
          );
    if (!enriched) return meta;
    await supabase
      .from("media_items")
      .update({ metadata: enriched })
      .eq("id", mediaId);
    return enriched;
  } catch {
    return meta;
  }
}

export async function upsertMediaItem(
  result: SearchResult
): Promise<string> {
  const { supabase } = await getAuthUser();

  // For books, upgrade to the canonical English edition before any DB work.
  // Google's pool for broad searches (e.g. "Mistborn") may only surface
  // inferior editions; a targeted title+author query reliably finds the
  // canonical one, giving us consistent data regardless of how the user
  // discovered the book.
  if (result.media_type === "book") {
    // OL-only input (from an author page click): resolve to a Google
    // Books volume first so we have cover/description/page-count data.
    if (
      result.external_ids.openlibrary_work_id &&
      !result.external_ids.google_books_id
    ) {
      const authors = (result.metadata as Record<string, unknown> | null)
        ?.authors as string[] | undefined;
      const olWorkId = String(result.external_ids.openlibrary_work_id);
      const srIsbn = result.external_ids.isbn_13 as string | undefined;
      const resolved = await resolveOLWorkToBook(
        olWorkId,
        result.title,
        authors?.[0],
        srIsbn
      );
      if (resolved) {
        // Merge: adopt GB's identifiers + description + page count +
        // cover (GB's covers are usually the canonical English edition,
        // which is what we want to show — OL's `cover_i` for a work
        // sometimes points at a non-English edition like the Spanish
        // "Amanecer Rojo" cover for Pierce Brown's Red Rising). Keep
        // the OL search result's title because OL works are
        // edition-agnostic and have cleaner titles than GB's per-
        // edition records ("Red Rising" vs "Red Rising: A Novel").
        // After the first click the row is stored, and subsequent
        // searches surface the stored GB cover via
        // applyStoredCoverOverrides — consistent for the rest of the
        // session.
        result = {
          ...resolved,
          title: result.title,
          release_date: result.release_date ?? resolved.release_date,
        };
      }
      // If we couldn't resolve, the row will still upsert with OL-only
      // identifiers — better than nothing.
    }

    const authors = (result.metadata as Record<string, unknown> | null)
      ?.authors as string[] | undefined;
    const firstAuthor = authors?.[0];

    // Only re-canonicalize when the input clearly *needs* it. Search
    // results from /api/search go through our own scoring layer that
    // already picks a canonical edition; re-running findCanonicalBook-
    // Edition here can return a *different* book that happens to score
    // higher (e.g. a graphic-novel adaptation outscoring the original
    // novel), which then misroutes the user. Skip if we already have
    // enough signals that the input is a real edition.
    const meta = (result.metadata as Record<string, unknown> | null) ?? {};
    const inputHasReliableData =
      !!result.external_ids.isbn_13 ||
      ((result.description?.length ?? 0) >= 200 &&
        !!result.cover_image_url &&
        typeof meta.page_count === "number" &&
        (meta.page_count as number) > 0);

    if (
      firstAuthor &&
      result.external_ids.google_books_id &&
      !inputHasReliableData
    ) {
      const canonical = await findCanonicalBookEdition(result.title, firstAuthor);
      // Defense-in-depth: only swap to the canonical when its main
      // title (before any subtitle / parenthetical) actually matches
      // the input. Google's `intitle:` is fuzzy and can return books
      // whose title merely *contains* the query.
      if (canonical && bookTitlesMatch(result.title, canonical.volumeInfo.title)) {
        const renormalized = normalizeGoogleBook(canonical);
        const olWorkId = result.external_ids.openlibrary_work_id;
        if (olWorkId) {
          renormalized.external_ids = {
            ...renormalized.external_ids,
            openlibrary_work_id: olWorkId,
          };
        }
        result = renormalized;
      }
    }

    // Final cross-reference pass: ensure isbn_13 → openlibrary_work_id
    // is filled in when missing. Cheap if both are already there.
    const enrichedIds = await enrichBookCrossReferences(
      result.external_ids as Record<string, unknown>
    );
    if (enrichedIds) {
      result = {
        ...result,
        external_ids: enrichedIds as Record<string, string | number>,
      };
    }
  }

  // Check if media already exists. We iterate every external id we have
  // because rows may have been keyed by a different identifier in the
  // past (e.g. an existing book has `google_books_id`; we're now adding
  // it via Hardcover and want the row to match through `isbn_13`).
  let existing: {
    id: string;
    metadata: unknown;
    cover_image_url: string | null;
    backdrop_url: string | null;
    external_ids: unknown;
  } | null = null;
  for (const [key, value] of Object.entries(result.external_ids)) {
    const { data } = await supabase
      .from("media_items")
      .select("id, metadata, cover_image_url, backdrop_url, external_ids")
      .contains("external_ids", { [key]: value })
      .limit(1)
      .maybeSingle();
    if (data) {
      existing = data;
      break;
    }
  }

  // Book-only fallback: if no external id matched, look up by exact
  // title + first author. Different Google Books editions of the same
  // book have different gbid AND different isbn but identical title +
  // author — without this, the search-bar pick path can create a
  // duplicate alongside an author-page-resolved row. Mirrors the same
  // fallback used inside `resolveAndCacheBookFromOLWork` so every
  // book-insert path enforces the same dedup rules.
  let matchedByTitleAuthor = false;
  if (!existing && result.media_type === "book") {
    const authors = (result.metadata as Record<string, unknown> | null)
      ?.authors as string[] | undefined;
    const firstAuthor = authors?.[0];
    if (firstAuthor) {
      const { data } = await supabase
        .from("media_items")
        .select("id, metadata, cover_image_url, backdrop_url, external_ids")
        .eq("media_type", "book")
        .eq("title", result.title)
        .contains("metadata", { authors: [firstAuthor] })
        .limit(1)
        .maybeSingle();
      if (data) {
        existing = data;
        matchedByTitleAuthor = true;
      }
    }
  }

  if (existing) {
    // Re-enrich if metadata is missing key fields (director, genres, etc.)
    const meta = existing.metadata as Record<string, unknown> | null;
    const needsEnrichment = isMetadataStale(result.media_type, meta);

    const updates: Record<string, unknown> = {};

    // Merge any newly-resolved identifiers into the existing row's
    // external_ids. Books pick up `isbn_13` and `openlibrary_work_id`
    // here when first surfaced via an author page or search.
    //
    // Merge order depends on how we matched:
    //   - Matched via shared external id: new wins on conflict (we
    //     trust the latest input; missing keys still flow in).
    //   - Matched via title+author fallback: existing wins on
    //     conflict, only NEW keys flow in. The new input is from a
    //     different edition (different gbid/isbn) — overwriting would
    //     destroy the existing row's canonical identifier mapping.
    const existingExt =
      (existing.external_ids as Record<string, unknown> | null) ?? {};
    const mergedExt = matchedByTitleAuthor
      ? { ...result.external_ids, ...existingExt }
      : { ...existingExt, ...result.external_ids };
    const extChanged = Object.keys(mergedExt).some(
      (k) => existingExt[k] !== mergedExt[k]
    );
    if (extChanged) {
      updates.external_ids = mergedExt;
    }

    if (needsEnrichment) {
      const enriched =
        result.media_type === "video_game"
          ? await enrichIGDBMetadata(result.external_ids, meta ?? {})
          : await enrichTMDBMetadata(
              result.media_type,
              result.external_ids,
              meta ?? {}
            );
      if (enriched) {
        updates.metadata = enriched;
      }
    }

    // Backfill cover if it's missing (e.g., was cleared by migration)
    if (!existing.cover_image_url && result.cover_image_url) {
      updates.cover_image_url = result.cover_image_url;
    }

    // Backfill / upgrade backdrop. Rows inserted before migration 014 have
    // null here; earlier inserts used TMDb's w1280 size. Either way, when
    // we need to (re)populate we now rank TMDb's /images list to get the
    // highest-voted, text-free backdrop — much better than the default.
    const existingIsLowRes =
      typeof existing.backdrop_url === "string" &&
      existing.backdrop_url.includes("/t/p/w1280/");
    const needsBackdrop = !existing.backdrop_url || existingIsLowRes;
    if (needsBackdrop && result.backdrop_url) {
      const tmdbId = result.external_ids.tmdb_id as number | undefined;
      const isTMDB =
        (result.media_type === "movie" || result.media_type === "tv_show") &&
        tmdbId != null;
      updates.backdrop_url = isTMDB
        ? await fetchBestTMDBBackdrop(
            result.media_type as "movie" | "tv_show",
            tmdbId!,
            result.backdrop_url
          )
        : result.backdrop_url;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("media_items").update(updates).eq("id", existing.id);
    }

    return existing.id;
  }

  // Enrich TMDB items (metadata + best backdrop) in parallel before inserting.
  const tmdbId = result.external_ids.tmdb_id as number | undefined;
  const isTMDB =
    (result.media_type === "movie" || result.media_type === "tv_show") &&
    tmdbId != null;
  const [enrichedMetadataResult, bestBackdrop] = await Promise.all([
    enrichTMDBMetadata(
      result.media_type,
      result.external_ids,
      result.metadata ?? {}
    ),
    isTMDB
      ? fetchBestTMDBBackdrop(
          result.media_type as "movie" | "tv_show",
          tmdbId!,
          result.backdrop_url
        )
      : Promise.resolve(result.backdrop_url),
  ]);
  const enrichedMetadata = enrichedMetadataResult ?? result.metadata ?? {};

  // Insert new media item
  const { data: inserted, error } = await supabase
    .from("media_items")
    .insert({
      media_type: result.media_type,
      title: result.title,
      description: result.description,
      cover_image_url: result.cover_image_url,
      backdrop_url: bestBackdrop,
      release_date: result.release_date,
      metadata: enrichedMetadata,
      external_ids: result.external_ids,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to insert media: ${error.message}`);
  return inserted.id;
}

export async function quickAddMedia(
  result: SearchResult
): Promise<{ mediaId: string; userMediaId: string }> {
  const { supabase, user } = await getAuthUser();

  const mediaId = await upsertMediaItem(result);

  // Check if user already tracks this item
  const { data: existing } = await supabase
    .from("user_media")
    .select("id")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .limit(1)
    .single();

  if (existing) return { mediaId, userMediaId: existing.id };

  // Create user_media row
  const { data: userMedia, error } = await supabase
    .from("user_media")
    .insert({
      user_id: user.id,
      media_id: mediaId,
      status: "want" as TrackingStatus,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to track media: ${error.message}`);

  await logActivity(supabase, user.id, mediaId, addedToShelfActivity("want"));

  return { mediaId, userMediaId: userMedia.id };
}

export async function trackMedia(
  mediaId: string,
  status: TrackingStatus,
  options?: {
    rating?: number | null;
    review?: string;
    is_favorite?: boolean;
    progress?: Record<string, unknown>;
    started_at?: string | null;
    completed_at?: string | null;
    /** Caller-supplied activity_type override (for TV episode/season logging). */
    activity_type_override?: string;
    /** Extra metadata fields merged into the activity row. */
    activity_metadata_extra?: Record<string, unknown>;
  }
): Promise<string> {
  const { supabase, user } = await getAuthUser();

  // Read the existing row first so we can tell a status-change action
  // apart from an add, and skip activity logging on pure metadata edits.
  const { data: prior } = await supabase
    .from("user_media")
    .select("status, progress, rating, review, is_favorite")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("user_media")
    .upsert(
      {
        user_id: user.id,
        media_id: mediaId,
        status,
        ...(options?.rating !== undefined ? { rating: options.rating } : {}),
        ...(options?.review !== undefined ? { review: options.review || null } : {}),
        ...(options?.is_favorite !== undefined ? { is_favorite: options.is_favorite } : {}),
        ...(options?.progress !== undefined ? { progress: options.progress } : {}),
        started_at: options?.started_at ?? (status === "in_progress" ? new Date().toISOString() : null),
        completed_at: options?.completed_at ?? (status === "completed" ? new Date().toISOString() : null),
      },
      { onConflict: "user_id,media_id" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Failed to track media: ${error.message}`);

  // Decide + log the activity via the shared @intertaind/types decision (the
  // single source shared with mobile: priority, the silent-edit "should I log?"
  // guards, and the metadata shape all live there).
  const draft = resolveTrackActivity({
    prior: prior
      ? {
          status: prior.status,
          rating: prior.rating,
          review: prior.review,
          is_favorite: prior.is_favorite ?? false,
          progress: (prior.progress as Record<string, unknown> | null) ?? null,
        }
      : null,
    status,
    rating: options?.rating,
    review: options?.review,
    is_favorite: options?.is_favorite,
    progress: (options?.progress as Record<string, unknown> | undefined) ?? null,
    override: options?.activity_type_override
      ? {
          activity_type: options.activity_type_override as ActivityType,
          metadata: options.activity_metadata_extra,
        }
      : undefined,
  });
  await logActivity(supabase, user.id, mediaId, draft);

  return data.id;
}

export async function updateTrackingStatus(
  userMediaId: string,
  status: TrackingStatus
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      ...(status === "in_progress" ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to update status: ${error.message}`);

  await logActivity(
    supabase,
    user.id,
    data.media_id,
    statusChangedActivity(status),
  );
}

export async function rateMedia(
  userMediaId: string,
  rating: number | null
): Promise<void> {
  if (rating !== null && (rating < 1 || rating > 10))
    throw new Error("Rating must be 1-10");

  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({ rating })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to rate: ${error.message}`);

  // rateActivity returns null for a *cleared* rating — nothing to log.
  await logActivity(supabase, user.id, data.media_id, rateActivity(rating));
}

export async function toggleFavorite(userMediaId: string): Promise<boolean> {
  const { supabase, user } = await getAuthUser();

  // Get current state + media_id for the activity log
  const { data: current } = await supabase
    .from("user_media")
    .select("is_favorite, media_id")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  if (!current) throw new Error("Tracking not found");

  const newValue = !current.is_favorite;

  const { error } = await supabase
    .from("user_media")
    .update({ is_favorite: newValue })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to toggle favorite: ${error.message}`);

  // favoriteActivity logs only the positive transition — unfavoriting is silent.
  await logActivity(
    supabase,
    user.id,
    current.media_id,
    favoriteActivity(newValue),
  );

  return newValue;
}

export async function reviewMedia(
  userMediaId: string,
  review: string
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error, data } = await supabase
    .from("user_media")
    .update({ review })
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("media_id")
    .single();

  if (error) throw new Error(`Failed to save review: ${error.message}`);

  await logActivity(supabase, user.id, data.media_id, reviewActivity(review));
}

export async function removeTracking(userMediaId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Read the row first so we can record what status it had.
  const { data: existing } = await supabase
    .from("user_media")
    .select("media_id, status")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  // .select() forces Postgres to return the deleted rows so we can verify
  // the delete actually happened — RLS blocks return success-with-0-rows,
  // which would otherwise look identical to a real delete from the client.
  const { data: deleted, error } = await supabase
    .from("user_media")
    .delete()
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(`Failed to remove tracking: ${error.message}`);
  if (!deleted || deleted.length === 0) {
    throw new Error(
      "Failed to remove tracking: nothing was deleted (likely an RLS policy issue)."
    );
  }

  if (existing) {
    await logActivity(
      supabase,
      user.id,
      existing.media_id,
      removeActivity(existing.status),
    );
  }
}

/**
 * Update just the current_page on a book's tracking row. Used by the
 * inline progress bar on the Reading shelf. Intentionally lightweight —
 * no activity log entry, no status change — a page bump isn't newsworthy.
 */
export async function updateBookPage(
  userMediaId: string,
  currentPage: number
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { data: current } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  const progress = (current?.progress as Record<string, unknown> | null) ?? {};
  progress.current_page = Math.max(0, Math.floor(currentPage));

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to update page: ${error.message}`);
}

/**
 * Re-run the Google Books resolution for a media_items row whose
 * `openlibrary_work_id` we already know, and overwrite the row's
 * cover/title/description/external_ids in place. Used to refresh cached
 * rows after we improve the edition-scoring heuristics.
 *
 * Skips rows that are tracked by anyone (preserves user state) and
 * rows that lack an `openlibrary_work_id` cross-reference.
 *
 * Returns true when the row was updated, false when there was nothing
 * to refresh.
 */
export async function reresolveBookFromOLWork(
  mediaId: string,
  authorName: string
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: row } = await supabase
    .from("media_items")
    .select("id, title, external_ids, metadata")
    .eq("id", mediaId)
    .eq("media_type", "book")
    .single();
  if (!row) return false;

  const ext = (row.external_ids as Record<string, unknown> | null) ?? {};
  const olWorkId = ext.openlibrary_work_id as string | undefined;
  if (!olWorkId) return false;

  const { findVolumeByTitleAndAuthor } = await import("@/lib/api/google-books");
  const cleanedTitle = row.title
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/,\s*(Vol\.?|Volume|Book|Bk\.)\s*\d+\s*$/i, "")
    .trim();
  const volume = await findVolumeByTitleAndAuthor(cleanedTitle, authorName);
  if (!volume) return false;
  if (
    volume.volumeInfo.language &&
    volume.volumeInfo.language !== "en"
  ) {
    return false;
  }

  const sr = normalizeGoogleBook(volume);
  const newExt = {
    ...ext, // preserve any cross-references we already collected
    ...sr.external_ids,
    openlibrary_work_id: olWorkId,
  };

  await supabase
    .from("media_items")
    .update({
      title: sr.title,
      description: sr.description,
      cover_image_url: sr.cover_image_url,
      release_date: sr.release_date,
      metadata: sr.metadata,
      external_ids: newExt,
    })
    .eq("id", mediaId);

  return true;
}

/**
 * Resolve an Open Library work to a media_items row, caching the result
 * permanently. Used by author pages so we make a single Google Books
 * API call per work *ever*, instead of per-render. Subsequent visits
 * (by anyone) hit the cached row.
 *
 * Returns the media_items row id, or null when the work can't be
 * resolved to an English Google Books volume.
 *
 * Auth-only: anonymous users can't write to media_items, so we only
 * cache when an authenticated viewer is the first to load the page.
 * Subsequent anonymous viewers benefit from the cached rows.
 */
export async function resolveAndCacheBookFromOLWork(
  olWorkId: string,
  workTitle: string,
  authorName: string
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already cached? Return the existing id with no API calls.
  const { data: existing } = await supabase
    .from("media_items")
    .select("id")
    .contains("external_ids", { openlibrary_work_id: olWorkId })
    .eq("media_type", "book")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  // No cached row. We need to call Google Books — but that requires
  // network IO and a write. Skip the write path for unauthenticated
  // viewers (RLS blocks the insert anyway).
  if (!user) return null;

  const cleanedTitle = workTitle
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/,\s*(Vol\.?|Volume|Book|Bk\.)\s*\d+\s*$/i, "")
    .trim();

  const { findVolumeByTitleAndAuthor } = await import("@/lib/api/google-books");
  const volume = await findVolumeByTitleAndAuthor(cleanedTitle, authorName);
  if (!volume) return null;
  if (
    volume.volumeInfo.language &&
    volume.volumeInfo.language !== "en"
  ) {
    return null;
  }

  const sr = normalizeGoogleBook(volume);
  sr.external_ids = {
    ...sr.external_ids,
    openlibrary_work_id: olWorkId,
  };

  // Use the same cross-reference enrichment as the user-driven upsert
  // path so the cached row has all available identifiers.
  const enrichedIds = await enrichBookCrossReferences(
    sr.external_ids as Record<string, unknown>
  );
  if (enrichedIds) {
    sr.external_ids = enrichedIds as Record<string, string | number>;
  }

  // SECOND cache check — by `google_books_id` or `isbn_13` this time.
  // The first check (above) only matches rows that already have
  // `openlibrary_work_id`. But many books were inserted via the
  // search-bar pick path, which only writes {google_books_id, isbn_13};
  // the OL work id gets backfilled later. Without this second pass,
  // every author-page visit would re-insert those books as duplicates.
  //
  // If we find an existing row, we UPDATE it to merge in the OL work
  // id (and any other identifiers we resolved) so the next visit hits
  // the fast OL-work-id path. Then return the existing id — no insert.
  const gbId = sr.external_ids.google_books_id as string | undefined;
  const isbn13 = sr.external_ids.isbn_13 as string | undefined;
  const titleForLookup = sr.title;
  const authorsArr = (sr.metadata as Record<string, unknown> | null)?.authors as
    | string[]
    | undefined;
  const firstAuthor = authorsArr?.[0];
  const existingByOtherId = await findExistingBookByIdentifiers(
    supabase,
    gbId,
    isbn13,
    titleForLookup,
    firstAuthor
  );
  if (existingByOtherId) {
    // Always use the existing row when matched by gbid/isbn — even if
    // its `openlibrary_work_id` differs from the one we're resolving.
    //
    // Why: OpenLibrary's catalog often has multiple distinct work IDs
    // pointing at what is, for our purposes, the same book (different
    // editions / data-entry duplicates / cataloging splits). Treating
    // them as different books would create duplicate `media_items`
    // rows, which is what we just fixed.
    //
    // Merge order: spread `sr.external_ids` FIRST so the existing row's
    // identifiers WIN. We don't overwrite the existing OL work id with
    // the alias we just resolved — the older OL work id stays canonical
    // for that row. The trade-off is that future visits hit the slow
    // path (cache miss → GB cached call → DB lookup) for aliased OL
    // work IDs, but no duplicates ever get created.
    const existingExt =
      (existingByOtherId.external_ids as Record<string, unknown> | null) ?? {};
    const mergedExternalIds = {
      ...sr.external_ids,
      ...existingExt,
    };
    const before = JSON.stringify(existingExt);
    const after = JSON.stringify(mergedExternalIds);
    if (before !== after) {
      await supabase
        .from("media_items")
        .update({ external_ids: mergedExternalIds })
        .eq("id", existingByOtherId.id);
    }
    return existingByOtherId.id;
  }

  // INSERT, but if a concurrent render beat us to it, fetch the winner.
  const { data: inserted, error } = await supabase
    .from("media_items")
    .insert({
      media_type: sr.media_type,
      title: sr.title,
      description: sr.description,
      cover_image_url: sr.cover_image_url,
      backdrop_url: sr.backdrop_url,
      release_date: sr.release_date,
      metadata: sr.metadata,
      external_ids: sr.external_ids,
    })
    .select("id")
    .single();

  if (inserted) return inserted.id;
  // Race-loss fallback — re-read the row that the concurrent insert
  // created. Treats RLS denials as terminal too (returns null).
  if (error) {
    const { data: retry } = await supabase
      .from("media_items")
      .select("id")
      .contains("external_ids", { openlibrary_work_id: olWorkId })
      .eq("media_type", "book")
      .limit(1)
      .maybeSingle();
    return retry?.id ?? null;
  }
  return null;
}

/**
 * Look up an existing book row by any of the cross-reference signals we
 * can extract from a resolved Google Books volume. Used by
 * `resolveAndCacheBookFromOLWork` to avoid creating a duplicate row
 * for a book that was already added through some other flow (search
 * bar, top picks, an OL alias from a prior visit) — even when the new
 * resolution lands on a different GB edition.
 *
 * Order from most-specific to least-specific:
 *   1. `google_books_id` — unique per GB volume
 *   2. `isbn_13` — usually unique but mass-market/hardcover can share
 *   3. exact title + first author — catches "two GB editions of the same
 *      book where one OL work resolved to volume A and another to
 *      volume B" (different gbid, different ISBN, but it's the same
 *      book by the same author with the same title). Has a small
 *      false-positive risk if an author publishes two genuinely
 *      different works with identical titles, but for a single author's
 *      bibliography this almost never happens.
 */
async function findExistingBookByIdentifiers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  googleBooksId: string | undefined,
  isbn13: string | undefined,
  title: string | undefined,
  firstAuthor: string | undefined
): Promise<{ id: string; external_ids: unknown } | null> {
  if (googleBooksId) {
    const { data } = await supabase
      .from("media_items")
      .select("id, external_ids")
      .contains("external_ids", { google_books_id: googleBooksId })
      .eq("media_type", "book")
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (isbn13) {
    const { data } = await supabase
      .from("media_items")
      .select("id, external_ids")
      .contains("external_ids", { isbn_13: isbn13 })
      .eq("media_type", "book")
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (title && firstAuthor) {
    // Title is matched case-sensitive — both Google Books and our
    // upsert flow preserve casing as-given, so we shouldn't see
    // legitimate duplicates that differ only in case. Author is
    // matched via JSONB containment on `metadata.authors`.
    const { data } = await supabase
      .from("media_items")
      .select("id, external_ids")
      .eq("media_type", "book")
      .eq("title", title)
      .contains("metadata", { authors: [firstAuthor] })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Set a custom cover for a user's tracked item. Stored in progress JSONB
 * so it's per-user. Pass null to clear the override.
 */
export async function setCustomCover(
  userMediaId: string,
  coverUrl: string | null
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Read current progress to merge
  const { data: current } = await supabase
    .from("user_media")
    .select("progress")
    .eq("id", userMediaId)
    .eq("user_id", user.id)
    .single();

  const progress = (current?.progress as Record<string, unknown> | null) ?? {};
  if (coverUrl) {
    progress.custom_cover_url = coverUrl;
  } else {
    delete progress.custom_cover_url;
  }

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", userMediaId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to save cover: ${error.message}`);
}

/**
 * Set a custom backdrop override for a media item. Stored per-user on
 * the user_media row's `progress` JSONB. Pass null to clear and fall
 * back to the shared `media_items.backdrop_url` default.
 *
 * If the viewer doesn't have a user_media row for this title yet, one
 * is created with `status: "want"` so the override has somewhere to
 * live. Lets the user customize backdrops on titles they discover via
 * a person page or search without having to track first.
 */
export async function setCustomBackdrop(
  mediaId: string,
  backdropUrl: string | null
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { data: existing } = await supabase
    .from("user_media")
    .select("id, progress")
    .eq("user_id", user.id)
    .eq("media_id", mediaId)
    .maybeSingle();

  if (!existing) {
    // Lazy-create a wishlist row so the override has a place to live.
    // Activity log isn't fired (we only log via trackMedia) — this is a
    // quiet side effect of the backdrop save.
    const initialProgress = backdropUrl
      ? { custom_backdrop_url: backdropUrl }
      : {};
    const { error } = await supabase.from("user_media").insert({
      user_id: user.id,
      media_id: mediaId,
      status: "want",
      progress: initialProgress,
    });
    if (error) throw new Error(`Failed to save backdrop: ${error.message}`);
    return;
  }

  const progress = (existing.progress as Record<string, unknown> | null) ?? {};
  if (backdropUrl) {
    progress.custom_backdrop_url = backdropUrl;
  } else {
    delete progress.custom_backdrop_url;
  }

  const { error } = await supabase
    .from("user_media")
    .update({ progress })
    .eq("id", existing.id)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to save backdrop: ${error.message}`);
}

/**
 * Return all available backdrop candidate URLs for a media item so the
 * "Change backdrop" picker can display them. Movies/TV pull from TMDb's
 * /images endpoint (ranked by our language + vote heuristic). Games pull
 * from IGDB's artworks + screenshots. Books have none.
 */
export async function listMediaBackdrops(
  mediaId: string
): Promise<string[]> {
  const { supabase } = await getAuthUser();

  const { data: media } = await supabase
    .from("media_items")
    .select("media_type, external_ids")
    .eq("id", mediaId)
    .single();
  if (!media) return [];

  const mediaType = media.media_type as string;
  const externalIds = (media.external_ids as Record<string, unknown> | null) ?? {};

  if (mediaType === "movie" || mediaType === "tv_show") {
    const tmdbId = externalIds.tmdb_id as number | undefined;
    if (!tmdbId) return [];
    try {
      const { getMovieImages, getTVImages } = await import("@/lib/api/tmdb");
      const res =
        mediaType === "movie"
          ? await getMovieImages(tmdbId)
          : await getTVImages(tmdbId);
      // Rank same way `pickBestTMDBBackdrop` does — language-neutral > en,
      // then by vote_average, then vote_count — so the picker presents
      // the best candidates first.
      const langScore = (lang: string | null): number => {
        if (lang === null) return 2;
        if (lang === "en") return 1;
        return 0;
      };
      const ranked = [...res.backdrops].sort((a, b) => {
        const l = langScore(b.iso_639_1) - langScore(a.iso_639_1);
        if (l !== 0) return l;
        if (b.vote_average !== a.vote_average)
          return b.vote_average - a.vote_average;
        return b.vote_count - a.vote_count;
      });
      return ranked
        .map((img) => tmdbImageUrl(img.file_path, "original"))
        .filter((u): u is string => !!u);
    } catch {
      return [];
    }
  }

  if (mediaType === "video_game") {
    const igdbId = externalIds.igdb_id as number | undefined;
    if (!igdbId) return [];
    try {
      const { getGameDetails } = await import("@/lib/api/igdb");
      const game = await getGameDetails(igdbId);
      if (!game) return [];
      const artworkUrls =
        game.artworks?.map((a) => igdbImageUrl(a.image_id, "t_1080p")) ?? [];
      const screenshotUrls =
        game.screenshots?.map((s) => igdbImageUrl(s.image_id, "t_1080p")) ?? [];
      // Artworks first (curated key art), then screenshots (gameplay frames).
      return [...artworkUrls, ...screenshotUrls];
    } catch {
      return [];
    }
  }

  return [];
}
