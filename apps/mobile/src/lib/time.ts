/**
 * Compact relative-time formatter — the RN mirror of web's `relativeTime`
 * (apps/web/src/lib/time.ts). "just now", "3m", "2h", "5d", then a locale
 * date. Kept tiny + framework-free (no date lib) so an activity row's
 * timestamp needs no dependency. Clamps future timestamps to "just now" so a
 * slight client/server clock skew never renders a negative age.
 */
export function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}
