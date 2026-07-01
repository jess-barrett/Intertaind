/**
 * Chunked SecureStore adapter that implements Supabase's `Storage`
 * interface so the auth session can persist into the hardware-backed
 * Keychain (iOS) / Keystore (Android) instead of plaintext on disk.
 *
 * Why chunking: Android SecureStore caps each value at 2048 bytes.
 * Supabase session tokens (access + refresh + user metadata) routinely
 * blow past that — usually 3–5 KB. Without chunking the call silently
 * fails and the user can't stay signed in across app restarts.
 *
 * Layout for a single logical key `K`:
 *   - `K`        — single string: the integer chunk count. Written LAST
 *                  during setItem so a partially-written value is
 *                  treated as absent by getItem (no partial reads).
 *   - `K.0` …    — the chunks themselves, in order, each ≤ CHUNK_SIZE.
 *
 * SecureStore key names are limited to 80 chars; Supabase keys
 * (e.g. `sb-<ref>-auth-token`) plus a `.NN` suffix fit comfortably.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// `expo-secure-store` is a NATIVE-ONLY module — there is no Node or web
// implementation of the underlying Keychain/Keystore bridge. When this
// module graph is evaluated off-device (expo-router typed-route
// generation runs under Node; a `react-native-web` target bundle runs in
// the browser) the native bridge is absent, and any call — e.g.
// `SecureStore.getItemAsync` — throws
// `TypeError: ExpoSecureStore.getValueWithKeyAsync is not a function`.
//
// Detecting this at module-load with `typeof SecureStore.getItemAsync ===
// "function"` does NOT work: `getItemAsync`/`setItemAsync`/
// `deleteItemAsync` are top-level `export async function` wrappers in
// expo-secure-store, so they ALWAYS exist as functions on every platform
// (Node included). They only reach into the missing native object
// (`ExpoSecureStore.getValueWithKeyAsync`) at CALL time — which is where
// the throw actually happens. A load-time `typeof` probe is therefore
// inert; it can't see the missing bridge.
//
// So availability is detected the only place the real signal exists: at
// call time. `secureStorage` below is a thin wrapper carrying a mutable
// `nativeUsable` latch (seeded from `Platform.OS`, since web genuinely
// has no secure store). Each method:
//   - web / already-latched-off → delegates to the in-memory store;
//   - otherwise → tries the native chunked adapter; on success returns
//     it; on a `TypeError: … is not a function` (the missing-bridge
//     signature) it latches `nativeUsable = false` and falls back to
//     in-memory for this call and every call after.
//
// Crucially, ANY other error — biometric cancel, Keychain/Keystore access
// failure, etc. — is re-thrown unchanged. Those are genuine on-device
// failures Supabase must see; we only swallow the "module isn't here"
// case. The Supabase client (`supabase.ts`) is constructed eagerly at
// import with `persistSession: true`, so it reaches into this adapter the
// moment the graph is evaluated — the latch is what keeps that from
// crashing Node/web evals. The in-memory fallback is deliberately
// NON-PERSISTENT: there is no secure storage off-device, so "session
// doesn't survive the process" is the correct behaviour there.

// Keep a margin below the 2048-byte cap. UTF-8 chars are 1–4 bytes;
// 1800 chars is safe even if every char is multi-byte (worst case ~7KB
// would still fit, but the SecureStore native module measures *bytes*
// not chars, so the real headroom is generous).
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function clearChunksFrom(key: string, startIndex: number): Promise<void> {
  // Walk forward and delete any chunk keys that might exist from a
  // previous longer write. We stop at the first miss — SecureStore
  // doesn't have a "list keys" API, so we rely on the invariant that
  // chunks are contiguous starting from 0.
  let i = startIndex;
  // Hard cap to avoid an infinite loop if something pathological
  // happened (shouldn't, but defense in depth — Supabase sessions
  // never approach 100 chunks).
  while (i < 200) {
    const ck = chunkKey(key, i);
    const existing = await SecureStore.getItemAsync(ck);
    if (existing === null) return;
    await SecureStore.deleteItemAsync(ck);
    i += 1;
  }
}

// The native, hardware-backed chunked adapter. Used verbatim on-device;
// its chunking semantics, atomic count-last write, and orphan cleanup are
// unchanged. Only the *selection* between this and the in-memory fallback
// is new.
const nativeSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(key);
    if (countRaw === null) return null;
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk === null) {
        // Chunk gone missing — treat as absent rather than returning
        // half a JSON blob and crashing the auth client.
        return null;
      }
      parts.push(chunk);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Write chunks first.
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    // Clear any leftover chunks from a previous larger write.
    await clearChunksFrom(key, chunks.length);
    // Commit the count last — atomic enough for our purposes; if the
    // process dies before this line, getItem sees the missing count
    // key and returns null, so we can't read a torn value.
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(key);
    // Delete the count key first so a concurrent reader sees "absent"
    // immediately, even if the chunk cleanup races.
    await SecureStore.deleteItemAsync(key);
    if (countRaw === null) return;
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1) return;
    for (let i = 0; i < count; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    // Also clear any orphan chunks past the recorded count.
    await clearChunksFrom(key, count);
  },
};

// Non-persistent, process-local fallback for Node/web evaluation contexts
// where the native SecureStore module is unavailable (see the top-of-file
// note). No chunking is needed — there's no 2KB per-value cap in a plain
// `Map`, so whole values are stored directly. This implements the same
// `getItem`/`setItem`/`removeItem` contract Supabase's `Storage` expects
// and, critically, never throws due to a missing native function.
const memoryStore = new Map<string, string>();
const inMemoryStorage = {
  async getItem(key: string): Promise<string | null> {
    return memoryStore.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
  },
};

// A missing native bridge surfaces as a `TypeError` whose message matches
// `… is not a function` (e.g. "ExpoSecureStore.getValueWithKeyAsync is not
// a function"). That — and ONLY that — is the signal that we're running
// off-device and should latch to the in-memory fallback. Every other error
// is a genuine on-device SecureStore failure that must propagate.
function isMissingNativeModuleError(e: unknown): boolean {
  return e instanceof TypeError && /is not a function/.test(e.message);
}

// Latch: `true` on native platforms until a call proves the bridge is
// absent; `false` immediately on web (no secure store exists there).
let nativeUsable = Platform.OS !== "web";

// Emit the "no secure persistence, using in-memory fallback" dev warning
// exactly once, so a future misconfiguration that silently drops device
// persistence is loud rather than invisible.
let warnedFallback = false;
function warnFallbackOnce(): void {
  if (warnedFallback) return;
  warnedFallback = true;
  if (__DEV__) {
    console.warn(
      "[secure-storage] Native SecureStore is unavailable; using a " +
        "process-local, NON-PERSISTENT in-memory fallback. Auth sessions " +
        "will NOT survive a restart. Expected under Node (typed-route gen) " +
        "and web; on a real device this indicates a misconfiguration.",
    );
  }
}

// Warn eagerly when we already know at load time there's no secure store
// (web). The native→missing case warns from the latch in `run` below.
if (!nativeUsable) warnFallbackOnce();

/**
 * Runs one storage operation against the native chunked adapter, falling
 * back to the in-memory store when the native bridge is absent.
 *
 * The latch (`nativeUsable`) is the authoritative availability signal: it
 * starts optimistic on native platforms and flips off the first time a
 * native call throws the missing-module `TypeError`. Once off, it stays
 * off — every subsequent call goes straight to memory without retrying the
 * (known-broken) native path. Genuine native failures are re-thrown.
 */
async function run<T>(
  nativeOp: () => Promise<T>,
  memoryOp: () => Promise<T>,
): Promise<T> {
  if (!nativeUsable) return memoryOp();
  try {
    return await nativeOp();
  } catch (e) {
    if (isMissingNativeModuleError(e)) {
      nativeUsable = false;
      warnFallbackOnce();
      return memoryOp();
    }
    // Genuine on-device SecureStore error (biometric cancel, access
    // denied, etc.) — propagate unchanged.
    throw e;
  }
}

/**
 * The `Storage` implementation Supabase uses to persist the auth session.
 * On-device it drives the native chunked Keychain/Keystore adapter; when
 * the native bridge turns out to be absent (Node typed-route gen / web
 * bundle) it latches to a non-persistent in-memory `Map` so the eager
 * client construction in `supabase.ts` can't crash the module graph
 * off-native — without ever masking a real on-device SecureStore error.
 */
export const secureStorage = {
  getItem(key: string): Promise<string | null> {
    return run(
      () => nativeSecureStorage.getItem(key),
      () => inMemoryStorage.getItem(key),
    );
  },
  setItem(key: string, value: string): Promise<void> {
    return run(
      () => nativeSecureStorage.setItem(key, value),
      () => inMemoryStorage.setItem(key, value),
    );
  },
  removeItem(key: string): Promise<void> {
    return run(
      () => nativeSecureStorage.removeItem(key),
      () => inMemoryStorage.removeItem(key),
    );
  },
};
