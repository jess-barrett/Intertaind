/**
 * Helpers for reading `media_items.metadata` — an untyped JSONB blob whose
 * shape the DB types don't guarantee. Guard the shape here rather than
 * casting blindly at each call site (a bare `as T[]` throws on a malformed
 * non-array row when it's later `.map`ped).
 */

/** Return `value` as `T[]` only if it's actually an array, else `[]`. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
