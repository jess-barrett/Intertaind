/**
 * Extract the year from an ISO-style date string ("YYYY-MM-DD" or
 * "YYYY"). Reading via `new Date(s).getFullYear()` is a timezone trap —
 * "2006-01-01" parses as UTC midnight, then `getFullYear()` returns the
 * LOCAL year. On any negative-UTC server (PT/MT/CT/ET) "2006-01-01"
 * displays as 2005. String-slicing is bulletproof when we control the
 * format upstream (we do — the DB column is `date` and supabase
 * returns ISO strings).
 */
export function yearFromDateString(
  s: string | null | undefined
): number | null {
  if (!s) return null;
  const match = s.match(/^(\d{4})/);
  if (!match) return null;
  const y = Number(match[1]);
  return Number.isFinite(y) ? y : null;
}

/** Compact relative time: "just now", "3m", "2h", "5d", otherwise a date. */
export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}
