/**
 * TanStack Query mutations for auth (email/password + Google OAuth).
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
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

/**
 * Google sign-in via Supabase OAuth + an in-app web browser + a deep-link
 * back into the app.
 *
 * Flow (works on iOS Simulator + cross-platform, and sidesteps the native
 * Google SDK's ID-token nonce pitfall):
 *  1. `signInWithOAuth` with `skipBrowserRedirect` hands us the provider URL
 *     instead of navigating — we own the browser presentation.
 *  2. `openAuthSessionAsync` opens the Google consent screen and resolves
 *     when Google redirects to `intertaind://auth/callback` (the deep link
 *     registered by the app scheme after a clean prebuild — a separate step).
 *  3. PKCE is enabled explicitly on the client (`flowType: "pkce"` in
 *     `src/lib/supabase.ts`), so that redirect carries an authorization
 *     `code` (a query param, NOT a URL fragment). We exchange it for a session.
 *
 * No navigation on success — like the other auth mutations, the new session
 * fires `onAuthStateChange` and root gating routes: a brand-new Google user
 * has no `profiles` row → gating sends them to setup-username; a returning
 * user → tabs.
 *
 * User-cancel (they close the browser) is NOT an error — we return quietly so
 * the UI doesn't surface a scary message for an intentional dismissal.
 */
export function useGoogleSignInMutation() {
  return useMutation({
    mutationFn: async () => {
      const redirectTo = makeRedirectUri({
        scheme: "intertaind",
        path: "auth/callback",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No OAuth URL returned from Supabase.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      // User closed the browser — intentional, not a failure. Abort quietly.
      if (result.type === "cancel" || result.type === "dismiss") return;
      if (result.type !== "success") {
        throw new Error("Google sign-in did not complete.");
      }

      // PKCE: the success redirect carries the authorization code as a query
      // param. Exchange it for a session (PKCE is enabled explicitly via
      // `flowType: "pkce"` in src/lib/supabase.ts, so there is no
      // implicit/fragment token path to handle here).
      const code = new URL(result.url).searchParams.get("code");
      if (!code) throw new Error("OAuth response missing authorization code.");

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    },
  });
}

export function useSignOutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    // Privacy backstop: drop ALL cached data (shelves, tracking, activity)
    // so nothing from this account can be served to the next one.
    onSuccess: () => queryClient.clear(),
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
