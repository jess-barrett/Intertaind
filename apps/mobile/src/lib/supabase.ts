import { createClient, processLock } from "@supabase/supabase-js";
import { AppState } from "react-native";

import type { Database } from "@intertaind/supabase";

import { secureStorage } from "./secure-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Set them in apps/mobile/.env and restart the dev server (expo start --clear)."
  );
}

// Typed against the generated `Database` schema so every query/insert
// is checked against the live Postgres tables. Regenerate the type
// after every migration: `pnpm gen:types`.
//
// Storage uses our chunked SecureStore wrapper so the session token
// goes into the device's hardware-backed Keychain/Keystore instead of
// plaintext on disk. Required for production — see apps/mobile/AGENTS.md.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
    // PKCE is required for the OAuth code-exchange flow used by Google
    // sign-in (see queries/auth.ts). auth-js defaults to "implicit", which
    // would return tokens in the URL fragment instead of a `?code=`, so the
    // exchangeCodeForSession path could never succeed without this override.
    flowType: "pkce",
  },
});

// Token refresh should only tick while the app is foregrounded.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
