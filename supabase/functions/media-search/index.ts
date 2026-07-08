// `media-search` Edge Function — cross-source media search.
//
// WHY THIS EXISTS
// This is the mobile analogue of web's `/api/search` route
// (apps/web/src/app/api/search/route.ts). Web searches TMDB / Google Books /
// OpenLibrary / IGDB directly from a Node API route, using the external-API
// secrets in `apps/web/.env.local`. Mobile can't: those secrets must never ship
// in the bundle. So the recommend picker (and future mobile search UIs) call
// this function, which holds the secrets server-side and returns a unified,
// normalized `SearchResult[]`.
//
// UNLIKE person / media-upsert, THIS FUNCTION DOES NOT TOUCH THE DATABASE.
// It's a pure read-through over external APIs — no `media_items` writes, no
// dedup-against-catalog — so it needs NO service-role client, only the
// external-API secrets + CORS. (Web additionally re-reads the catalog to swap
// in stored covers via `applyStoredCoverOverrides`; that step is intentionally
// omitted here since we have no DB client — see _shared/search.ts's port note.)
//
// SECRETS (read from Deno.env; never leaked to any client)
//   TMDB_API_KEY            — already set project-wide from the `person` deploy.
//   GOOGLE_BOOKS_API_KEY    — OPTIONAL. Google Books allows keyless (rate-
//                             limited) requests, and web sends "" when the env
//                             var is absent, so we treat a missing key as
//                             keyless rather than skipping the source.
//   TWITCH_CLIENT_ID/SECRET — IGDB (games) via Twitch client_credentials OAuth.
//   (OpenLibrary is keyless — no secret.)
//
// GRACEFUL DEGRADATION
// The per-source fan-out (in runSearch) wraps every source in Promise.allSettled
// AND short-circuits a source whose secret is missing to `[]`. A source that
// errors or is unconfigured is SKIPPED — the whole search never 500s. This lets
// the project deploy with just TMDB set and add Google Books / IGDB later.
//
// The ported search + normalization + ranking live in
// supabase/functions/_shared/search.ts (kept lean here, mirroring the thin
// index.ts of the other functions). See that file's header for exactly what was
// ported vs. simplified relative to web.

import { corsHeaders } from "../_shared/cors.ts";
import {
  resolveSearchType,
  runSearch,
  type SearchSecrets,
} from "../_shared/search.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Parse `{ q, type }` from the query string OR a JSON body. Mobile invokes via
// `supabase.functions.invoke("media-search", { body: { q, type } })`, which
// POSTs JSON; the query string works too (parity with person / media-upsert).
async function readParams(
  req: Request,
): Promise<{ q: string; type: unknown }> {
  const url = new URL(req.url);
  const qsQ = url.searchParams.get("q");
  const qsType = url.searchParams.get("type");
  if (qsQ != null || qsType != null) {
    return { q: qsQ ?? "", type: qsType };
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        return { q: typeof b.q === "string" ? b.q : "", type: b.type };
      }
    } catch {
      // No / invalid JSON body — fall through to empty.
    }
  }
  return { q: "", type: undefined };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 2. Parse params.
    const { q, type: rawType } = await readParams(req);
    const type = resolveSearchType(rawType);
    if (type === null) {
      return jsonResponse(
        { error: "type must be one of: all, movie, tv, book, game" },
        400,
      );
    }

    // 3. Empty / short query → empty result set (not an error). Mirrors the
    //    recommend picker's "type < 2 chars, don't search" contract; runSearch
    //    also guards this, but returning early avoids reading secrets needlessly.
    const query = q.trim();
    if (query.length < 2) return jsonResponse({ results: [] });

    // 4. Read secrets. Each is optional at THIS layer — a missing secret makes
    //    its source degrade to [] inside runSearch rather than failing the whole
    //    request (see GRACEFUL DEGRADATION above). GOOGLE_BOOKS_API_KEY absent =
    //    keyless Google Books, not "skip books" (OpenLibrary is keyless anyway).
    const secrets: SearchSecrets = {
      tmdbKey: Deno.env.get("TMDB_API_KEY"),
      googleBooksKey: Deno.env.get("GOOGLE_BOOKS_API_KEY"),
      twitchClientId: Deno.env.get("TWITCH_CLIENT_ID"),
      twitchClientSecret: Deno.env.get("TWITCH_CLIENT_SECRET"),
    };

    // 5. Fan out to the relevant sources, normalize, merge, score-sort.
    const results = await runSearch(query, type, secrets);

    // 6. Respond.
    return jsonResponse({ results });
  } catch (err) {
    // Never leak a secret. A short message is safe and useful.
    const message = err instanceof Error ? err.message : "unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
