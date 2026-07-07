// `person` Edge Function — get-or-enrich for people + their filmographies.
//
// WHY THIS EXISTS
// This is the ONLY component in the system that holds `TMDB_API_KEY`. Web
// used to call TMDB directly from Server Components; mobile can't (server
// secrets must never ship in the bundle). So both clients now call this
// function, which ensures our Supabase `people` + `person_credits` tables
// hold fresh data, and then the clients READ those tables directly as anon
// (RLS allows public SELECT; only the service role writes).
//
// GET-OR-ENRICH PATTERN
// Given a TMDB person id:
//   1. If we already have a `people` row enriched within the freshness
//      window (30 days), we do nothing and return { enriched: false }. The
//      caller just reads the tables. This keeps TMDB call volume low.
//   2. Otherwise we fetch /person/{id} + /person/{id}/combined_credits from
//      TMDB, upsert `people`, rebuild `person_credits`, and return
//      { enriched: true }.
//
// 30-DAY STALENESS
// Person bios and filmographies drift slowly. 30 days is well within
// acceptable freshness for canonical metadata and dramatically cuts TMDB
// traffic for popular people who get hit repeatedly. (Web's live path used
// a 24h HTTP cache; the persisted model can afford to be far more relaxed.)
//
// SERVICE-ROLE WRITES (RLS BYPASS)
// `people` / `person_credits` have RLS with public SELECT and NO write
// policy, so anon/auth clients can never mutate them. This function uses the
// service-role key, which bypasses RLS, so it is the sole writer. The key is
// auto-injected into deployed functions as SUPABASE_SERVICE_ROLE_KEY and is
// never exposed to any client.
//
// job='' CAST-DEDUP RATIONALE
// The `person_credits` UNIQUE key is
// (person_tmdb_id, media_tmdb_id, media_type, credit_type, job). Postgres
// treats NULLs as distinct in a UNIQUE constraint, so if cast rows used
// job=NULL every re-enrichment would insert duplicates instead of upserting.
// We therefore store job='' (empty string) for cast rows. A consequence:
// two cast roles on the SAME title would collide on that key — TMDB does
// return multiple cast entries for the same film when an actor plays several
// roles. We collapse those to ONE row per (media_type, media_tmdb_id),
// keeping the LOWEST `order` (top billing), matching web's billing
// semantics. Crew rows keep their real `job`, so Director + Producer on one
// film correctly produce two distinct rows.
//
// tv -> tv_show LINKAGE
// A credit's media_type is TMDB's ('movie' | 'tv'). Our catalog's
// `media_items.media_type` enum uses 'tv_show' for television. When linking
// a credit to a catalog row we therefore map 'tv' -> 'tv_show' before
// keying the lookup, so a TV credit matches its media_items row.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Re-enrich only when the existing row is older than this. See header note.
const FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

// Minimal shapes for the TMDB responses we consume. Mirrors
// packages/media/src/types.ts (TMDBPerson / TMDBPersonCredit /
// TMDBPersonCombinedCredits) — duplicated here because Deno Edge Functions
// don't share the pnpm workspace's TS paths.
interface TMDBPerson {
  id: number;
  name: string;
  biography: string;
  profile_path: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  popularity: number;
}

interface TMDBPersonCredit {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string; // movie
  name?: string; // tv
  overview?: string;
  release_date?: string; // movie
  first_air_date?: string; // tv
  poster_path: string | null;
  character?: string;
  order?: number;
  job?: string; // crew
  department?: string; // crew
  vote_count?: number;
  vote_average?: number;
  genre_ids?: number[];
}

interface TMDBPersonCombinedCredits {
  id: number;
  cast: TMDBPersonCredit[];
  crew: TMDBPersonCredit[];
}

// The row shape we upsert into `person_credits`. Matches migration 029.
interface PersonCreditRow {
  person_tmdb_id: number;
  media_tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  release_date: string | null;
  poster_path: string | null;
  overview: string | null;
  character: string | null;
  billing_order: number | null;
  job: string; // '' for cast, real job for crew (see header note)
  department: string | null;
  credit_type: "cast" | "crew";
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_item_id: string | null;
  enriched_at: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A Postgres `date` column rejects the empty string, so coerce "" (and
// undefined/null) to null. TMDB returns "" for missing dates.
function toDateOrNull(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  return value;
}

// Pull tmdb_id from the query string OR the JSON body. Mobile invokes via
// `supabase.functions.invoke("person", { body: { tmdb_id } })`, which POSTs
// JSON; web can use the query string. Returns a positive integer or null.
async function readTmdbId(req: Request): Promise<number | null> {
  const url = new URL(req.url);
  const qs = url.searchParams.get("tmdb_id");
  if (qs != null) return parsePositiveInt(qs);

  // Only attempt to read a body when there is one.
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.json();
      if (body && typeof body === "object" && "tmdb_id" in body) {
        return parsePositiveInt((body as { tmdb_id: unknown }).tmdb_id);
      }
    } catch {
      // No / invalid JSON body — fall through to null.
    }
  }
  return null;
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

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 2. Resolve + validate the person id.
    const tmdbId = await readTmdbId(req);
    if (tmdbId == null) {
      return jsonResponse(
        { error: "tmdb_id is required and must be a positive integer" },
        400,
      );
    }

    // 3. Service-role client — bypasses RLS so we can write the tables.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 4. Freshness check. If enriched within the window, skip TMDB entirely.
    const { data: existing, error: existingErr } = await supabase
      .from("people")
      .select("tmdb_id, enriched_at")
      .eq("tmdb_id", tmdbId)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing?.enriched_at) {
      const age = Date.now() - new Date(existing.enriched_at).getTime();
      if (age < FRESHNESS_MS) {
        return jsonResponse({ ok: true, enriched: false });
      }
    }

    // 5. Fetch from TMDB (person details + combined credits in parallel).
    const tmdbKey = Deno.env.get("TMDB_API_KEY");
    if (!tmdbKey) {
      // Deliberately explicit but never echoes the (missing) key value.
      return jsonResponse(
        { error: "TMDB_API_KEY is not configured on this function" },
        500,
      );
    }
    const headers = {
      Authorization: `Bearer ${tmdbKey}`,
      "Content-Type": "application/json",
    };

    const [personRes, creditsRes] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/person/${tmdbId}`, { headers }),
      fetch(`${TMDB_BASE_URL}/person/${tmdbId}/combined_credits`, { headers }),
    ]);

    if (personRes.status === 404) {
      return jsonResponse({ error: "not found" }, 404);
    }
    if (!personRes.ok) {
      throw new Error(`TMDB person fetch failed: ${personRes.status}`);
    }
    if (!creditsRes.ok) {
      throw new Error(`TMDB credits fetch failed: ${creditsRes.status}`);
    }

    const person = (await personRes.json()) as TMDBPerson;
    const credits = (await creditsRes.json()) as TMDBPersonCombinedCredits;

    const nowIso = new Date().toISOString();

    // 6. Upsert the person row (natural key: tmdb_id).
    const { error: personUpsertErr } = await supabase.from("people").upsert(
      {
        tmdb_id: person.id,
        name: person.name,
        biography: person.biography ?? null,
        birthday: toDateOrNull(person.birthday),
        deathday: toDateOrNull(person.deathday),
        place_of_birth: person.place_of_birth ?? null,
        profile_path: person.profile_path ?? null,
        popularity: person.popularity ?? null,
        known_for_department: person.known_for_department ?? null,
        enriched_at: nowIso,
      },
      { onConflict: "tmdb_id" },
    );
    if (personUpsertErr) throw personUpsertErr;

    // 7. Build credit rows from combined_credits.
    // Cast entries are collapsed to one-per-title (lowest `order`) because
    // they all share job='' and would otherwise collide on the UNIQUE key.
    const castByTitle = new Map<string, PersonCreditRow>();
    for (const c of credits.cast ?? []) {
      if (c.media_type !== "movie" && c.media_type !== "tv") continue;
      const title = c.title ?? c.name;
      if (!title) continue; // title is NOT NULL in the table.

      const key = `${c.media_type}-${c.id}`;
      const order = typeof c.order === "number" ? c.order : null;
      const existingCast = castByTitle.get(key);
      if (existingCast) {
        // Keep the lowest billing order (top billing wins).
        const currentOrder = existingCast.billing_order;
        if (
          order != null &&
          (currentOrder == null || order < currentOrder)
        ) {
          existingCast.billing_order = order;
          existingCast.character = c.character ?? existingCast.character;
        }
        continue;
      }

      castByTitle.set(key, {
        person_tmdb_id: person.id,
        media_tmdb_id: c.id,
        media_type: c.media_type,
        title,
        release_date: toDateOrNull(c.release_date ?? c.first_air_date),
        poster_path: c.poster_path ?? null,
        overview: c.overview ?? null,
        character: c.character ?? null,
        billing_order: order,
        job: "", // empty string, NOT null — see header note.
        department: null,
        credit_type: "cast",
        vote_average: c.vote_average ?? 0,
        vote_count: c.vote_count ?? 0,
        genre_ids: c.genre_ids ?? [],
        media_item_id: null, // resolved below.
        enriched_at: nowIso,
      });
    }

    // Crew rows keep their real job/department. A person can hold multiple
    // crew jobs on one film (Director + Producer) — those are distinct rows,
    // differentiated by `job`, which is correct. Dedup only on the exact
    // UNIQUE key so identical (title, job) crew entries don't collide.
    const crewByKey = new Map<string, PersonCreditRow>();
    for (const c of credits.crew ?? []) {
      if (c.media_type !== "movie" && c.media_type !== "tv") continue;
      const title = c.title ?? c.name;
      if (!title) continue;
      const job = c.job ?? "";
      const key = `${c.media_type}-${c.id}-${job}`;
      if (crewByKey.has(key)) continue;

      crewByKey.set(key, {
        person_tmdb_id: person.id,
        media_tmdb_id: c.id,
        media_type: c.media_type,
        title,
        release_date: toDateOrNull(c.release_date ?? c.first_air_date),
        poster_path: c.poster_path ?? null,
        overview: c.overview ?? null,
        character: null,
        billing_order: null,
        job,
        department: c.department ?? null,
        credit_type: "crew",
        vote_average: c.vote_average ?? 0,
        vote_count: c.vote_count ?? 0,
        genre_ids: c.genre_ids ?? [],
        media_item_id: null, // resolved below.
        enriched_at: nowIso,
      });
    }

    const creditRows = [...castByTitle.values(), ...crewByKey.values()];

    // 8. Resolve media_item_id in one batched query. We look up media_items
    // by their external tmdb_id, then key by media_type so movie/tv don't
    // collide. TMDB 'tv' maps to our catalog's 'tv_show' enum.
    const uniqueMediaIds = Array.from(
      new Set(creditRows.map((r) => r.media_tmdb_id)),
    );
    if (uniqueMediaIds.length > 0) {
      const { data: mediaRows, error: mediaErr } = await supabase
        .from("media_items")
        .select("id, media_type, external_ids")
        .in(
          "external_ids->>tmdb_id",
          uniqueMediaIds.map(String),
        );
      if (mediaErr) throw mediaErr;

      const mediaItemByKey = new Map<string, string>();
      for (const row of mediaRows ?? []) {
        const ext = (row.external_ids as Record<string, unknown> | null) ??
          {};
        const rowTmdbId = ext.tmdb_id;
        if (rowTmdbId == null) continue;
        // Key is `${catalog media_type}-${tmdb_id}` e.g. "tv_show-1399".
        mediaItemByKey.set(`${row.media_type}-${rowTmdbId}`, row.id);
      }

      for (const r of creditRows) {
        // Map the credit's TMDB media_type to our catalog enum for lookup.
        const catalogType = r.media_type === "tv" ? "tv_show" : "movie";
        const matched =
          mediaItemByKey.get(`${catalogType}-${r.media_tmdb_id}`) ?? null;
        r.media_item_id = matched;
      }
    }

    // 9. Full re-enrich: delete this person's existing credits, then insert
    // the freshly built set. Delete-then-insert in one request is the
    // simplest correct way to also drop credits TMDB no longer returns.
    const { error: deleteErr } = await supabase
      .from("person_credits")
      .delete()
      .eq("person_tmdb_id", person.id);
    if (deleteErr) throw deleteErr;

    if (creditRows.length > 0) {
      const { error: creditsUpsertErr } = await supabase
        .from("person_credits")
        .upsert(creditRows, {
          onConflict:
            "person_tmdb_id,media_tmdb_id,media_type,credit_type,job",
        });
      if (creditsUpsertErr) throw creditsUpsertErr;
    }

    // 10. Done.
    return jsonResponse({ ok: true, enriched: true });
  } catch (err) {
    // Never leak the TMDB key. A short message is safe and useful.
    const message = err instanceof Error ? err.message : "unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
