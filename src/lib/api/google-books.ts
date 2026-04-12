import type { GoogleBooksVolume, GoogleBooksSearchResponse } from "./types";

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";

function apiKey() {
  return process.env.GOOGLE_BOOKS_API_KEY ?? "";
}

export async function searchBooks(
  query: string,
  startIndex = 0,
  maxResults = 20
): Promise<GoogleBooksSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    startIndex: String(startIndex),
    maxResults: String(maxResults),
    printType: "books",
    key: apiKey(),
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`);
  return res.json();
}

export async function getBookDetails(
  volumeId: string
): Promise<GoogleBooksVolume> {
  const res = await fetch(`${BASE_URL}/${volumeId}?key=${apiKey()}`);
  if (!res.ok) throw new Error(`Google Books details failed: ${res.status}`);
  return res.json();
}

export function bookCoverUrl(
  volume: GoogleBooksVolume,
  zoom = 1
): string | null {
  const thumbnail = volume.volumeInfo.imageLinks?.thumbnail;
  if (!thumbnail) return null;
  // Replace zoom level for higher quality and use HTTPS
  return thumbnail
    .replace("http://", "https://")
    .replace(/zoom=\d/, `zoom=${zoom}`);
}
