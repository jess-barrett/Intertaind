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
