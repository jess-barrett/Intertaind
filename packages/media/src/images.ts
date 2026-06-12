import type { GoogleBooksVolume } from "./types.ts";

export function tmdbImageUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function bookCoverUrl(volume: GoogleBooksVolume): string | null {
  const links = volume.volumeInfo.imageLinks;
  if (!links) return null;

  // Prefer the largest size Google has — fall back progressively
  const url =
    links.extraLarge ??
    links.large ??
    links.medium ??
    links.small ??
    links.thumbnail ??
    links.smallThumbnail;
  if (!url) return null;

  // zoom=3 gives a higher-res cover, but NO_PAGES volumes only have zoom=1.
  // Only upgrade when we know the volume has a preview (PARTIAL / ALL_PAGES).
  // Unknown/missing viewability is treated as not-upgradable since Google
  // sometimes omits accessInfo entirely for thin records.
  const viewability = volume.accessInfo?.viewability;
  const canUpgradeZoom = viewability === "PARTIAL" || viewability === "ALL_PAGES";

  let fixed = url
    .replace(/^http:\/\//, "https://")
    .replace(/&?edge=curl/g, "");
  if (canUpgradeZoom) {
    // Non-global and single-digit-only — fine for real Google URLs, which carry one zoom param.
    fixed = fixed.replace(/zoom=\d/, "zoom=3");
  }
  return fixed;
}

export function igdbImageUrl(imageId: string, size = "t_cover_big"): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}
