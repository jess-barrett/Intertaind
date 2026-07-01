import type { IGDBGame, IGDBCompany } from "@intertaind/media";

const API_URL = "https://api.igdb.com/v4";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getIGDBToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) throw new Error(`Twitch OAuth failed: ${res.status}`);

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function igdbFetch(endpoint: string, body: string): Promise<unknown> {
  const token = await getIGDBToken();
  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB ${endpoint} failed: ${res.status}`);
  return res.json();
}

// Field list used by both search and detail queries — keeping them in
// sync ensures the normalizer always has the same shape to work with.
const GAME_FIELDS =
  "name,summary,cover.image_id,artworks.image_id,screenshots.image_id,first_release_date,genres.name,platforms.name,involved_companies.company.id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count";

export async function searchGames(
  query: string,
  limit = 20
): Promise<IGDBGame[]> {
  const body = `search "${query}"; fields ${GAME_FIELDS}; limit ${limit};`;
  return igdbFetch("games", body) as Promise<IGDBGame[]>;
}

export async function getGameDetails(igdbId: number): Promise<IGDBGame | null> {
  const body = `where id = ${igdbId}; fields ${GAME_FIELDS}; limit 1;`;
  const results = (await igdbFetch("games", body)) as IGDBGame[];
  return results[0] ?? null;
}

export async function getCompanyDetailsIGDB(
  companyId: number
): Promise<IGDBCompany | null> {
  const body = `where id = ${companyId}; fields name,description,country,logo.image_id,start_date,url,websites.url,websites.category; limit 1;`;
  const results = (await igdbFetch("companies", body)) as IGDBCompany[];
  return results[0] ?? null;
}

/**
 * Fetch games involving a specific company. `role` filters to only the
 * games where the company was credited as developer or publisher;
 * `"any"` returns both. IGDB caps responses at 500 — for v1 we sort by
 * rating_count desc to surface the studio's flagship titles first.
 */
export async function getGamesByCompany(
  companyId: number,
  role: "developer" | "publisher" | "any" = "any",
  limit = 200
): Promise<IGDBGame[]> {
  const roleClause =
    role === "developer"
      ? `& involved_companies.developer = true`
      : role === "publisher"
        ? `& involved_companies.publisher = true`
        : "";
  const body = `where involved_companies.company = ${companyId} ${roleClause}; fields ${GAME_FIELDS}; sort rating_count desc; limit ${limit};`;
  return igdbFetch("games", body) as Promise<IGDBGame[]>;
}
