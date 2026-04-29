// Wikidata client — used as the primary source for book-series facts
// (membership, position, completion status). More reliable than Google
// Books / OpenLibrary for the books most users care about (literary
// genre fiction, mainstream sci-fi/fantasy, classics) because Wikidata
// has structured properties verified by community editors instead of
// edition-string soup.
//
// Coverage gap is the long tail — indie / non-English / very recent
// titles. Caller should fall back to GB / OL when this returns null.
//
// All requests cached at the Next.js fetch layer. Wikidata churns
// slowly so 7 days is generous and well under their abuse limits.

const SEARCH_URL = "https://www.wikidata.org/w/api.php";
const SPARQL_URL = "https://query.wikidata.org/sparql";
const WIKIDATA_CACHE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// User-Agent is required by the Wikidata Foundation per their etiquette
// guidelines. Identifies the requester so they can contact about misuse.
const USER_AGENT =
  "Intertaind/1.0 (https://intertaind.com; series-enrichment) node-fetch";

interface SearchResult {
  id: string;        // Q-id like "Q108325178"
  label: string;
  description?: string;
}

interface SearchResponse {
  search?: SearchResult[];
}

/**
 * Free-text search for entities matching a label. Used to narrow the
 * candidate set before a more expensive SPARQL detail query — Wikidata's
 * SPARQL endpoint is slow when filtering across all entities by label,
 * but fast when you give it a small `VALUES` set of Q-ids.
 */
async function searchEntities(
  query: string,
  limit = 10
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "en",
    type: "item",
    format: "json",
    limit: String(limit),
    origin: "*",
  });
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: WIKIDATA_CACHE_SECONDS },
    });
    if (!res.ok) return [];
    const data: SearchResponse = await res.json();
    return data.search ?? [];
  } catch {
    return [];
  }
}

interface SparqlBinding {
  type: string;
  value: string;
}

interface SparqlResponse {
  results?: {
    bindings?: Record<string, SparqlBinding>[];
  };
}

/**
 * Fallback candidate finder when `wbsearchentities` returns nothing.
 * Performs a SPARQL CONTAINS lookup over English labels scoped by
 * author — slower than wbsearch but tolerates entities whose canonical
 * label has a series prefix or other formatting that breaks the
 * prefix-only matching the search API uses.
 *
 * Triggered case: "The Bands of Mourning" — Wikidata's label is
 * "Mistborn: The Bands of Mourning", so wbsearch returns nothing for
 * the bare title, but this CONTAINS check finds it.
 *
 * Author scoping keeps the query fast: even a prolific author has a
 * few hundred labeled works at most, well within SPARQL's budget.
 */
async function sparqlSearchByAuthorAndTitleSubstring(
  title: string,
  author: string
): Promise<string[]> {
  const safeTitle = title
    .toLowerCase()
    .replace(/["\\]/g, "")
    .trim();
  const safeAuthor = author.replace(/["\\]/g, "\\$&");
  if (!safeTitle) return [];

  const query = `
    SELECT ?book WHERE {
      ?book wdt:P50 ?author .
      ?author rdfs:label "${safeAuthor}"@en .
      ?book rdfs:label ?label .
      FILTER (LANG(?label) = "en")
      FILTER CONTAINS(LCASE(STR(?label)), "${safeTitle}")
    }
    LIMIT 10
  `;
  const bindings = await runSparql(query);
  const out: string[] = [];
  for (const b of bindings) {
    const qid = qidFromUri(b.book?.value ?? "");
    if (qid) out.push(qid);
  }
  return out;
}

async function runSparql(
  query: string
): Promise<Record<string, SparqlBinding>[]> {
  const params = new URLSearchParams({ query, format: "json" });
  try {
    const res = await fetch(`${SPARQL_URL}?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
      },
      next: { revalidate: WIKIDATA_CACHE_SECONDS },
    });
    if (!res.ok) return [];
    const data: SparqlResponse = await res.json();
    return data.results?.bindings ?? [];
  } catch {
    return [];
  }
}

/** Trailing slash + Q-id from a Wikidata entity URI. */
function qidFromUri(uri: string): string | null {
  const match = uri.match(/\/(Q\d+)$/);
  return match ? match[1] : null;
}

export interface WikidataSeriesMatch {
  /** Wikidata Q-id of the series itself, e.g. "Q108325178". Used as
      the source-prefixed `series_id` in `media_items` (`wd:Q...`). */
  seriesQid: string;
  seriesName: string;
  /** 1-based position within the series. Null when Wikidata hasn't
      tagged the book with `P1545`. */
  position: number | null;
  /** Series completion status. Inferred from the series item:
      `P582` (end time) set → "complete"; otherwise null. We don't
      claim "ongoing" because absence of end-time is ambiguous (could
      mean ongoing OR just unknown / unedited on Wikidata). */
  status: "complete" | null;
}

/**
 * Look up a book's series membership on Wikidata. Two-step pattern:
 * a fast title search to narrow candidates, then a SPARQL query
 * filtered to those Q-ids that finds one with the matching author
 * (P50) and a series link (P179). Returns null when no candidate
 * matches both filters.
 *
 * The author match uses an exact label compare in SPARQL — matters
 * because most popular book titles have several Wikidata entries
 * (different works that share the title) and the author filter
 * disambiguates.
 */
export async function findBookSeriesOnWikidata(
  title: string,
  author: string
): Promise<WikidataSeriesMatch | null> {
  // Two-stage candidate discovery. The fast `wbsearchentities` API is
  // tried first — it's a prefix match against labels and aliases, so
  // it nails obvious cases ("Empire of Silence" → matches the entity
  // labeled "Empire of Silence"). When it returns nothing — usually
  // because the entity's canonical label has a series prefix that
  // breaks the match (e.g. "Mistborn: The Bands of Mourning" vs a
  // search for "The Bands of Mourning") — fall back to a SPARQL
  // CONTAINS lookup scoped by author. SPARQL is slower but tolerates
  // any-position substring matches.
  let candidateQids: string[] = (await searchEntities(title, 10)).map(
    (c) => c.id
  );
  if (candidateQids.length === 0) {
    candidateQids = await sparqlSearchByAuthorAndTitleSubstring(
      title,
      author
    );
  }
  if (candidateQids.length === 0) return null;

  const qidValues = candidateQids.map((q) => `wd:${q}`).join(" ");
  // Escape the author label for safe inclusion as a SPARQL string literal
  const safeAuthor = author.replace(/["\\]/g, "\\$&");

  // Statement-level SPARQL (p:P179 / ps:P179 / pq:P1545) so the series
  // ordinal qualifier stays bound to the SAME series statement it
  // belongs to. Without this, Wikidata flattens both ordinals to the
  // book and we can't tell which series each ordinal applies to.
  //
  // We DON'T limit to 1 because some books are tagged with multiple
  // series — e.g. Alloy of Law lives in both "Mistborn" (umbrella)
  // and "Wax and Wayne" (Era 2). Post-process picks the most specific.
  //
  // Sub-series are encoded with `wdt:P179` *recursively* — Wax and
  // Wayne's entity itself has `P179 → Mistborn`, marking it as a
  // sub-series of Mistborn. P361 (generic "part of") is NOT used for
  // book series. Reading P179 on the series gives us the parent.
  // Wikidata stores `P155 (preceded by)` two ways: as a QUALIFIER on
  // the P179 statement (Shadows of Self pattern), or as a TOP-LEVEL
  // property on the book itself (The Lost Metal pattern). We pull
  // both — caller picks whichever is set, preferring the qualifier
  // when present.
  const query = `
    SELECT ?book ?series ?seriesLabel ?ordinal ?seriesEndTime ?parentSeries ?stmtPrecededBy ?bookPrecededBy WHERE {
      VALUES ?book { ${qidValues} }
      ?book wdt:P50 ?author .
      ?author rdfs:label "${safeAuthor}"@en .
      ?book p:P179 ?statement .
      ?statement ps:P179 ?series .
      OPTIONAL { ?statement pq:P1545 ?ordinal . }
      OPTIONAL { ?statement pq:P155 ?stmtPrecededBy . }
      OPTIONAL { ?book wdt:P155 ?bookPrecededBy . }
      OPTIONAL { ?series wdt:P582 ?seriesEndTime . }
      OPTIONAL { ?series wdt:P179 ?parentSeries . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 10
  `;

  const bindings = await runSparql(query);
  if (bindings.length === 0) return null;

  // Sub-series preference: if the result contains a series whose
  // P179 points at ANOTHER series in the same result, pick the
  // inner one. That's how Wikidata models "X is a sub-series of Y"
  // and we want the more specific tag (Wax and Wayne) over the
  // umbrella (Mistborn).
  const seriesQidsInResult = new Set<string>();
  for (const row of bindings) {
    const sQid = qidFromUri(row.series?.value ?? "");
    if (sQid) seriesQidsInResult.add(sQid);
  }
  let chosenRow = bindings[0];
  for (const row of bindings) {
    const parentQid = qidFromUri(row.parentSeries?.value ?? "");
    if (parentQid && seriesQidsInResult.has(parentQid)) {
      chosenRow = row;
      break;
    }
  }

  const seriesUri = chosenRow.series?.value;
  const chosenSeriesQid = seriesUri ? qidFromUri(seriesUri) : null;
  if (!chosenSeriesQid) return null;

  // Predecessor inheritance — fills the gap when Wikidata has the book
  // tagged ONLY in the umbrella series even though it actually belongs
  // to a sub-series. Common case: Shadows of Self is tagged in
  // "Mistborn" at position 5, but its P155 predecessor (Alloy of Law)
  // is in "Wax and Wayne", which is a sub-series of Mistborn. Without
  // this, Shadows of Self renders as Mistborn book 5 instead of as a
  // Wax and Wayne entry.
  //
  // Only kicks in when the chosen series has NO parent (i.e. it's the
  // umbrella). When the chosen series is already a sub-series, the
  // direct match wins and we skip this branch.
  const isAlreadySubSeries = !!chosenRow.parentSeries?.value;
  // Prefer qualifier-level P155 when set (it's tied to the specific
  // P179 statement), fall back to book-level P155.
  const precededByQid = qidFromUri(
    chosenRow.stmtPrecededBy?.value ??
      chosenRow.bookPrecededBy?.value ??
      ""
  );
  if (!isAlreadySubSeries && precededByQid) {
    const subMatch = await findSubSeriesViaPredecessorChain(
      precededByQid,
      chosenSeriesQid
    );
    if (subMatch) {
      // Adopt the sub-series. We don't know our exact position within
      // the sub-series (Wikidata didn't tag it), so leave position null
      // — the page-level graph orders by release_date when positions
      // are mixed/missing.
      return {
        seriesQid: subMatch.qid,
        seriesName: subMatch.label,
        position: null,
        status: null,
      };
    }
  }

  const seriesName = chosenRow.seriesLabel?.value ?? "";
  const ordinalRaw = chosenRow.ordinal?.value;
  const position = ordinalRaw
    ? Math.floor(Number(ordinalRaw))
    : null;
  const status: "complete" | null = chosenRow.seriesEndTime?.value
    ? "complete"
    : null;

  return {
    seriesQid: chosenSeriesQid,
    seriesName,
    position: Number.isFinite(position) ? position : null,
    status,
  };
}

/**
 * Walk the P155 (preceded by) chain from `startQid` looking for a
 * book that's directly tagged in a sub-series of `umbrellaQid`. Stops
 * when:
 *   - it finds a sub-series tag (success)
 *   - the chain ends (no predecessor)
 *   - it's hopped MAX_HOPS times (cycle protection)
 *
 * Why a chain walk and not a transitive SPARQL?
 * Wikidata stores P155 in two places: as a P179 qualifier (statement-
 * level) AND/OR as a top-level book claim. Transitive `wdt:P155*`
 * only follows top-level claims, AND skips deprecated ones — and
 * Wikidata editors often deprecate top-level P155 when they move it
 * to qualifier form, breaking the chain. A JS walk that checks both
 * paths at each hop survives this.
 *
 * Tradeoff: each hop is two SPARQL calls (cached for 7 days). Three
 * hops is the deepest case I've observed (Lost Metal → Bands →
 * Shadows → Alloy in Mistborn).
 */
async function findSubSeriesViaPredecessorChain(
  startQid: string,
  umbrellaQid: string
): Promise<{ qid: string; label: string } | null> {
  const MAX_HOPS = 5;
  const seen = new Set<string>();
  let currentQid: string | null = startQid;
  for (let i = 0; i < MAX_HOPS && currentQid; i++) {
    if (seen.has(currentQid)) return null;
    seen.add(currentQid);

    // Step A: does this book have a direct sub-series tag for the
    // umbrella we care about?
    const directQuery = `
      SELECT ?subSeries ?subSeriesLabel WHERE {
        wd:${currentQid} wdt:P179 ?subSeries .
        ?subSeries wdt:P179 wd:${umbrellaQid} .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      }
      LIMIT 1
    `;
    const direct = await runSparql(directQuery);
    if (direct.length > 0) {
      const subQid = qidFromUri(direct[0].subSeries?.value ?? "");
      const subLabel = direct[0].subSeriesLabel?.value;
      if (subQid && subLabel) return { qid: subQid, label: subLabel };
    }

    // Step B: walk to predecessor. UNION because P155 lives as a
    // qualifier on P179 OR as a top-level book claim, depending on
    // how the editor entered it.
    const prevQuery = `
      SELECT ?prev WHERE {
        {
          wd:${currentQid} p:P179 ?stmt .
          ?stmt pq:P155 ?prev .
        } UNION {
          wd:${currentQid} wdt:P155 ?prev .
        }
      }
      LIMIT 1
    `;
    const prevBindings = await runSparql(prevQuery);
    if (prevBindings.length === 0) return null;
    const prevQid = qidFromUri(prevBindings[0].prev?.value ?? "");
    if (!prevQid) return null;
    currentQid = prevQid;
  }
  return null;
}

/**
 * Look up a book's original publication year on Wikidata via `P577`.
 * Distinct from the series lookup because many book entities have
 * `P577` set but lack the `P179` (part of series) link — which means
 * the series query misses them, but the date is still readable.
 *
 * Common case it solves: Mistborn (Q2778373) has P577 = 2006-07-17
 * but no P179. Google Books returns a 2010 reissue date and OL's
 * work-level data is also wrong for popular older books, so this is
 * the only reliable source.
 *
 * Returns the earliest publication year when multiple dates exist on
 * the entity (rare, but Wikidata sometimes lists republication dates
 * as additional P577 statements).
 */
export async function findBookPublicationYearOnWikidata(
  title: string,
  author: string
): Promise<number | null> {
  // Same two-stage candidate discovery as the series lookup —
  // wbsearchentities first, SPARQL CONTAINS fallback for entities
  // whose canonical label has a series prefix that breaks prefix
  // matching ("Mistborn: The Bands of Mourning" etc).
  let candidateQids: string[] = (await searchEntities(title, 10)).map(
    (c) => c.id
  );
  if (candidateQids.length === 0) {
    candidateQids = await sparqlSearchByAuthorAndTitleSubstring(
      title,
      author
    );
  }
  if (candidateQids.length === 0) return null;

  const qidValues = candidateQids.map((q) => `wd:${q}`).join(" ");
  const safeAuthor = author.replace(/["\\]/g, "\\$&");

  const query = `
    SELECT ?book ?publishDate WHERE {
      VALUES ?book { ${qidValues} }
      ?book wdt:P50 ?author .
      ?author rdfs:label "${safeAuthor}"@en .
      ?book wdt:P577 ?publishDate .
    }
    ORDER BY ?publishDate
    LIMIT 1
  `;

  const bindings = await runSparql(query);
  if (bindings.length === 0) return null;

  const dateStr = bindings[0].publishDate?.value;
  if (!dateStr) return null;
  // Wikidata serializes dates as "+2006-07-17T00:00:00Z" or similar —
  // pull the leading 4-digit year.
  const match = dateStr.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}
