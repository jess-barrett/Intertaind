import type { IGDBGame } from "./types";

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

export async function searchGames(
  query: string,
  limit = 20
): Promise<IGDBGame[]> {
  const body = `search "${query}"; fields name,summary,cover.image_id,first_release_date,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count; limit ${limit};`;
  return igdbFetch("games", body) as Promise<IGDBGame[]>;
}

export async function getGameDetails(igdbId: number): Promise<IGDBGame | null> {
  const body = `where id = ${igdbId}; fields name,summary,cover.image_id,first_release_date,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count; limit 1;`;
  const results = (await igdbFetch("games", body)) as IGDBGame[];
  return results[0] ?? null;
}

export function igdbImageUrl(imageId: string, size = "t_cover_big"): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}
