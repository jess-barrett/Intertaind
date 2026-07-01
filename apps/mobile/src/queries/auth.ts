/**
 * TanStack Query mutations for email/password auth.
 *
 * Mutations (not queries) because these are imperative user actions.
 * Each throws on the Supabase error so the calling component reads the
 * failure via `mutation.error` and `mutation.isPending` — the same
 * throw-on-error convention the read hooks use (see apps/mobile/AGENTS.md).
 *
 * No navigation happens here. The root gating in `src/app/_layout.tsx`
 * reacts to `onAuthStateChange` (via AuthProvider) and redirects once
 * the session changes, so sign-in / sign-up / sign-out screens never
 * call the router themselves.
 */

import { useMutation } from "@tanstack/react-query";
import { validateUsername } from "@intertaind/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export function useSignInMutation() {
  return useMutation({
    mutationFn: async (vars: { email: string; password: string }) => {
      const { error } = await supabase.auth.signInWithPassword(vars);
      if (error) throw error;
    },
  });
}

export function useSignUpMutation() {
  return useMutation({
    mutationFn: async (vars: {
      email: string;
      password: string;
      username: string;
    }): Promise<{ needsConfirmation: boolean }> => {
      const check = validateUsername(vars.username);
      if (!check.ok) throw new Error(check.error);
      const { data, error } = await supabase.auth.signUp({
        email: vars.email,
        password: vars.password,
        options: { data: { username: check.value } },
      });
      if (error) throw error;
      // With email confirmation ENABLED, signUp succeeds but returns no
      // session — the user must confirm via email before a session exists.
      // Surface that so the screen can show a notice instead of freezing.
      return { needsConfirmation: data.session === null };
    },
  });
}

export function useSignOutMutation() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  });
}

/**
 * Create the signed-in user's profiles row after they pick a username —
 * the mobile analogue of web's `createInitialProfile` server action.
 *
 * Unlike web (which runs on a trusted server), this issues the writes as
 * the user directly; the `profiles_insert_self` + `profiles_update_self`
 * RLS policies scope them to `auth.uid()`. Same guards as web: refuse if a
 * profile already exists, reject case-insensitive collisions before insert.
 *
 * No navigation here (see the file header) — `refreshProfileStatus` flips
 * `profileStatus` "missing" → "present" and root gating routes to /(tabs).
 */
export function useCreateProfileMutation() {
  const { user, refreshProfileStatus } = useAuth();
  return useMutation({
    mutationFn: async (rawUsername: string) => {
      if (!user) throw new Error("Not signed in.");
      const check = validateUsername(rawUsername);
      if (!check.ok) throw new Error(check.error);
      const name = check.value;

      // Refuse if a profile already exists for this user.
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (existing) throw new Error("Profile already set up.");

      // Case-insensitive uniqueness check. Escape LIKE metacharacters so `_`
      // in a username is matched literally, not as a wildcard. name is already
      // lowercased by validateUsername.
      const likePattern = name.replace(/[\\%_]/g, "\\$&");
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", likePattern)
        .maybeSingle();
      if (taken) throw new Error("Username is already taken.");

      // The insert is the real uniqueness arbiter — the pre-check above is
      // best-effort and can miss (RLS-hidden private profiles / races). Remap
      // a unique-constraint violation (Postgres code 23505) to a friendly
      // message instead of leaking raw Postgres text.
      const { error: insertErr } = await supabase
        .from("profiles")
        .insert({ id: user.id, username: name });
      if (insertErr) {
        if (insertErr.code === "23505") {
          throw new Error("Username is already taken.");
        }
        throw new Error(insertErr.message);
      }

      // Best-effort mirror into auth metadata; the profiles row is
      // authoritative, so a failure here must not block the success path.
      await supabase.auth.updateUser({ data: { username: name } }).catch(() => {});
    },
    onSuccess: () => refreshProfileStatus(),
  });
}
