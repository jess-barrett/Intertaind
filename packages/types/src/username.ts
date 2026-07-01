/**
 * Canonical username rule for Intertaind, shared by web and mobile.
 * Lowercase letters, digits, underscore; 3–20 chars. We standardize on
 * the stricter signup rule (no uppercase, no dash) — uniqueness is
 * enforced case-insensitively in the DB, so allowing case here only
 * invites confusable handles.
 */
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export type UsernameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateUsername(input: string): UsernameValidation {
  const value = normalizeUsername(input);
  if (!USERNAME_REGEX.test(value)) {
    return {
      ok: false,
      error:
        "Username must be 3–20 characters: lowercase letters, numbers, and underscores only.",
    };
  }
  return { ok: true, value };
}
