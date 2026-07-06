/**
 * Map a tracking-mutation rejection to a user-facing string. NEVER render
 * the raw Supabase/fetch error — it leaks internals ("JWT expired",
 * PostgREST codes). The raw error is logged to the console instead.
 *
 * Shared by the action strip AND every log/review/season/episode sheet so
 * the mapping (and the friendly copy) lives in ONE place rather than being
 * re-inlined per component. The network-vs-generic split is deliberate: a
 * failed fetch gets a "check your connection" line; anything else gets the
 * generic line with the caller's `subject`.
 *
 * @param err     the rejection value — may be a plain PostgREST object, not
 *                an `Error` instance (postgrest-js resolves a failed fetch
 *                into a plain object whose `.message` is "TypeError: Network
 *                request failed", which `String(obj)` would hide).
 * @param subject trailing noun for the generic case (e.g. "your log",
 *                "your changes").
 * @param logTag  short source tag for the `console.warn`.
 */
export function trackingErrorMessage(
  err: unknown,
  subject = "your changes",
  logTag = "tracking",
): string {
  console.warn(`[${logTag}] mutation failed:`, err);
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  if (err instanceof TypeError || /network request failed/i.test(message)) {
    return "Couldn't save — check your connection and try again.";
  }
  return `Something went wrong saving ${subject}.`;
}
