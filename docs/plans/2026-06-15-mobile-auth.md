# Mobile Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use gli-toolkit:executing-plans (or gli-toolkit:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Add full authentication to the Expo app (`apps/mobile`) — email/password, Google OAuth, and Sign in with Apple — with an auth context, login/signup/username-setup screens, Expo Router route-group gating, sign-out, and client-side profile creation that mirrors the web app's semantics.

**Architecture:** A single `AuthProvider` (React context) wraps the app inside `src/components/providers.tsx`, subscribing to `supabase.auth.onAuthStateChange` and exposing `{ session, user, profileStatus, loading }`. The route tree splits into an `(auth)` group (login / signup / setup-username) and a `(tabs)` group (the existing app), with the root layout redirecting based on session + whether the user has a `profiles` row. Email/password uses `signUp`/`signInWithPassword` (the DB trigger auto-creates the profile from `options.data.username`). Google uses `signInWithOAuth` + `expo-web-browser` over a deep link (works in the simulator). Apple uses native `expo-apple-authentication` + `signInWithIdToken` (physical device only). OAuth/Apple users with no profile are routed to a setup-username screen that replicates the web's `createInitialProfile` via direct Supabase calls (the `profiles_insert_self` RLS policy permits it).

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19.2, expo-router v6, `@supabase/supabase-js`, `expo-web-browser`, `expo-auth-session` (redirect URI helper), `expo-apple-authentication`, TanStack Query v5, NativeWind 4, vitest (for shared pure-logic tests in `packages/types`).

---

## Context for the implementer (read before starting)

- **Read `apps/mobile/AGENTS.md` and the root `AGENTS.md` first.** Mobile-primitive-only rules, the TanStack data-layer convention, and the SecureStore session decision all apply here.
- **Expo SDK 56 / RN 0.85 / React 19.2 — APIs differ from training data.** Before writing any Expo/RN surface, check the versioned docs at https://docs.expo.dev/versions/v56.0.0/. In particular verify expo-router v6's redirect/protected-route API (`<Stack.Protected guard={...}>` exists in recent expo-router; if the installed version supports it, prefer it over imperative `router.replace` in an effect — confirm against the installed package).
- **The Supabase client already exists** at `apps/mobile/src/lib/supabase.ts`: typed `createClient<Database>`, sessions persisted via the chunked SecureStore adapter (`src/lib/secure-storage.ts`), `autoRefreshToken`, `persistSession`, foreground-only refresh. **Do not modify its auth/storage config.** Auth code consumes this client.
- **Web auth semantics to mirror** (source of truth — do NOT change web, just match behavior):
  - `apps/web/src/app/login/page.tsx` — `signInWithPassword({ email, password })`.
  - `apps/web/src/app/signup/page.tsx` — `signUp({ email, password, options: { data: { username } } })`; client validates `/^[a-z0-9_]{3,20}$/` on a lowercased username.
  - `apps/web/src/app/auth/callback/route.ts` — after session established, checks for a `profiles` row; if absent → setup-username.
  - `apps/web/src/app/actions/profile.ts` `createInitialProfile(username)` — re-validates (`/^[a-zA-Z0-9_-]{3,30}$/` — NOTE: inconsistent with signup's regex, see Task 1), checks profile-not-exists, case-insensitive uniqueness via `.ilike("username", name)`, inserts `{ id: user.id, username }`, then `supabase.auth.updateUser({ data: { username } })`.
- **DB facts (already migrated, do not recreate):**
  - Trigger `handle_new_user` (migration `005_oauth_signup_support.sql`) auto-inserts a profile when `raw_user_meta_data.username` is present — so **email/password signup needs no client-side profile insert**.
  - RLS `profiles_insert_self` + `profiles_update_self` (migration `006`) let an authenticated user insert/update their own row — so mobile can run `createInitialProfile` logic directly, no Edge Function.
  - `profiles` columns: `id` (PK = auth uid), `username` (NOT NULL, unique case-insensitive), `display_name?`, `avatar_url?`, `bio?`, `is_private`, `favorite_media_id?`, counts, timestamps.
- **Current route tree is flat and ungated:** `apps/mobile/src/app/_layout.tsx` renders `<Providers><ThemeProvider><AppTabs /></ThemeProvider></Providers>`; screens are `src/app/index.tsx` (Trending) and `src/app/explore.tsx`. `AppTabs` (`src/components/app-tabs.tsx`) defines the native tabs. This plan restructures the tree into route groups — the existing tab screens move under `(tabs)/`.
- **TanStack convention:** all data access goes through `src/queries/`. Auth mutations (sign-in/up/out, profile creation) go in a new `src/queries/auth.ts`; query keys (e.g. the current user's profile-existence) go in `src/queries/keys.ts`.

### EXTERNAL SETUP CHECKLIST (the human must do these — they gate *testing*, not coding)

Code can be written and merged before these are done; each method only works end-to-end once its row here is complete. Track status here.

| Provider | What | Where | Blocks |
|---|---|---|---|
| **Email/password** | Nothing — works out of the box | — | nothing (testable immediately, simulator OK) |
| **Google** | Create OAuth **Web** client (client ID + secret) | Google Cloud Console → APIs & Services → Credentials | Google sign-in |
| **Google** | Enable Google provider, paste client ID/secret, add redirect URLs | Supabase dashboard → Auth → Providers → Google | Google sign-in |
| **Apple** | **Apple Developer Program membership ($99/yr)** | developer.apple.com | Apple sign-in AND App Store at all |
| **Apple** | App ID with "Sign in with Apple" capability; a Services ID; a Sign-in-with-Apple **Key** (.p8) | Apple Developer → Certificates, IDs & Profiles | Apple sign-in |
| **Apple** | Enable Apple provider; enter Services ID, Team ID, Key ID, .p8 contents | Supabase dashboard → Auth → Providers → Apple | Apple sign-in |
| **Both** | Add the app's redirect URL(s) to the allow-list | Supabase dashboard → Auth → URL Configuration | Google + Apple |

**Redirect URL for mobile OAuth:** with `scheme: "intertaind"` (Task 2) the Expo redirect is `intertaind://auth/callback` plus, for dev, the Expo proxy/dev URL. The setup-username screen relies on session establishment, not on a server callback route (there is no server on mobile). Add both `intertaind://**` and the Supabase project callback to the allow-list.

**Testing-constraint note to surface to the human:** **Apple's native sign-in button does not run on the iOS Simulator** — Apple sign-in can only be verified on a physical iPhone, and only after the paid Apple Developer account + Supabase Apple provider are configured. Email/password and Google (web-browser flow) both work in the Simulator.

### Verification model

`apps/mobile` has no test runner and RN screen/hook testing isn't set up. So:
- **Unit tests (vitest):** only for *pure, extractable logic* — the shared username validator (Task 1) in `packages/types`, where vitest already runs. TDD applies there.
- **Everything else is verified by running the app** on the Simulator (email/password, Google) or a device (Apple), plus `pnpm --filter mobile exec tsc --noEmit` after each task. Each task lists explicit manual verification steps. After structural changes, run `pnpm typecheck`.
- Daily loop: `pnpm --filter mobile dev` (Metro, hot-reload). **Native config changes (Task 2: scheme, plugins, usesAppleSignIn) require a dev-client rebuild: `pnpm --filter mobile exec npx expo run:ios`.**

---

## Milestone 0 — Shared username validator (principled DRY fix)

The web app validates usernames with two *different* regexes (signup `/^[a-z0-9_]{3,20}$/` vs `createInitialProfile` `/^[a-zA-Z0-9_-]{3,30}$/`). Mobile needs the same rule; rather than copy a third inconsistent copy, put one validator in `@intertaind/types` with tests. (Wiring web to it is out of scope here — noted as a follow-up.)

### Task 1: `validateUsername` in `@intertaind/types`

**Files:**
- Create: `packages/types/src/username.ts`
- Create: `packages/types/src/username.test.ts`
- Modify: `packages/types/src/index.ts` (re-export)
- Modify: `packages/types/package.json` (add `test` script + vitest devDep, mirroring `packages/media`)

**Step 1: Write the failing test** — `packages/types/src/username.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { USERNAME_REGEX, normalizeUsername, validateUsername } from "./username.ts";

describe("normalizeUsername", () => {
  it("lowercases and trims", () => {
    expect(normalizeUsername("  JessB  ")).toBe("jessb");
  });
});

describe("validateUsername", () => {
  it("accepts a valid lowercase handle", () => {
    expect(validateUsername("jess_b")).toEqual({ ok: true, value: "jess_b" });
  });
  it("normalizes before validating", () => {
    expect(validateUsername("  JessB ")).toEqual({ ok: true, value: "jessb" });
  });
  it("rejects too short", () => {
    expect(validateUsername("ab").ok).toBe(false);
  });
  it("rejects too long (>20)", () => {
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
  });
  it("rejects illegal characters", () => {
    expect(validateUsername("jess.barrett").ok).toBe(false);
    expect(validateUsername("jess-b").ok).toBe(false);
  });
  it("returns a human message on failure", () => {
    const r = validateUsername("a");
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toMatch(/3.*20/);
  });
  it("exposes the regex for callers that want inline checks", () => {
    expect(USERNAME_REGEX.test("good_1")).toBe(true);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @intertaind/types test`
Expected: FAIL (module/exports don't exist). If `test` script/vitest missing, add them first (copy the pattern from `packages/media/package.json`: `"test": "vitest run"`, devDep `vitest`), then `pnpm install`.

**Step 3: Implement** — `packages/types/src/username.ts`:

```ts
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
```

Add to `packages/types/src/index.ts`:

```ts
export * from "./username.ts";
```

**Step 4: Run to verify it passes**

Run: `pnpm --filter @intertaind/types test`
Expected: PASS (7 tests). Then `pnpm --filter web build` to confirm the new export doesn't break web (it only adds exports).

**Step 5: Commit**

```bash
git add packages/types apps/web
git commit -m "feat: shared validateUsername in @intertaind/types"
```

---

## Milestone 1 — Auth foundation: context, gating, email/password, sign-out

End state: a fresh user sees a login screen; can sign up (email/password) and lands in the tabs; relaunching stays signed in; can sign out back to login. **Fully testable on the Simulator with zero external setup.**

### Task 2a (do FIRST): harden `secure-storage.ts` for non-native contexts

**Why:** `expo-secure-store` is native-only (no Node/web impl). `supabase.ts` constructs the client eagerly at import with `persistSession: true`, which reads SecureStore on import. When the module graph is evaluated in Node (expo-router typed-route generation, or any web-target bundle via `react-native-web`), the native module is absent and throws `ExpoSecureStore.getValueWithKeyAsync is not a function` — observed crashing the dev server on 2026-06-16. Putting `AuthProvider` into the root `_layout.tsx` (Task 3/4) widens this exposure. Fix it before building on the client.

**Files:** Modify `apps/mobile/src/lib/secure-storage.ts`.

**Approach:** Guard the adapter so that when SecureStore's native module is unavailable (Node/web), it falls back to a non-persistent in-memory `Map` instead of calling missing native functions. Detect availability once (e.g. `typeof SecureStore.getItemAsync === "function"` *and* a guarded probe, or `Platform.OS === "web"` plus a try/catch around the first native call). Keep the chunked logic for the native path unchanged. On-device behavior must be identical (verify Trending + a session round-trip still work after the change); only the Node/web path changes from "throw" to "in-memory no-persist".

**Verify:** `pnpm --filter mobile exec tsc --noEmit`; rebuild dev client and confirm session persistence still works on the Simulator (sign-in survives relaunch — exercised fully in Task 5); confirm no SecureStore TypeError in the Metro/CLI log.

**Commit:** `fix(mobile): secure-storage falls back to in-memory off-native (no SecureStore crash in Node/web eval)`

### Task 2: App config — scheme + plugins for OAuth/Apple (native rebuild)

**Files:**
- Modify: `apps/mobile/app.json`
- Add deps

**Step 1: Install deps**

```bash
pnpm --filter mobile exec npx expo install expo-web-browser expo-auth-session expo-apple-authentication
```

**Step 2: Edit `apps/mobile/app.json`** — set the scheme and add Apple config + plugins. Change `"scheme": "mobile"` → `"scheme": "intertaind"`; under `expo.ios` add `"usesAppleSignIn": true`; add `"expo-apple-authentication"` and `"expo-web-browser"` to the `plugins` array (keep existing entries):

```jsonc
{
  "expo": {
    "scheme": "intertaind",
    "ios": {
      "bundleIdentifier": "com.intertaind.app",
      "usesAppleSignIn": true
      // ...existing ios config
    },
    "plugins": [
      "expo-router",
      ["expo-splash-screen", { /* ...existing... */ }],
      "expo-secure-store",
      "expo-apple-authentication",
      "expo-web-browser"
    ]
  }
}
```

**Step 3: Rebuild the dev client** (native config changed — JS reload is not enough):

```bash
pnpm --filter mobile exec npx expo run:ios --device "iPhone 17 Pro"
```
Expected: app rebuilds and launches; Trending still renders (no regression). The new scheme `intertaind://` is now registered.

**Step 4: Commit**

```bash
git add apps/mobile/app.json apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): auth deps + intertaind scheme + apple sign-in capability"
```

### Task 3: `AuthProvider` context

**Files:**
- Create: `apps/mobile/src/components/auth-provider.tsx`
- Modify: `apps/mobile/src/components/providers.tsx` (nest AuthProvider inside QueryClientProvider)

**Step 1: Implement `auth-provider.tsx`**

```tsx
/**
 * Auth context: the single source of truth for "who is signed in" on
 * mobile. Subscribes to Supabase auth-state changes and tracks whether
 * the signed-in user has completed profile setup (picked a username).
 *
 * Sits INSIDE QueryClientProvider (it uses the query client to look up
 * profile existence) and OUTSIDE the navigation tree (the root layout
 * reads this to gate routes).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ProfileStatus = "unknown" | "missing" | "present";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Whether the signed-in user has a profiles row yet. */
  profileStatus: ProfileStatus;
  /** True until the initial session check resolves — gate nav on this. */
  loading: boolean;
  /** Re-check profile existence (call after creating a profile). */
  refreshProfileStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfileStatus(userId: string): Promise<ProfileStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Network/RLS error — treat as unknown so we don't bounce the user
    // to setup-username on a transient failure.
    return "unknown";
  }
  return data ? "present" : "missing";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("unknown");
  const [loading, setLoading] = useState(true);

  async function syncProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setProfileStatus("unknown");
      return;
    }
    setProfileStatus(await fetchProfileStatus(nextSession.user.id));
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await syncProfile(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        await syncProfile(nextSession);
      }
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profileStatus,
      loading,
      refreshProfileStatus: () => syncProfile(session),
    }),
    [session, profileStatus, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
```

**Step 2: Nest it in `providers.tsx`** — wrap children with `<AuthProvider>` inside `<QueryClientProvider>`:

```tsx
import { AuthProvider } from "./auth-provider";
// ...
return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);
```

**Step 3: Verify** — `pnpm --filter mobile exec tsc --noEmit` passes.

**Step 4: Commit**

```bash
git add apps/mobile/src/components/auth-provider.tsx apps/mobile/src/components/providers.tsx
git commit -m "feat(mobile): AuthProvider context (session + profile status)"
```

### Task 4: Restructure routes into `(auth)` and `(tabs)` groups + gating

**Files:**
- Create dir `apps/mobile/src/app/(auth)/` and `apps/mobile/src/app/(tabs)/`
- Move: `src/app/index.tsx` → `src/app/(tabs)/index.tsx`; `src/app/explore.tsx` → `src/app/(tabs)/explore.tsx`
- Create: `src/app/(tabs)/_layout.tsx` (renders `<AppTabs />`)
- Create: `src/app/(auth)/_layout.tsx` (a Stack)
- Rewrite: `src/app/_layout.tsx` (root: providers + gating)

**Step 1: Move the tab screens** (preserve history):

```bash
mkdir -p "apps/mobile/src/app/(tabs)" "apps/mobile/src/app/(auth)"
git mv apps/mobile/src/app/index.tsx "apps/mobile/src/app/(tabs)/index.tsx"
git mv apps/mobile/src/app/explore.tsx "apps/mobile/src/app/(tabs)/explore.tsx"
```

**Step 2: `(tabs)/_layout.tsx`** — move the `AppTabs` rendering here:

```tsx
import AppTabs from "@/components/app-tabs";

export default function TabsLayout() {
  return <AppTabs />;
}
```

(Check `app-tabs.tsx` route hrefs still resolve — tab screens are now under `(tabs)` but route groups are path-transparent in expo-router, so `/` and `/explore` are unchanged. Verify the `NativeTabs` trigger names still match the file names.)

**Step 3: `(auth)/_layout.tsx`**:

```tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

**Step 4: Rewrite root `src/app/_layout.tsx`** — providers + redirect gating. Confirm the expo-router v6 redirect API against the installed package; this uses imperative redirects in an effect, which is universally supported:

The `AuthProvider` exposes `profileStatus: "none" | "missing" | "present" | "error"` (Task 3, hardened): `"none"` = no session, `"missing"` = signed in without a profile, `"present"` = has profile, `"error"` = signed in but the profile-existence fetch failed. Gating MUST NOT silently fall through on `"error"` (that would strand a signed-in user) — render a retry instead. Also render a splash while `loading` so no wrong-screen flashes before the initial session check resolves.

```tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from "react-native";

import "@/global.css";

import Providers from "@/components/providers";
import { useAuth } from "@/components/auth-provider";

function RootNavigator() {
  const { session, profileStatus, loading, refreshProfileStatus } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // wait for the initial session check

    const inAuthGroup = segments[0] === "(auth)";
    const onSetupUsername = segments[1] === "setup-username";

    if (!session) {
      // Not signed in → must be in the auth group.
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    // Signed in with a profile → out of the auth group into the app.
    if (profileStatus === "present") {
      if (inAuthGroup) router.replace("/(tabs)");
      return;
    }

    // Signed in but no profile yet → force username setup.
    if (profileStatus === "missing") {
      if (!onSetupUsername) router.replace("/(auth)/setup-username");
      return;
    }

    // profileStatus === "error" (transient fetch failure while signed in):
    // do NOT route — we don't know whether they have a profile, so guessing
    // would strand them. The render path below shows a retry instead.
  }, [session, profileStatus, loading, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-950">
        <ActivityIndicator />
      </View>
    );
  }

  if (session && profileStatus === "error") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-neutral-950 px-6">
        <Text className="text-center text-white">
          Couldn&apos;t load your profile. Check your connection and try again.
        </Text>
        <Pressable
          className="rounded-lg bg-blue-600 px-4 py-3"
          onPress={() => refreshProfileStatus()}
        >
          <Text className="font-semibold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <Providers>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <RootNavigator />
      </ThemeProvider>
    </Providers>
  );
}
```

(Note: the `AnimatedSplashOverlay` previously in the root layout — re-add it inside `RootNavigator`'s returned tree if still wanted, or drop it. Keep behavior intentional, don't silently lose it.)

**Step 5: Verify** — `pnpm --filter mobile exec tsc --noEmit` passes. Run the app: with no session you'll land on `/(auth)/login` — which 404s until Task 5. That's expected; proceed.

**Step 6: Commit**

```bash
git add apps/mobile/src/app
git commit -m "feat(mobile): route groups (auth)/(tabs) + session gating in root layout"
```

> **STYLING DIRECTIVE for ALL auth screens (Tasks 5, 6, 7, 8):** The code samples below use raw Tailwind palette classes (`bg-neutral-950`, `bg-blue-600`, `text-white`, `#888`, etc.) for brevity — **these are illustrative only. Do NOT ship them.** Per root `AGENTS.md` + `apps/mobile/AGENTS.md`, all colors MUST come from the design-system semantic tokens (there's a CI drift-check). Before writing each screen, read `apps/mobile/src/app/(tabs)/index.tsx` (canonical vocabulary) and `packages/design-system/src/tokens.cjs` for the actual token names, and map: screen bg → `bg-surface-default`; body text → `text-text-primary`; secondary/help text → `text-text-muted`; primary button → `bg-brand` with `text-text-primary` label; inputs/cards → the raised-surface token defined in tokens.cjs (check the exact name). Placeholder colors: use a token-derived value, not a raw hex. The root gating views in `_layout.tsx` were already converted to tokens (commit f267ecb) — match that.

### Task 5: Auth mutations (`queries/auth.ts`) + login & signup screens + sign-out

**Files:**
- Modify: `apps/mobile/src/queries/keys.ts` (add `auth` keys if needed)
- Create: `apps/mobile/src/queries/auth.ts`
- Create: `apps/mobile/src/app/(auth)/login.tsx`
- Create: `apps/mobile/src/app/(auth)/signup.tsx`
- Modify: a signed-in screen to add a sign-out control (e.g. `src/app/(tabs)/explore.tsx` or a new settings affordance)

**Step 1: `queries/auth.ts`** — mutations following the TanStack convention (throw on error):

```ts
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
    }) => {
      const check = validateUsername(vars.username);
      if (!check.ok) throw new Error(check.error);
      // Username in options.data → DB trigger creates the profile row.
      const { error } = await supabase.auth.signUp({
        email: vars.email,
        password: vars.password,
        options: { data: { username: check.value } },
      });
      if (error) throw error;
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
```

**Step 2: `(auth)/login.tsx`** — NativeWind-styled, mobile primitives, `Link` to signup. (Use design-system tokens, not raw colors — see Trending screen for the pattern.)

```tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { useSignInMutation } from "@/queries/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignInMutation();

  return (
    <View className="flex-1 justify-center gap-4 bg-neutral-950 px-6">
      <Text className="text-2xl font-bold text-white">Welcome back</Text>
      <TextInput
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white"
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white"
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {signIn.error && (
        <Text className="text-sm text-red-400">{signIn.error.message}</Text>
      )}
      <Pressable
        className="items-center rounded-lg bg-blue-600 py-3"
        disabled={signIn.isPending}
        onPress={() => signIn.mutate({ email, password })}
      >
        {signIn.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="font-semibold text-white">Sign in</Text>
        )}
      </Pressable>
      {/* Google + Apple buttons added in Milestones 3 & 4 */}
      <Link href="/(auth)/signup" className="text-center text-blue-400">
        Need an account? Sign up
      </Link>
    </View>
  );
}
```

**Step 3: `(auth)/signup.tsx`** — same shape, with a username field; on success the gating effect routes the user (trigger creates the profile, so `profileStatus` resolves to `present`). Show `validateUsername` errors inline before submit.

**Step 4: Sign-out control** — add a `Pressable` calling `useSignOutMutation().mutate()` somewhere reachable when signed in (e.g. top of `(tabs)/explore.tsx`). On success, `onAuthStateChange` clears the session and the gating effect redirects to login.

**Step 5: Verify on the Simulator** (email/password is fully functional now):
- Launch → lands on login.
- Sign up with a new email + valid username → lands in the tabs (Trending). 
- Confirm in Supabase dashboard (Auth → Users; Table editor → profiles) that the user + profile row exist with the username.
- Kill and relaunch the app → still signed in (SecureStore session). 
- Sign out → returns to login.
- Sign in with the same credentials → back to tabs.
- Also run `pnpm --filter mobile exec tsc --noEmit`.

**Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): email/password login, signup, sign-out"
```

---

## Milestone 2 — Setup-username screen (for OAuth/Apple users)

End state: a signed-in user with no profile is forced to pick a username; submitting creates the profile and drops them into the app. (You can test this *before* OAuth exists by temporarily deleting your profile row in the Supabase dashboard while staying signed in, then relaunching.)

### Task 6: `createProfile` mutation + setup-username screen

**Files:**
- Modify: `apps/mobile/src/queries/auth.ts` (add `useCreateProfileMutation`)
- Create: `apps/mobile/src/app/(auth)/setup-username.tsx`

**Step 1: Add `useCreateProfileMutation` to `queries/auth.ts`** — mirrors web `createInitialProfile`:

```ts
import { useAuth } from "@/components/auth-provider";
// ...
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

      // Case-insensitive uniqueness check.
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", name)
        .maybeSingle();
      if (taken) throw new Error("Username is already taken.");

      const { error: insertErr } = await supabase
        .from("profiles")
        .insert({ id: user.id, username: name });
      if (insertErr) throw new Error(insertErr.message);

      // Keep auth metadata in sync (web does this too).
      await supabase.auth.updateUser({ data: { username: name } });
    },
    onSuccess: () => refreshProfileStatus(),
  });
}
```

**Step 2: `(auth)/setup-username.tsx`** — single username field, pre-fill a suggestion from `user.user_metadata.name` or the email prefix (normalized via `normalizeUsername`), submit calls the mutation; on success `refreshProfileStatus` flips `profileStatus` to `present` and the gating effect routes to `/(tabs)`. No sign-out-on-this-screen footgun — but DO offer a "sign out" link so a user can escape if they abandon setup.

**Step 3: Verify on the Simulator:**
- While signed in, delete your `profiles` row in the Supabase dashboard, then relaunch the app (or pull to trigger an auth refresh) → you should be routed to setup-username.
- Pick a new unique username → lands in tabs; profiles row recreated.
- Try a taken username → inline "already taken" error.
- `pnpm --filter mobile exec tsc --noEmit`.

**Step 4: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): setup-username screen + client-side profile creation"
```

---

## Milestone 3 — Google OAuth (Simulator-testable once Supabase+Google configured)

Prereq: the Google rows in the external checklist. End state: "Continue with Google" on login/signup opens a browser, returns to the app authenticated; new Google users hit setup-username (no `username` in metadata → no profile → gating routes them).

> **REQUIRED FIRST (native config sync):** Task 2 changed `scheme`→`intertaind` and added `usesAppleSignIn` + the apple/web-browser plugins in `app.json`, but the `expo run:ios` there did an *incremental* build — the on-disk `ios/` project still carries the OLD `mobile` scheme in `Info.plist` and an empty `mobile.entitlements`. Before Google (deep-link redirect) or Apple (entitlement) can work end-to-end, run a **clean prebuild + rebuild**:
> ```bash
> pnpm --filter mobile exec expo prebuild -p ios --clean
> pnpm --filter mobile exec npx expo run:ios --device "iPhone 17 Pro"
> ```
> Then VERIFY (this is the real acceptance check for the Task 2 config): `ios/mobile/Info.plist` `CFBundleURLSchemes` contains `intertaind` (and `exp+intertaind`), and `ios/mobile/mobile.entitlements` contains `com.apple.developer.applesignin`. Do NOT assume "it built" means the config applied — the incremental build masked it once already. (`ios/` is gitignored/CNG-generated — nothing to commit from this.)

### Task 7: Google sign-in via `signInWithOAuth` + `expo-web-browser`

**Files:**
- Modify: `apps/mobile/src/queries/auth.ts` (add `useGoogleSignInMutation`)
- Create: `apps/mobile/src/components/google-sign-in-button.tsx`
- Modify: `(auth)/login.tsx` and `(auth)/signup.tsx` (render the button)

**Step 1: Implement the OAuth helper** — the web-browser/deep-link flow (verify `expo-auth-session`'s `makeRedirectUri` + `expo-web-browser`'s `openAuthSessionAsync` signatures against installed SDK 56 docs):

```ts
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
// ...
export function useGoogleSignInMutation() {
  return useMutation({
    mutationFn: async () => {
      const redirectTo = makeRedirectUri({ scheme: "intertaind", path: "auth/callback" });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No OAuth URL returned.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success" || !result.url) {
        throw new Error("Sign-in cancelled.");
      }
      // Exchange the returned code/tokens for a session.
      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) throw exErr;
      } else {
        // Some flows return tokens in the URL fragment — handle via
        // setSession if `access_token`/`refresh_token` are present.
        // Confirm which your Supabase project returns and implement the
        // matching branch. (PKCE → code; implicit → fragment tokens.)
        throw new Error("OAuth response missing authorization code.");
      }
    },
  });
}
```

> **Implementer note:** PKCE (the supabase-js default) returns a `code` to exchange — the branch above. Verify against SDK 56 docs whether `WebBrowser.openAuthSessionAsync` returns the redirect URL with the code, and adjust parsing if the project is configured for the implicit/fragment flow. Test the happy path before adding the fragment branch (YAGNI if PKCE works).

**Step 2: `google-sign-in-button.tsx`** — a `Pressable` calling the mutation, with loading + error states; reusable on both screens.

**Step 3: Wire into login & signup** — render `<GoogleSignInButton />` under the email/password form.

**Step 4: Verify on the Simulator** (requires Google checklist done):
- Tap "Continue with Google" → in-app browser → Google consent → returns to app.
- A brand-new Google user (no profile) → routed to setup-username → pick username → tabs.
- Sign out, sign back in with Google (now has profile) → straight to tabs.
- `pnpm --filter mobile exec tsc --noEmit`.
- If it fails: check the redirect URL is in Supabase's allow-list and the Google provider client ID/secret are correct (most failures are config, not code).

**Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Google OAuth sign-in"
```

---

## Milestone 4 — Sign in with Apple (PHYSICAL DEVICE ONLY)

Prereq: the Apple rows in the external checklist (paid account + Supabase Apple provider). End state: "Sign in with Apple" on a physical iPhone authenticates via the native sheet; new users hit setup-username.

> **Cannot be verified on the Simulator.** Requires a real iPhone running the dev client (build with `expo run:ios --device` targeting the connected device, or an EAS dev build) and the paid Apple Developer account.

### Task 8: Apple sign-in via `expo-apple-authentication` + `signInWithIdToken`

**Files:**
- Modify: `apps/mobile/src/queries/auth.ts` (add `useAppleSignInMutation`)
- Create: `apps/mobile/src/components/apple-sign-in-button.tsx`
- Modify: `(auth)/login.tsx`, `(auth)/signup.tsx` (render the Apple button — iOS only)

**Step 1: Implement** (verify `expo-apple-authentication` API against SDK 56 docs):

```ts
import * as AppleAuthentication from "expo-apple-authentication";
// ...
export function useAppleSignInMutation() {
  return useMutation({
    mutationFn: async () => {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) throw error;
    },
  });
}
```

**Step 2: `apple-sign-in-button.tsx`** — use the native `AppleAuthentication.AppleAuthenticationButton`; render only on iOS (`Platform.OS === "ios"`) and only where `AppleAuthentication.isAvailableAsync()` resolves true.

**Step 3: Wire into login & signup** (iOS only).

**Step 4: Verify on a physical iPhone** (Apple checklist done):
- Build to the device, tap "Sign in with Apple" → native sheet → Face/Touch ID → authenticated.
- New Apple user → setup-username → tabs.
- Note: Apple only returns name/email on the *first* authorization; the identity token is enough for the session regardless.
- `pnpm --filter mobile exec tsc --noEmit`.

**Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Sign in with Apple"
```

---

## Final verification

- `pnpm typecheck` (all workspaces) green.
- `pnpm test` green (the new username-validator tests run under `@intertaind/types`).
- Update `apps/mobile/AGENTS.md`: add an "Auth" subsection documenting the AuthProvider, the route-group gating, and the three methods; move nothing into deferred (auth is now shipped). Note Apple-needs-device + the external dashboards.
- Update the deferred-items list — auth is done; Edge Functions remain the only deferred item.
- Manual smoke: full email/password + Google flows on the Simulator; Apple on a device if the account is ready.

## Follow-ups (out of scope; record, don't lose)

- Point the **web** signup + `createInitialProfile` at the shared `validateUsername` from `@intertaind/types` to kill the regex inconsistency (Task 1 only added the shared validator; it didn't rewire web). **Migration caveat (must handle):** the shared validator standardizes on the *stricter* `/^[a-z0-9_]{3,20}$/`, but web's `createInitialProfile`/`updateProfile` used the looser `/^[a-zA-Z0-9_-]{3,30}$/`. Existing production usernames may contain uppercase, dashes, or 21–30 chars — all now rejected. When wiring web: validate only on *change* (grandfather existing values) or run a rename/migration, or users editing their profile get locked out by resubmitting their own current username.
- **Gating approach — `Stack.Protected` vs imperative-effect (decision to revisit):** Task 4 gates via `router.replace` in a root effect. Code review noted expo-router v6's `<Stack.Protected guard={...}>` exists and is the more durable option the plan originally preferred — it gates by *render* so protected screens are never mounted pre-redirect, eliminating the one-frame flash on warm in-session transitions (e.g. sign-out while on a tabs screen). The imperative approach works and cold-start/deep-link flashes are already prevented by the `loading` splash guard; the only residual is a one-frame warm-transition flash (low severity). Deferred as a conscious tradeoff — migrate to `Stack.Protected` if the flash proves noticeable or to align with the long-term-durability mandate.
- **Humanize auth error messages (shared web + mobile):** both apps surface raw `error.message` from Supabase ("Invalid login credentials", "User already registered", "Password should be at least 6 characters"). Map the common cases to friendlier copy in ONE shared helper so the two platforms stay consistent.
- **Keyboard avoidance on mobile auth forms:** login/signup/setup-username are vertically-centered `View`s; on smaller devices the keyboard can obscure lower fields. Wrap in `KeyboardAvoidingView` (or `react-native-keyboard-controller`) when polishing.
- Password reset / email confirmation flows (web doesn't have them yet either).
- Account screen (display name, avatar, sign-out) — sign-out currently lives wherever Task 5 placed it.
