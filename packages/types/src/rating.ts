/**
 * Rating ↔ stars conversion, shared by web and mobile.
 *
 * There are TWO rating scales in the system — they have been confused
 * before (mobile double-divided and showed community ratings at half
 * value), so know which column you're holding:
 *
 * - `user_media.rating` — an individual's rating, stored as a **1–10
 *   integer** in the DB. Each step is half a star, so it displays as
 *   **0.5–5.0**. THESE helpers convert that column (and only that
 *   column), mirroring web's `StarRating` / `StarRatingDisplay`
 *   semantics (`apps/web/src/components/star-rating.tsx`).
 * - `media_items.avg_rating` — the community aggregate, **already on
 *   the 0–5 display scale**: migration `025_media_rating_aggregate.sql`
 *   divides in SQL (`AVG(rating)::numeric / 2.0`). Render it as-is.
 *   It must NEVER be passed through these helpers — converting it
 *   again halves the community rating.
 */

/** Clamp a raw DB rating into the valid 1–10 range. */
function clampDbRating(dbRating: number): number {
  return Math.min(10, Math.max(1, dbRating));
}

/**
 * DB scale (1–10 int, `user_media.rating`) → display stars (0.5–5.0).
 *
 * - `null` propagates (`null` = unrated).
 * - Non-finite input (a failed `Number()` coercion upstream) is treated
 *   as unrated — returns `null` — so bad data can never render "NaN"
 *   or head toward a DB write.
 * - Out-of-range DB values (0, 11, −3) are clamped into 1..10 BEFORE
 *   converting — defensive: bad data renders as the nearest valid
 *   star value instead of crashing (e.g. `ratingToStars(0)` → 0.5,
 *   `ratingToStars(11)` → 5.0).
 * - `ratingToStars(7)` → 3.5.
 */
export function ratingToStars(dbRating: number | null): number | null {
  if (dbRating === null || !Number.isFinite(dbRating)) return null;
  return clampDbRating(dbRating) / 2;
}

/**
 * Display stars (0.5–5.0) → DB scale (1–10 int, `user_media.rating`).
 *
 * - `null` propagates (`null` = unrated).
 * - Non-finite input (a failed `Number()` coercion upstream) is treated
 *   as unrated — returns `null` — so bad data can never render "NaN"
 *   or head toward a DB write.
 * - `starsToRating(3.5)` → 7.
 * - Values between half-star steps round to the nearest valid int:
 *   `starsToRating(3.3)` → 7 (3.3 × 2 = 6.6 → round → 7).
 * - The result is clamped into 1..10 (`starsToRating(6)` → 10).
 * - `starsToRating(0)` (or a negative) clamps to 1, NOT null: 0 stars
 *   means "cleared" and should be expressed as `null` by the CALLER.
 *   Passing 0 here is a caller bug, but clamping beats crashing.
 */
export function starsToRating(stars: number | null): number | null {
  if (stars === null || !Number.isFinite(stars)) return null;
  return clampDbRating(Math.round(stars * 2));
}

/**
 * True when `stars` is a value the UI may submit: 0.5–5.0 inclusive,
 * in exact 0.5 steps (0.5, 1, 1.5, …, 5). Rejects 0 ("cleared" is
 * `null`, not a star value), out-of-range values, and anything between
 * steps (3.25).
 */
export function isValidStars(stars: number): boolean {
  return stars >= 0.5 && stars <= 5.0 && Number.isInteger(stars * 2);
}

/**
 * Display-scale stars → `"3.5"`-style string (one decimal, `toFixed(1)`,
 * so whole stars render `"5.0"`).
 *
 * - `null` propagates (`null` = unrated — render nothing, not "null").
 * - Non-finite input (a failed `Number()` coercion upstream) is treated
 *   as unrated — returns `null` — so bad data can never render "NaN".
 *
 * Pairs with `ratingToStars`:
 * `formatStars(ratingToStars(raw))` is the display pipeline for
 * `user_media.rating`, and it is null-safe end to end.
 */
export function formatStars(stars: number | null): string | null {
  if (stars === null || !Number.isFinite(stars)) return null;
  return stars.toFixed(1);
}

/**
 * DB-scale guard: true only for an **integer 1–10** — a value that may
 * be written to `user_media.rating`. Use at the WRITE boundary:
 * mutations must reject invalid ratings, not clamp them (clamping on
 * write would silently persist corrupted input; clamping is for READS,
 * where `ratingToStars` handles it).
 *
 * Rejects non-integers (3.5 is a STARS value — convert with
 * `starsToRating` first), out-of-range values (0, 11), and NaN.
 */
export function isValidDbRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 10;
}
