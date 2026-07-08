/**
 * TV season/episode metadata parse — the single source the three TV
 * tracking sheets (`tv-watching-sheet`, `tv-log-season-sheet`,
 * `tv-log-episode-sheet`) share to build their Season / Episode pickers
 * AND the pointer bulk-fill (marking earlier episodes watched).
 *
 * ── Where the numbers come from ──────────────────────────────────────
 * Mirrors web's `media/[id]/page.tsx` season inputs AND mobile's
 * `season-cards.tsx` parse:
 *   - `metadata.season_details` (the richer source `season-cards.tsx`
 *     already reads): `{ season_number, episode_count, ... }[]` — the
 *     preferred source for BOTH the season list and per-season episode
 *     counts.
 *   - `metadata.season_episodes` (web's `seasonEpisodes`,
 *     `Record<season → episode_count>`): the fallback count source, and
 *     the count source for any season present here but missing from
 *     `season_details`.
 *   - `metadata.number_of_seasons` / `metadata.seasons` (web's
 *     `totalSeasons`): the last-resort season COUNT when neither map
 *     above yields a season list — produces a bare `1..N` list with
 *     unknown (0) episode counts.
 *
 * A `season_number` of 0 (TMDb "Specials") is kept if the metadata
 * includes it — the same permissive stance `season-cards.tsx` takes
 * (it renders whatever `season_details` contains).
 *
 * ── Shape returned ───────────────────────────────────────────────────
 * `seasonNumbers`   — ascending, deduped list for the Season picker.
 * `episodeCounts`   — `{ [seasonNumber]: episodeCount }` (STRING keys, to
 *                     match web's stringified progress keys); a value of
 *                     0 means "unknown" (no metadata for that season).
 * `episodeCountFor` — convenience lookup (0 when unknown).
 */
import type { Tables } from "@intertaind/supabase";

import { asArray } from "@/lib/metadata";

/** One season row as stored in `metadata.season_details` (season-cards parity). */
interface SeasonDetail {
  season_number: number;
  episode_count: number;
}

export type TvSeasonMeta = {
  /** Ascending, deduped season numbers for the Season picker. */
  seasonNumbers: number[];
  /** `{ [seasonNumber]: episodeCount }`, string-keyed (0 = unknown). */
  episodeCounts: Record<string, number>;
  /** Episode count for a season (0 when unknown / no metadata). */
  episodeCountFor: (season: number) => number;
};

/**
 * Parse the season list + per-season episode counts from a media item's
 * `metadata` JSONB (untyped — guarded throughout).
 */
export function parseTvSeasons(
  metadata: Tables<"media_items">["metadata"],
): TvSeasonMeta {
  const meta = (metadata ?? null) as Record<string, unknown> | null;

  // Primary source: season_details[] (episode_count per season).
  const details = asArray<SeasonDetail>(meta?.season_details);
  // Fallback / supplementary source: season_episodes map.
  const episodeMap =
    (meta?.season_episodes as Record<string, number> | undefined) ?? null;

  const counts: Record<string, number> = {};
  const seasons = new Set<number>();

  // 1. Fold in season_details — the preferred count source.
  for (const d of details) {
    if (typeof d?.season_number !== "number") continue;
    seasons.add(d.season_number);
    const count =
      typeof d.episode_count === "number" && d.episode_count > 0
        ? d.episode_count
        : 0;
    counts[String(d.season_number)] = count;
  }

  // 2. Fold in season_episodes — adds any season missing above, and
  //    supplies a count where season_details lacked one.
  if (episodeMap) {
    for (const [key, value] of Object.entries(episodeMap)) {
      const season = Number(key);
      if (!Number.isFinite(season)) continue;
      seasons.add(season);
      const count = typeof value === "number" && value > 0 ? value : 0;
      if (!counts[key] || counts[key] === 0) counts[key] = count;
    }
  }

  // 3. Last resort: no season list from either map → derive a bare
  //    1..N list from number_of_seasons / seasons (web's totalSeasons),
  //    with unknown (0) episode counts.
  if (seasons.size === 0) {
    const totalSeasons =
      (meta?.number_of_seasons as number | undefined) ??
      (meta?.seasons as number | undefined) ??
      1;
    const n = Math.max(1, Math.floor(totalSeasons));
    for (let s = 1; s <= n; s++) {
      seasons.add(s);
      counts[String(s)] = counts[String(s)] ?? 0;
    }
  }

  const seasonNumbers = Array.from(seasons).sort((a, b) => a - b);

  return {
    seasonNumbers,
    episodeCounts: counts,
    episodeCountFor: (season: number) => counts[String(season)] ?? 0,
  };
}
